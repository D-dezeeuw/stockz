import { setValue, appState } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { registerAction } from '../actions/registry.js'
import { ACTIONS } from '../actions/names.js'
import { currentThresholds, trippedCode } from './core.js'
import { rearm } from './kill.js'
import { TRIP_REASONS } from './codes.js'
import { logBreakerEvent } from './log.js'

/**
 * Getting back in.
 *
 * The one place on this desk where a deliberate gesture is right, and it is worth being
 * precise about why, because everything else here is built to remove exactly this kind of
 * friction. Stopping is fast and unguarded: a kill switch that asks is not one. **Starting
 * again is the asymmetric direction** — a mis-click that halts costs a trader thirty
 * seconds, and a mis-click that un-halts hands the market back the account that just
 * tripped a limit protecting it.
 *
 * So: a one-second hold. Not a dialog, not a checkbox, not a typed confirmation — nothing
 * to read and nothing to click through, which is what makes a confirmation useless. Press
 * and keep pressing. The ring fills, and letting go early simply cancels it.
 *
 * What it does **not** clear is as important. The day's P&L and the loss streak survive the
 * re-arm, so the limits still bind and a trader who re-arms into an already-blown day is
 * refused rather than briefly allowed. The bot stays off: re-arming the desk is a statement
 * about the human being ready, and it says nothing whatsoever about the robot.
 */

/** How long the press has to last. */
export const HOLD_MS = 1000

/** When the current press started, or null for no press. Null rather than zero: a
 *  monotonic clock reads near zero early in the page's life, and a sentinel that a real
 *  timestamp can equal is a press that silently never starts. */
let holdFrom = null

/**
 * Is the limit that tripped still breached?
 *
 * @param {{dayPnl?: number}} [sources] - injectable state.
 * @returns {{over: boolean, reason: string}} the verdict.
 */
export function stillOverLimit(sources = {}) {
  const dayPnl = Number(sources.dayPnl ?? appState.breaker?.dayPnl) || 0
  const floor = currentThresholds().dayLossFloor
  // Re-checked at the moment of re-arming rather than trusted from the trip: a desk that
  // let the trader back in under a limit still breached would trip again on their first
  // order, which reads as a broken breaker rather than a working one.
  if (!Number.isFinite(floor) || dayPnl > floor) return { over: false, reason: '' }

  return { over: true, reason: `still past the daily limit (${dayPnl})` }
}

/**
 * Begin a press.
 *
 * @param {number} now - the current time.
 * @returns {number} the start time.
 */
export function startHold(now) {
  holdFrom = Number(now)
  if (!Number.isFinite(holdFrom)) holdFrom = 0
  setValue(PATHS.breaker.holdPct, 0)

  return holdFrom
}

/**
 * How far through the press we are.
 *
 * @param {number} now - the current time.
 * @returns {number} 0..1.
 */
export function armHoldProgress(now) {
  if (holdFrom === null) return 0

  const elapsed = (Number(now) || 0) - holdFrom
  const pct = Number(Math.min(1, Math.max(0, elapsed / HOLD_MS)).toFixed(3))
  setValue(PATHS.breaker.holdPct, pct)

  return pct
}

/**
 * Let go without finishing.
 *
 * @returns {boolean} true when a press was abandoned.
 */
export function cancelHold() {
  if (holdFrom === null) return false

  holdFrom = null
  setValue(PATHS.breaker.holdPct, 0)

  return true
}

/**
 * Whether a press is in progress.
 *
 * @returns {number|null} the press start, or null.
 */
export function holdState() {
  return holdFrom
}

/**
 * One frame of the press.
 *
 * @param {number} now - the current time.
 * @returns {{pct: number, done: boolean}} where the press got to.
 */
export function holdFrame(now) {
  const pct = armHoldProgress(now)
  if (pct < 1) return { pct, done: false }

  // The press completing *is* the re-arm. Requiring a release as well would mean a trader
  // holding the button for two seconds — the obvious way to be sure — never re-armed.
  cancelHold()
  rearmDesk(now)

  return { pct: 1, done: true }
}

/**
 * Keep asking for frames until the press finishes or is let go.
 *
 * @param {{raf?: Function, clock?: () => number}} [deps] - injectable plumbing.
 * @returns {boolean} true when this call completed the press.
 */
export function holdLoop(deps = {}) {
  const raf = deps.raf ?? globalThis.requestAnimationFrame?.bind(globalThis)
  const clock = deps.clock ?? (() => Date.now())

  // Driven by frames rather than a timeout, so the ring is drawn from the same clock that
  // draws it: a setTimeout(1000) would finish while the ring still showed 80%.
  if (holdState() === null) return false
  if (holdFrame(clock()).done) return true
  if (typeof raf === 'function') raf(() => holdLoop(deps))

  return false
}

/**
 * Clear the halt, if the limit allows it.
 *
 * @param {number} [now] - the current time.
 * @returns {boolean} true when the desk is trading again.
 */
export function rearmDesk(now = 0) {
  const prior = trippedCode()
  const blocked = stillOverLimit()
  if (blocked.over) {
    setValue(PATHS.breaker.reason, `${TRIP_REASONS[prior] ?? 'halted'} — ${blocked.reason}`)
    return false
  }

  const cleared = rearm(Number(now) || 0)
  if (!cleared) return false

  // The record, for the log: what it was and when it was cleared. "Why is the desk running
  // after that drawdown" is a question asked hours later, and a re-arm nobody can point at
  // is indistinguishable from a breaker that never fired.
  setValue(PATHS.breaker.lastRearm, { ts: Number(now) || 0, priorCode: prior })
  logBreakerEvent({ kind: 'rearm', code: prior, ts: Number(now) || 0, values: { priorCode: prior } })

  return true
}

/**
 * Cancel the press wherever the finger comes up.
 *
 * @param {Window} [win] - the window to listen on.
 * @returns {() => void} unsubscribe.
 */
export function mountRelease(win = globalThis.window) {
  if (!win?.addEventListener) return () => {}

  const onRelease = () => cancelHold()
  // On the window rather than the button: a finger that slides off the control before
  // lifting would otherwise leave the press running with nothing pressed, and the ring
  // would fill under a hand that had already let go.
  win.addEventListener('pointerup', onRelease)
  win.addEventListener('pointercancel', onRelease)

  return () => {
    win.removeEventListener?.('pointerup', onRelease)
    win.removeEventListener?.('pointercancel', onRelease)
  }
}

/**
 * Register the hold actions.
 *
 * @param {{raf?: Function, clock?: () => number}} [deps] - injectable plumbing.
 * @returns {string[]} the registered action names.
 */
export function registerRearmActions(deps = {}) {
  const clock = deps.clock ?? (() => Date.now())

  registerAction(ACTIONS.breaker.hold, () => {
    startHold(clock())
    holdLoop(deps)

    return true
  })
  registerAction(ACTIONS.breaker.release, () => cancelHold())
  // Bound here rather than beside the kill: the guarded re-arm is the only one anything
  // should be able to reach, and leaving the unguarded primitive registered would make the
  // still-over-limit check optional.
  registerAction(ACTIONS.breaker.rearm, () => rearmDesk(Date.now()))

  return [ACTIONS.breaker.hold, ACTIONS.breaker.release, ACTIONS.breaker.rearm]
}
