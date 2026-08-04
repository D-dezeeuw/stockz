import { setValue } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { registerAction } from '../actions/registry.js'
import { ACTIONS } from '../actions/names.js'
import { tripBreaker, resetBreaker, TRIP } from './core.js'
import { clearPause } from './position.js'
import { executeTripAction, resetTrip } from './trip.js'

/**
 * The kill switch, and what a trip actually does.
 *
 * One press. No confirmation, no second click, no "type KILL to continue". The entire
 * value of this control is that it is faster than thinking, and every step between the
 * press and the effect is a step during which the market keeps moving.
 *
 * The order of the reaction is not arbitrary and is worth stating: **cancel, then flatten,
 * then disarm.** Cancelling first removes the working orders that could fill *while* the
 * flatten is going out — flatten first and a resting bid can fill behind the close and
 * leave the trader in a fresh position created by the safety mechanism. Disarming last is
 * safe because the bot was already killed synchronously by the trip itself.
 */

/**
 * Pull the kill switch.
 *
 * @param {{now?: number, source?: string, cancel?: Function, flatten?: Function}} [options] -
 *   plumbing.
 * @returns {boolean} true when this press was the one that tripped it.
 */
export function killSwitch(options = {}) {
  const tripped = tripBreaker(TRIP.KILL, { source: String(options.source ?? 'manual') }, options)
  // Idempotent behind the same latch as every other trip: a trader hammering the button in
  // a panic must not fire the flatten path six times.
  if (!tripped) return false

  tripAction(options)
  return true
}

/**
 * Cancel, flatten, disarm — in that order.
 *
 * Dispatched, never awaited. Both venue calls are async, and a kill switch that waited on
 * a network round trip before doing the next thing would be a kill switch whose speed
 * depends on the venue that is probably the reason it was pressed.
 *
 * @param {{cancel?: Function, flatten?: Function, now?: number}} [options] - plumbing.
 * @returns {{cancelled: boolean, flattened: boolean}} what was dispatched.
 */
export function tripAction(options = {}) {
  // Delegated rather than duplicated: two wipe implementations would drift, and the one
  // that drifts is the one nobody exercises until the day it matters.
  const wiped = executeTripAction(TRIP.KILL, options)

  return { cancelled: wiped.cancelled, flattened: wiped.flattened }
}

/**
 * How long the kill took to reach the first cancel.
 *
 * @param {number} pressedAt - when the button was pressed.
 * @param {number} firstAction - when the first cancel went out.
 * @returns {number} the latency in ms.
 */
export function killLatency(pressedAt, firstAction) {
  const from = Number(pressedAt)
  const to = Number(firstAction)
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return 0

  const ms = Number((to - from).toFixed(3))
  setValue(PATHS.breaker.killLatencyMs, ms)

  return ms
}

/**
 * Clear a halt and let the desk trade again.
 *
 * @param {number} [now] - the current time.
 * @returns {boolean} true when something was cleared.
 */
export function rearm(now = 0) {
  // Both, always. A desk that cleared the trip but stayed paused would look armed and
  // refuse every entry, which is the most confusing state available.
  const cleared = resetBreaker(now)
  const unpaused = clearPause()
  // And the wipe's own guard, or the next kill would find a stale in-flight flag and
  // dispatch nothing at all.
  if (cleared) resetTrip()

  return cleared || unpaused
}

/**
 * Register the kill and re-arm actions.
 *
 * @returns {string} the kill action's name.
 */
export function registerKillActions() {
  registerAction(ACTIONS.breaker.kill, (_state, payload) => {
    const pressedAt = globalThis.performance?.now?.() ?? 0
    const fired = killSwitch({ now: Date.now(), source: String(payload?.source ?? 'button') })
    killLatency(pressedAt, globalThis.performance?.now?.() ?? pressedAt)

    return fired
  })
  registerAction(ACTIONS.breaker.rearm, () => rearm(Date.now()))

  return ACTIONS.breaker.kill
}
