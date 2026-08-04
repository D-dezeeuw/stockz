import { setValue, watch, appState } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { openPositions } from '../positions/store.js'
import { cancelAll } from '../ticket/shortcuts.js'
import { flattenAll } from '../positions/flatten.js'
import { killBot } from '../bot/runner.js'
import { TRIP } from './codes.js'

/**
 * What a trip actually does.
 *
 * One trip wipes the slate: every working order cancelled, every position flat, every bot
 * off. The sequence is not arbitrary and is the whole reason this lives in one function
 * rather than at each call site.
 *
 * **Disarm, cancel, flatten** — in that order, all three dispatched in the same synchronous
 * turn. Disarming first stops the loop from adding to the pile being cleaned up. Cancelling
 * before flattening removes the working orders that could fill *while* the flatten is going
 * out; the other order leaves a resting bid to fill behind the close and hand the trader a
 * fresh position opened by the safety mechanism itself.
 *
 * Nothing here is awaited. Both venue calls are network round trips, and a wipe whose speed
 * depends on the venue that is probably the reason it fired is not a wipe. The retry is
 * exactly one pass: a loop would keep firing cancels into a venue already refusing them, at
 * the worst possible moment to be generating load.
 *
 * Not every code wipes. A losing streak pauses entries and leaves the book alone — the
 * trader is having a bad run, not an emergency, and flattening their open positions over it
 * would realise losses they never asked to take.
 */

/** What each trip code does. */
export const TRIP_ACTIONS = Object.freeze({
  [TRIP.DAILY_LOSS]: Object.freeze({ wipe: true, disarm: true }),
  // Never trips — a cap breach blocks the one order. Mapped so the absence is deliberate
  // rather than a hole somebody fills in later by accident.
  [TRIP.POSITION]: Object.freeze({ wipe: false, disarm: false }),
  [TRIP.LOSS_STREAK]: Object.freeze({ wipe: false, disarm: true }),
  [TRIP.KILL]: Object.freeze({ wipe: true, disarm: true }),
})

/** The default: an unknown code does nothing rather than something drastic. */
const NO_ACTION = Object.freeze({ wipe: false, disarm: false })

/** True while a wipe is out. Guards against two sources tripping the same reaction. */
let inFlight = false

/** Instruments the flatten has been sent for but which are not flat yet. */
let pending = []

/**
 * What a trip code should do.
 *
 * @param {number} code - a TRIP code.
 * @returns {{wipe: boolean, disarm: boolean}} the action.
 */
export function actionFor(code) {
  return TRIP_ACTIONS[Number(code)] ?? NO_ACTION
}

/**
 * Run a task, and on failure run it once more after a pause.
 *
 * @param {Function} task - the venue call.
 * @param {{delay?: number, timer?: Function}} [deps] - injectable plumbing.
 * @returns {Promise<unknown>} the outcome of whichever attempt settled.
 */
export function retryOnce(task, deps = {}) {
  const { delay = 500, timer = globalThis.setTimeout } = deps

  let first
  // Called synchronously, not off a microtask: the first attempt has to leave in the same
  // turn as the press, and the cancel/flatten ordering depends on it.
  try {
    first = Promise.resolve(task())
  } catch (error) {
    first = Promise.reject(error)
  }

  return first.catch(
    () =>
      new Promise((resolve) => {
        // Exactly one more pass, then the failure stands and the pending list shows it.
        // Retry loops here would hammer a venue that is already refusing, which is both
        // useless and the last thing a struggling venue needs.
        timer(
          () =>
            resolve(
              Promise.resolve()
                .then(() => task())
                .catch((error) => ({ ok: false, error })),
            ),
          Number(delay) || 0,
        )
      }),
  )
}

/**
 * Mark the instruments a flatten has been sent for.
 *
 * @param {object[]} [positions] - the open positions.
 * @returns {string[]} the pending instruments.
 */
export function markPending(positions = openPositions()) {
  pending = (Array.isArray(positions) ? positions : [])
    .map((position) => String(position?.instrument ?? position?.key ?? ''))
    .filter(Boolean)

  setValue(PATHS.breaker.flattenPending, [...pending])
  return pending
}

/**
 * Drop an instrument from the pending list once it is actually flat.
 *
 * @param {string} instrument - the instrument now closed.
 * @returns {string[]} what is still outstanding.
 */
