import { setValue, appState } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { registerAction } from '../actions/registry.js'
import { ACTIONS } from '../actions/names.js'
import { pushDecision, botDecisions, toggleMasterArm } from './runner.js'

/**
 * Dry run, the session report, and the hard stop.
 *
 * Three things that only make sense together: a way to watch the bot decide without letting
 * it spend, a record of what it did decide, and one call that stops it dead.
 *
 * **Dry run is the default**, and that is the whole opinion of this module. Software that
 * places orders should have to be *switched* into doing so, and the switch should be a
 * moment the trader remembers. Going live is logged as its own entry for exactly that
 * reason.
 *
 * The dry-run accounting is deliberately identical to the live path — the same gates, the
 * same throttle stamps, the same caps. A rehearsal that skipped the counters would predict
 * numbers the live run does not produce, which is worse than no rehearsal at all, because
 * it would be believed.
 */

/** A fresh session's counters. */
export function emptySession(now = 0) {
  return { signals: 0, orders: 0, dry: 0, blocked: 0, startedAt: Number(now) || 0 }
}

let session = emptySession(0)
let dryOrders = []

/**
 * Is the bot rehearsing?
 *
 * @param {object} [state] - the settings slice.
 * @returns {boolean} true when no order may reach a venue.
 */
export function isDryRun(state = appState?.settings) {
  // Defaults to *true* when unset, unlike every other boolean here. An undefined flag must
  // mean "do not spend money", never "go ahead".
  return state?.botDryRun !== false
}

/**
 * Record an order the bot would have placed.
 *
 * @param {object} order - the mapped order.
 * @param {number} now - the current time.
 * @returns {object} the logged entry.
 */
export function logDryOrder(order, now) {
  const entry = { ...order, ts: Number(now) || 0, dry: true }
  dryOrders = [...dryOrders, entry].slice(-200)
  session = { ...session, dry: session.dry + 1 }

  return entry
}

/**
 * Every order the rehearsal would have sent.
 *
 * @returns {object[]} the entries.
 */
export function dryRunOrders() {
  return dryOrders
}

/**
 * Send an order, or record it.
 *
 * @param {object} order - the mapped order.
 * @param {{send?: Function, now?: number, dry?: boolean}} [options] - plumbing.
 * @returns {Promise<object>} the result.
 */
export async function dispatchOrDry(order, options = {}) {
  const dry = options.dry ?? isDryRun()
  const now = Number(options.now) || 0

  if (dry) {
    logDryOrder(order, now)
    // Shaped exactly like a live result so nothing downstream has to know which path ran.
    // A caller that branched on the shape would be a second place dry-run behaviour lives.
    return { ok: true, clientId: `dry-${session.dry}`, reason: 'dry run' }
  }

  session = { ...session, orders: session.orders + 1 }
  return typeof options.send === 'function' ? options.send(order) : { ok: false, reason: 'no venue' }
}

/**
 * Count a signal the bot saw.
 *
 * @param {boolean} passed - whether it survived the gates.
 * @returns {object} the counters.
 */
export function countSignal(passed) {
  session = {
    ...session,
    signals: session.signals + 1,
    blocked: passed ? session.blocked : session.blocked + 1,
  }

  return session
}

/**
 * The session's counters.
 *
 * @returns {object} the counters.
 */
export function botSession() {
  return session
}

/**
 * Publish the funnel.
 *
 * @returns {object} what was published.
 */
export function refreshSession() {
  const published = {
    ...session,
    // The conversion is the number worth looking at: a bot seeing four hundred signals and
    // placing two is either well-gated or broken, and the ratio is where that conversation
    // starts.
    conversion: session.signals > 0 ? Number(((session.orders + session.dry) / session.signals).toFixed(3)) : 0,
  }

  setValue(PATHS.bot.session, published)
  return published
}

/**
 * Start a fresh session.
 *
 * @param {number} now - the current time.
 * @returns {object} the empty counters.
 */
export function resetSession(now) {
  session = emptySession(now)
  dryOrders = []
  return refreshSession()
}

/**
 * Flip between rehearsal and live.
 *
 * @param {boolean} [next] - the mode to move to; omit to toggle.
 * @param {number} [now] - the current time.
 * @returns {boolean} true when the bot is now in dry run.
 */
export function toggleDryRun(next, now = 0) {
  const dry = typeof next === 'boolean' ? next : !isDryRun()
  setValue(PATHS.settings.botDryRun, dry)

  // Going live is its own logged moment. Software that places orders should have to be
  // switched into doing so, and the switch should be one the trader remembers.
  pushDecision({
    ts: Number(now) || 0,
    strategy: 'desk',
    action: dry ? 'DRY RUN' : 'LIVE MODE',
    taken: !dry,
    reason: dry ? 'orders are recorded, not sent' : 'orders will reach the venue',
  })

  return dry
}

/**
 * Stop the bot dead.
 *
 * @param {{stop?: Function, now?: number, reason?: string}} [options] - plumbing.
 * @returns {boolean} true.
 */
export function hardStop(options = {}) {
  const now = Number(options.now) || 0

  // The loop first, then the arm flag. Stopping the interval before disarming means no
  // drain can start between the two — the order here is the whole guarantee.
  options.stop?.()
  toggleMasterArm(false, now)

  pushDecision({
    ts: now,
    strategy: 'desk',
    action: 'KILLED',
    taken: false,
    reason: String(options.reason ?? 'hard stop'),
  })

  return true
}

/**
 * The session as a portable report.
 *
 * @returns {object} the report.
 */
export function sessionReport() {
  return {
    session: refreshSession(),
    // The decisions travel with the counters: a funnel without the reasons is a number
    // nobody can act on.
    decisions: botDecisions(),
    dryOrders,
  }
}

/**
 * Register the session actions.
 *
 * @returns {string} the dry-run action's name.
 */
export function registerSessionActions() {
  registerAction(ACTIONS.bot.toggleDry, (_state, payload) =>
    toggleDryRun(typeof payload?.value === 'boolean' ? payload.value : undefined, Date.now()),
  )
  registerAction(ACTIONS.bot.resetSession, () => resetSession(Date.now()))

  return ACTIONS.bot.toggleDry
}
