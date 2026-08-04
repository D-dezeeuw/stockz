import { setValue, appState } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { emitAlert } from '../alerts/bus.js'
import { killBot } from '../bot/runner.js'

/**
 * The circuit breakers.
 *
 * The one safety net on a desk built entirely around not slowing the trader down. Which
 * means the rule that shapes this whole module: **a breaker never asks.**
 *
 * There is no confirm dialog, no "are you sure", no modal in the order path. Not because
 * dialogs are unfashionable — because a breaker that asks is a breaker that gets clicked
 * through at exactly the moment it was built for. The trip is a state change and a
 * rejection object; the trader finds out because the desk stopped, and stopping is the
 * whole feature.
 *
 * The check itself is primitive comparisons against a **cached** threshold object. Nothing
 * here reads settings, walks a list, or allocates: it runs on every order on a desk whose
 * pitch is sub-100ms, and a safety net that cost a millisecond would be a safety net people
 * turn off.
 *
 * The latch matters as much as the check. One trip fires exactly one reaction — cancel,
 * flatten, disarm — and a second trip while already tripped changes nothing. Without it a
 * failing market would fire the flatten path forty times a second.
 */

/** Why the desk stopped. Numeric because this is compared on the hot path. */
export const TRIP = Object.freeze({
  NONE: 0,
  DAILY_LOSS: 1,
  POSITION: 2,
  LOSS_STREAK: 3,
  KILL: 4,
})

/** What each code says out loud. */
export const TRIP_REASONS = Object.freeze({
  [TRIP.DAILY_LOSS]: 'daily loss limit',
  [TRIP.POSITION]: 'position limit',
  [TRIP.LOSS_STREAK]: 'losing streak',
  [TRIP.KILL]: 'kill switch',
})

/**
 * The thresholds, flat and pre-computed.
 *
 * Rebuilt from a watch on settings rather than read per order. The daily loss is stored
 * **pre-negated** so the hot path is one `<=` rather than a negation and a compare.
 */
let thresholds = { dayLossFloor: -Infinity, maxPosition: Infinity, maxLossStreak: Infinity }

/** True once tripped, until explicitly reset. */
let tripped = TRIP.NONE

/**
 * Copy the breaker settings into the flat cache.
 *
 * @param {object} [state] - the settings slice.
 * @returns {object} the thresholds now in force.
 */
export function refreshThresholds(state = appState?.settings) {
  const dailyLoss = Number(state?.maxDailyLoss)
  const maxPosition = Number(state?.maxPosition)
  const streak = Number(state?.botCooldownAfter)

  thresholds = {
    // Pre-negated: `dayPnl <= dayLossFloor` is the whole check, with no arithmetic in it.
    dayLossFloor: Number.isFinite(dailyLoss) && dailyLoss > 0 ? -dailyLoss : -Infinity,
    maxPosition: Number.isFinite(maxPosition) && maxPosition > 0 ? maxPosition : Infinity,
    maxLossStreak: Number.isFinite(streak) && streak > 0 ? streak : Infinity,
  }

  return thresholds
}

/**
 * The thresholds currently cached.
 *
 * @returns {object} the cache.
 */
export function currentThresholds() {
  return thresholds
}

/**
 * The whole hot-path check.
 *
 * @param {{dayPnl?: number, position?: number, lossStreak?: number}} ctx - live numbers.
 * @returns {number} a TRIP code, or TRIP.NONE.
 */
export function checkBreakers(ctx) {
  // Already tripped short-circuits everything: the desk is stopped, and re-deciding why on
  // every subsequent order is work with no possible new answer.
  if (tripped !== TRIP.NONE) return tripped

  const dayPnl = Number(ctx?.dayPnl) || 0
  if (dayPnl <= thresholds.dayLossFloor) return TRIP.DAILY_LOSS

  const position = Math.abs(Number(ctx?.position) || 0)
  if (position > thresholds.maxPosition) return TRIP.POSITION

  const streak = Number(ctx?.lossStreak) || 0

  return streak >= thresholds.maxLossStreak ? TRIP.LOSS_STREAK : TRIP.NONE
}

/**
 * Whether the desk is currently stopped.
 *
 * @returns {number} the live trip code.
 */
export function trippedCode() {
  return tripped
}

/**
 * Trip the breaker, once.
 *
 * @param {number} code - a TRIP code.
 * @param {object} [values] - the numbers that caused it.
 * @param {{now?: number, kill?: Function}} [options] - plumbing.
 * @returns {boolean} true when this call was the one that tripped it.
 */
export function tripBreaker(code, values = {}, options = {}) {
  const trip = Number(code) || TRIP.NONE
  // The latch. A second trip while already tripped changes nothing — without it a failing
  // market fires the flatten path forty times a second.
  if (trip === TRIP.NONE || tripped !== TRIP.NONE) return false

  tripped = trip
  const reason = TRIP_REASONS[trip] ?? 'breaker'
  const now = Number(options.now) || 0

  setValue(PATHS.breaker.tripped, trip)
  setValue(PATHS.breaker.reason, reason)
  setValue(PATHS.breaker.at, now)
  setValue(PATHS.breaker.values, { ...values })

  // The bot goes first and synchronously. Anything that queues the disarm leaves a window
  // in which the loop can place one more order, and "one more" is the order the breaker
  // existed to prevent.
  const kill = typeof options.kill === 'function' ? options.kill : killBot
  kill(`breaker: ${reason}`, now)

  emitAlert(
    {
      key: 'breaker|trip',
      source: 'breaker',
      kind: 'trip',
      severity: 'error',
      text: `TRADING HALTED — ${reason}`,
      ts: now,
    },
    { debounceMs: 0 },
  )

  return true
}

/**
 * Clear the breaker.
 *
 * @param {number} [now] - the current time.
 * @returns {boolean} true when something was cleared.
 */
export function resetBreaker(now = 0) {
  if (tripped === TRIP.NONE) return false

  tripped = TRIP.NONE
  setValue(PATHS.breaker.tripped, TRIP.NONE)
  setValue(PATHS.breaker.reason, '')
  setValue(PATHS.breaker.at, 0)

  // Announced, not silent. Resuming after a halt is a decision, and the record of the day
  // should show it was made rather than that the halt simply stopped mattering.
  emitAlert(
    {
      key: 'breaker|reset',
      source: 'breaker',
      kind: 'reset',
      severity: 'warn',
      text: 'breaker cleared — trading resumed',
      ts: Number(now) || 0,
    },
    { debounceMs: 0 },
  )

  return true
}

/**
 * The rejection an order gets when the desk is stopped.
 *
 * @param {number} code - the trip code.
 * @returns {{ok: boolean, reason: string}} the refusal.
 */
export function breakerRejection(code) {
  const reason = TRIP_REASONS[Number(code)] ?? 'breaker'

  // A rejection object, never a dialog. A breaker that asks is a breaker that gets clicked
  // through at exactly the moment it was built for.
  return { ok: false, clientId: '', reason: `halted — ${reason}` }
}