export function clearPending(instrument) {
  if (pending.length === 0) return pending

  const symbol = String(instrument ?? '')
  const left = pending.filter((held) => held !== symbol && !held.endsWith(`:${symbol}`))
  if (left.length === pending.length) return pending

  pending = left
  // Published from the module's own list rather than read back from state: two closes in
  // one frame would otherwise both read the pre-frame array and the first would be lost.
  setValue(PATHS.breaker.flattenPending, [...pending])

  return pending
}

/**
 * Drop everything from the pending list that is no longer open.
 *
 * @param {object[]} [positions] - the open positions.
 * @returns {string[]} what is still outstanding.
 */
export function reconcilePending(positions = openPositions()) {
  if (pending.length === 0) return pending

  const open = new Set(
    (Array.isArray(positions) ? positions : []).map((position) =>
      String(position?.instrument ?? position?.key ?? ''),
    ),
  )
  const left = pending.filter((held) => open.has(held))
  if (left.length === pending.length) return pending

  pending = left
  setValue(PATHS.breaker.flattenPending, [...pending])

  return pending
}

/**
 * What the flatten has not finished closing.
 *
 * @returns {string[]} the outstanding instruments.
 */
export function pendingInstruments() {
  return pending
}

/**
 * Wipe the slate for a trip.
 *
 * @param {number} code - the trip code.
 * @param {{disarm?: Function, cancel?: Function, flatten?: Function, now?: number,
 *   delay?: number, timer?: Function}} [deps] - injectable plumbing.
 * @returns {{ran: boolean, disarmed: boolean, cancelled: boolean, flattened: boolean}} what
 *   was dispatched.
 */
export function executeTripAction(code, deps = {}) {
  const action = actionFor(code)
  const { disarm = killBot, cancel = cancelAll, flatten = flattenAll, now = 0 } = deps

  // Guarded on the flag rather than fired blind: a trip disarms the bot itself, first and
  // synchronously, and a second unconditional disarm would announce it twice and push the
  // halt alert — the one that says why the desk stopped — off the top of the log. The call
  // stays here so the orchestrator is still correct when something else invokes it.
  if (action.disarm && appState.settings?.botArmed === true) disarm('breaker trip', Number(now) || 0)
  // Checked and set synchronously, before anything async can interleave: a hotkey and a
  // watch firing on the same trip must not flatten the book twice.
  if (!action.wipe || inFlight) {
    return { ran: false, disarmed: action.disarm === true, cancelled: false, flattened: false }
  }
  inFlight = true

  markPending(deps.positions)

  // Dispatched, never awaited, and cancel goes first — see the module note.
  const wipe = [retryOnce(() => cancel(), deps), retryOnce(() => flatten(), deps)]
  Promise.allSettled(wipe).then(() => {
    inFlight = false
  })

  return { ran: true, disarmed: true, cancelled: true, flattened: true }
}

/**
 * Run the wipe whenever the breaker latches.
 *
 * @param {object} [deps] - injectable plumbing for the wipe.
 * @returns {Function} the watcher.
 */
export function watchTrip(deps = {}) {
  const watcher = (state) => {
    const code = Number(state?.breaker?.tripped) || TRIP.NONE
    if (code !== TRIP.NONE) executeTripAction(code, deps)
  }

  // The daily-loss trip has no other reaction path: it publishes a code and returns a
  // rejection, and without this the desk would halt with its orders still resting.
  watch([PATHS.breaker.tripped], watcher)

  return watcher
}

/**
 * Clear the pending marks as the positions actually go flat.
 *
 * @returns {Function} the watcher.
 */
export function watchPending() {
  const watcher = (state) => reconcilePending(state?.trade?.positions)

  // Driven off the published book rather than a call inside the store, because the store
  // sits below this module: a safety feature reaching down into the position book to be
  // told about itself is the coupling that makes the book impossible to test alone.
  watch([PATHS.trade.positions], watcher)

  return watcher
}

/**
 * Forget the in-flight guard and the pending list.
 *
 * @returns {boolean} true.
 */
export function resetTrip() {
  inFlight = false
  pending = []
  setValue(PATHS.breaker.flattenPending, [])

  return true
}
