import { setValue, appState } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { grossExposure } from '../positions/store.js'
import { currentThresholds } from './core.js'
import { pauseState } from './position.js'
import { TRIP } from './codes.js'

/**
 * The breaker lights.
 *
 * Three dots in the header answering the only question a trader asks between trades: how
 * much room is left. A number would be more precise and worse — precision is what you read
 * when you have decided to look, and these have to work when nobody is looking at them.
 *
 * Orange arrives at **80%** of the limit, fixed rather than configurable. A warning
 * threshold that is a setting is a warning threshold that gets moved to 99% by the person
 * who found it annoying, and the point of the light is to arrive with room left to react.
 */

/** Where orange starts. Not a setting, on purpose. */
export const WARN_AT = 0.8

/**
 * One light's colour.
 *
 * @param {number} pct - 0..1 of the limit consumed.
 * @param {boolean} [tripped] - whether this breaker has fired.
 * @returns {string} 'ok', 'warn' or 'tripped'.
 */
export function ledStateFor(pct, tripped = false) {
  if (tripped === true) return 'tripped'

  const used = Number(pct)
  if (!Number.isFinite(used) || used < WARN_AT) return 'ok'

  return used >= 1 ? 'tripped' : 'warn'
}

/**
 * How much of the position cap is used.
 *
 * @param {number} [exposure] - the gross exposure.
 * @param {number} [cap] - the cap.
 * @returns {number} 0..1.
 */
export function exposurePct(exposure = grossExposure(), cap = currentThresholds().maxPosition) {
  const limit = Number(cap)
  // An unset cap consumes nothing. A percentage of Infinity is a light that would sit at
  // zero forever and teach the eye to ignore the dot.
  if (!Number.isFinite(limit) || limit <= 0) return 0

  return Number(Math.min(1, Math.abs(Number(exposure) || 0) / limit).toFixed(4))
}

/**
 * How much of the streak allowance is used.
 *
 * @param {number} [streak] - the consecutive losses.
 * @param {number} [limit] - the trader's limit.
 * @returns {number} 0..1.
 */
export function streakPct(streak = pauseState().streak, limit = appState.settings?.maxConsecLosses) {
  const max = Number(limit)
  if (!Number.isFinite(max) || max <= 0) return 0

  return Number(Math.min(1, (Number(streak) || 0) / max).toFixed(4))
}

/**
 * The three lights.
 *
 * @param {{dailyPct?: number, exposure?: number, streak?: number, tripped?: number,
 *   paused?: boolean}} [sources] - injectable state.
 * @returns {object[]} the LED rows.
 */
export function breakerLeds(sources = {}) {
  const tripped = Number(sources.tripped ?? appState.breaker?.tripped) || TRIP.NONE
  const daily = Number(sources.dailyPct ?? appState.breaker?.dailyPct) || 0
  const exposure = exposurePct(sources.exposure)
  const streak = streakPct(sources.streak)
  const paused = sources.paused ?? appState.breaker?.paused === true

  const limits = currentThresholds()

  return [
    {
      id: 'daily',
      label: 'day',
      state: ledStateFor(daily, tripped === TRIP.DAILY_LOSS),
      // The native tooltip: exact numbers on hover for nothing, where a custom popover
      // would be a widget on the one bar that must never be busy.
      title: `day P&L ${Number(appState.breaker?.dayPnl ?? 0).toFixed(2)} of ${limits.dayLossFloor}`,
    },
    {
      id: 'position',
      label: 'pos',
      state: ledStateFor(exposure, tripped === TRIP.POSITION),
      title: `exposure ${Math.round(exposure * 100)}% of cap ${limits.maxPosition}`,
    },
    {
      id: 'streak',
      label: 'run',
      state: ledStateFor(streak, paused || tripped === TRIP.LOSS_STREAK),
      title: `${pauseState().streak} losses in a row`,
    },
  ]
}

/**
 * Publish the lights.
 *
 * @param {object} [sources] - injectable state.
 * @returns {object[]} the LED rows.
 */
export function refreshLeds(sources = {}) {
  const leds = breakerLeds(sources)
  setValue(PATHS.breaker.leds, leds)

  return leds
}
