import { setValue, appState } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { netRealized, ledger } from '../positions/ledger.js'
import { openPositions } from '../positions/store.js'
import { checkBreakers, tripBreaker, currentThresholds, TRIP } from './core.js'

/**
 * The daily loss breaker.
 *
 * The one number that decides whether the day is over. It is deliberately **realised plus
 * unrealised**: a trader holding a large loser has already lost the money, and a breaker
 * that only counted closed trades would let somebody sit through the exact drawdown it
 * exists to stop, then trip an hour later when they finally admitted it.
 *
 * The accuracy/cost trade is resolved by cadence rather than by approximation. The
 * unrealised half is recomputed on the frame flush — sixty times a second, not per tick —
 * and the hot-path check reads one already-computed number. Recomputing mark-to-market
 * inside `checkBreakers` would put a list walk in the order path.
 */

/**
 * Today's P&L, closed and open together.
 *
 * @param {{positions?: object[], rows?: object[]}} [sources] - injectable state.
 * @returns {{realized: number, unrealized: number, total: number}} the day.
 */
export function updateDayPnl(sources = {}) {
  const rows = sources.rows ?? ledger()
  const { net } = netRealized(rows)

  const positions = sources.positions ?? openPositions()
  const unrealized = (Array.isArray(positions) ? positions : []).reduce(
    (total, position) => total + (Number(position?.unrealized ?? position?.upnl) || 0),
    0,
  )

  const day = {
    realized: Number(net.toFixed(8)),
    // A trader holding a large loser has already lost the money. A breaker counting only
    // closed trades lets somebody sit through the exact drawdown it exists to stop.
    unrealized: Number(unrealized.toFixed(8)),
    total: Number((net + unrealized).toFixed(8)),
  }

  setValue(PATHS.breaker.dayPnl, day.total)
  return day
}

/**
 * How much of the day's allowance is gone.
 *
 * @param {number} dayPnl - today's total.
 * @param {number} [floor] - the pre-negated limit.
 * @returns {number} 0..1.
 */
export function dailyPct(dayPnl, floor = currentThresholds().dayLossFloor) {
  const pnl = Number(dayPnl) || 0
  const limit = Number(floor)
  // No limit set, or a profitable day: nothing consumed. A percentage of an unset limit is
  // a number that would light a warning LED for no reason.
  if (!Number.isFinite(limit) || limit >= 0 || pnl >= 0) return 0

  return Number(Math.min(1, pnl / limit).toFixed(4))
}

/**
 * The check, wired to the live numbers.
 *
 * @param {{now?: number, position?: number, lossStreak?: number}} [context] - extras.
 * @returns {number} the trip code.
 */
export function dailyLossCheck(context = {}) {
  const dayPnl = Number(appState.breaker?.dayPnl) || 0
  const code = checkBreakers({ dayPnl, position: context.position, lossStreak: context.lossStreak })
  if (code === TRIP.NONE) return TRIP.NONE

  // The snapshot travels with the trip: "why did it stop" is asked hours later, by which
  // time the numbers have moved on.
  tripBreaker(code, { dayPnl, position: context.position, lossStreak: context.lossStreak }, context)

  return code
}

/**
 * Recompute the day and publish the warning percentage.
 *
 * @param {{positions?: object[], rows?: object[]}} [sources] - injectable state.
 * @returns {object} the day.
 */
export function refreshDaily(sources = {}) {
  const day = updateDayPnl(sources)
  const pct = dailyPct(day.total)

  setValue(PATHS.breaker.dailyPct, pct)
  return { ...day, pct }
}

/**
 * Start a fresh trading day.
 *
 * @param {number} [now] - the current time.
 * @returns {object} the archived day.
 */
export function resetDay(now = 0) {
  const day = updateDayPnl()
  const archived = { ...day, at: Number(now) || 0 }

  setValue(PATHS.breaker.dayPnl, 0)
  setValue(PATHS.breaker.dailyPct, 0)
  // Yesterday must never block today, and the archive is what makes clearing it safe to do
  // rather than a number quietly thrown away.
  setValue(PATHS.breaker.values, { archived })

  return archived
}
