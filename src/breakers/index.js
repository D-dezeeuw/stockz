import { refreshThresholds } from './core.js'
import { watch } from '../app/engine.js'
import { PATHS } from '../state/paths.js'

/**
 * The breakers' front door.
 *
 * One import point, so the execution engine reaches the safety net without knowing which
 * file each check lives in — and so a later breaker can be added without editing the order
 * path again. The order path is the last place a change should be routine.
 */

export {
  TRIP,
  TRIP_REASONS,
  refreshThresholds,
  currentThresholds,
  checkBreakers,
  trippedCode,
  tripBreaker,
  resetBreaker,
  breakerRejection,
} from './core.js'

export { updateDayPnl, dailyPct, dailyLossCheck, refreshDaily, resetDay } from './daily.js'

/**
 * Keep the threshold cache in step with the settings.
 *
 * @returns {Function} the watcher that was registered.
 */
export function watchThresholds() {
  const watcher = (state) => refreshThresholds(state?.settings)

  // Rebuilt on change rather than read per order: the whole point of the cache is that the
  // hot path never touches settings, and a stale cache would be a limit the trader raised
  // that never took effect.
  watch([PATHS.settings.maxDailyLoss, PATHS.settings.maxPosition], watcher)
  refreshThresholds()

  return watcher
}
