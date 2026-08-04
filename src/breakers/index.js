import { refreshThresholds, TRIP } from './core.js'
import { pauseCheck, positionCheck, recordBlock } from './position.js'
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

export {
  getPosSize,
  isReducing,
  isExit,
  capFor,
  positionCheck,
  onRealizedFill,
  streakCheck,
  pauseTrading,
  clearPause,
  pauseCheck,
  recordBlock,
  pauseState,
  resetPause,
} from './position.js'

export { killSwitch, tripAction, killLatency, rearm, registerKillActions } from './kill.js'

export {
  HOLD_MS,
  stillOverLimit,
  startHold,
  armHoldProgress,
  cancelHold,
  holdState,
  holdFrame,
  holdLoop,
  mountRelease,
  rearmDesk,
  registerRearmActions,
} from './rearm.js'

export {
  WARN_AT,
  ledStateFor,
  exposurePct,
  streakPct,
  breakerLeds,
  refreshLeds,
} from './leds.js'

export {
  TRIP_ACTIONS,
  actionFor,
  retryOnce,
  markPending,
  clearPending,
  reconcilePending,
  watchPending,
  pendingInstruments,
  executeTripAction,
  watchTrip,
  resetTrip,
} from './trip.js'

/**
 * Every soft check an order must pass: the ones that block *this order* without halting
 * the desk.
 *
 * Separate from `dailyLossCheck` on purpose. One fat-fingered size should not cancel every
 * working order and flatten the book — the cure would be worse than the mistake, and a
 * safety feature that punishes typos is one traders route around.
 *
 * @param {object} order - the intent.
 * @param {{now?: number}} [context] - the clock.
 * @returns {{code: number, reason: string}} the verdict.
 */
export function orderChecks(order, context = {}) {
  const paused = pauseCheck(order)
  if (paused.code !== TRIP.NONE) {
    recordBlock(paused.reason, context.now)
    return paused
  }

  const capped = positionCheck(order)
  if (capped.code !== TRIP.NONE) recordBlock(capped.reason, context.now)

  return capped
}

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
