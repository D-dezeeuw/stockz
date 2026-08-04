import { appState, setValue, watch } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { refreshThresholds } from './core.js'

/**
 * Every limit, in one place.
 *
 * The limits were scattered across three modules and two settings keys, and the seam that
 * caused was real: the streak *check* read `maxConsecLosses` while the cached *threshold*
 * read `botCooldownAfter`, so a trader setting one number was configuring half a breaker.
 * A safety feature configured in two places is one that is misconfigured in production.
 *
 * Every value here is a plain number in the account's own units. No percentages of
 * anything, no basis points, no "aggressive/moderate/conservative" presets — a trader
 * setting a daily loss limit knows exactly what number they cannot lose past, and asking
 * them to express it as a fraction of an equity figure that moves is asking them to do
 * arithmetic during the one moment they should not be.
 *
 * **Zero means disabled, everywhere.** Consistently, on every field, because a zero that
 * meant "stop immediately" on one field and "no limit" on the next would be a trap laid for
 * whoever left a box empty.
 */

/** Every breaker limit, its default and what zero means. */
export const BREAKER_LIMITS = Object.freeze([
  Object.freeze({
    key: 'maxDailyLoss',
    label: 'Daily max loss',
    fallback: 500,
    step: 1,
    // Shown against the live number so the limit is read in context, not in the abstract.
    live: () => Number(appState.breaker?.dayPnl) || 0,
  }),
  Object.freeze({
    key: 'maxPosition',
    label: 'Max position size',
    fallback: 1,
    step: 0.01,
    live: () => Number(appState.trade?.exposure) || 0,
  }),
  Object.freeze({
    key: 'maxConsecLosses',
    label: 'Pause after N losses',
    fallback: 5,
    step: 1,
    live: () => Number(appState.breaker?.lossStreak) || 0,
  }),
  Object.freeze({
    key: 'pauseMinutes',
    label: 'Pause length (minutes)',
    fallback: 15,
    step: 1,
    live: () => 0,
  }),
])

/**
 * Clamp the limits so nothing invalid can reach the hot path.
 *
 * @param {object} input - the raw settings slice.
 * @returns {object} the cleaned limits.
 */
export function validateBreakerSettings(input = {}) {
  const clean = {}

  for (const limit of BREAKER_LIMITS) {
    const raw = Number(input?.[limit.key])
    // A blank, a minus sign or a pasted word all land on the default rather than on
    // Infinity: the hot path compares against these, and NaN silently disables a breaker.
    clean[limit.key] = Number.isFinite(raw) && raw >= 0 ? raw : limit.fallback
  }

  return clean
}

/**
 * The limits currently in force.
 *
 * @param {object} [state] - the settings slice.
 * @returns {object} the limits.
 */
export function breakerSettings(state = appState?.settings) {
  return validateBreakerSettings(state ?? {})
}

/**
 * Each limit beside the number it is limiting.
 *
 * @param {object} [state] - the settings slice.
 * @returns {object[]} rows for the settings card.
 */
export function breakerContext(state = appState?.settings) {
  const limits = breakerSettings(state)

  return BREAKER_LIMITS.map((limit) => ({
    key: limit.key,
    label: limit.label,
    step: limit.step,
    value: limits[limit.key],
    // "now: -120.50 / 500.00" — a limit read in the abstract is a limit nobody can tell is
    // about to bind.
    now: Number(limit.live()).toFixed(2),
    limit: Number(limits[limit.key]).toFixed(2),
    off: limits[limit.key] === 0,
  }))
}

/**
 * Publish the settings card rows.
 *
 * @param {object} [state] - the settings slice.
 * @returns {object[]} the rows.
 */
export function refreshBreakerCard(state = appState?.settings) {
  const rows = breakerContext(state)
  setValue(PATHS.breaker.limits, rows)

  return rows
}

/**
 * Keep the threshold cache and the card in step with the settings.
 *
 * @returns {Function} the watcher.
 */
export function watchBreakerSettings() {
  const watcher = (state) => {
    refreshThresholds(validateBreakerSettings(state?.settings))
    refreshBreakerCard(state?.settings)
    // Deliberately does *not* touch `breaker.tripped`. Raising a limit must never revive a
    // halted desk by itself — that would make "turn the number up" the fastest way past a
    // breaker, which is the one thing a breaker cannot allow.
  }

  watch(
    BREAKER_LIMITS.map((limit) => `settings.${limit.key}`),
    watcher,
  )
  watcher(appState)

  return watcher
}
