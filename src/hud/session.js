import { setValue, appState } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { ledger } from '../positions/ledger.js'
import { formatCompact } from './metrics.js'

/**
 * Session shape.
 *
 * Three readings a scalper checks on themselves rather than on the market: am I hitting
 * my pace, am I on a run or tilting, and how much have I actually traded today.
 *
 * The streak one is the least obvious and the most useful. Losing streaks are where
 * discipline goes: the trade after three losses is the one taken too big, too early, to
 * get it back. A desk that shows the streak is a desk that lets the trader notice.
 */

/** Streak lengths at which the tile changes its tone. */
export const STREAK_TIERS = Object.freeze({ hot: 3, cold: 3 })

/**
 * The hourly pace implied by a window of closes.
 *
 * @param {object[]} closes - the day's realisations.
 * @param {number} now - the current time.
 * @param {number} [windowMs] - the sliding window.
 * @returns {{perHour: number, inWindow: number}} the pace.
 */
export function tradesPerHour(closes, now, windowMs = 3600000) {
  const at = Number(now)
  const span = Math.max(60000, Number(windowMs) || 3600000)
  if (!Number.isFinite(at)) return { perHour: 0, inWindow: 0 }

  const cutoff = at - span
  const inWindow = (Array.isArray(closes) ? closes : []).filter(
    (row) => Number(row?.ts) > cutoff,
  ).length

  // Extrapolated from the window rather than counted since the open: ten trades in the
  // last ten minutes is a pace of sixty an hour, and that is the number that says
  // whether the *current* rhythm is sustainable.
  return { perHour: Number(((inWindow / span) * 3600000).toFixed(1)), inWindow }
}

/**
 * How the pace compares to the trader's target.
 *
 * @param {number} perHour - the current pace.
 * @param {number} target - the trader's target.
 * @returns {string} 'under', 'on' or 'over'.
 */
export function paceState(perHour, target) {
  const pace = Number(perHour) || 0
  const goal = Number(target) || 0
  if (goal <= 0) return 'on'

  // A ±25% band: a pace that reports "off target" for every small deviation is one the
  // trader stops reading.
  if (pace < goal * 0.75) return 'under'
  return pace > goal * 1.25 ? 'over' : 'on'
}

/**
 * The pace as a fraction of the target, for the meter fill.
 *
 * @param {number} perHour - the current pace.
 * @param {number} target - the trader's target.
 * @returns {number} 0..1.
 */
export function paceRatio(perHour, target) {
  const pace = Number(perHour) || 0
  const goal = Number(target) || 0
  if (goal <= 0 || pace <= 0) return 0

  // Capped at a full bar: a meter that overflows its track says nothing the 'over' tone
  // does not already say, and a bar wider than its block breaks the row.
  return Number(Math.min(1, pace / goal).toFixed(3))
}

/**
 * The current run of wins or losses.
 *
 * @param {object[]} closes - the day's realisations, oldest first.
 * @returns {{length: number, kind: string}} the streak.
 */
export function currentStreak(closes) {
  const rows = Array.isArray(closes) ? closes : []
  let length = 0
  let kind = 'none'

  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const amount = Number(rows[i]?.amount) || 0
    // A scratch breaks a streak without starting one: it is neither a win to ride nor a
    // loss to worry about.
    if (amount === 0) break

    const thisKind = amount > 0 ? 'win' : 'loss'
    if (kind === 'none') kind = thisKind
    else if (kind !== thisKind) break

    length += 1
  }

  return { length, kind: length === 0 ? 'none' : kind }
}

/**
 * The tone the streak tile should wear.
 *
 * @param {{length: number, kind: string}} streak - the streak.
 * @returns {string} 'hot', 'cold' or 'neutral'.
 */
export function streakTone(streak) {
  const length = Number(streak?.length) || 0
  if (streak?.kind === 'win' && length >= STREAK_TIERS.hot) return 'hot'
  // Cold is the one that matters: the trade after three losses is the one taken too big
  // and too early to get it back.
  if (streak?.kind === 'loss' && length >= STREAK_TIERS.cold) return 'cold'

  return 'neutral'
}

/**
 * The day's traded size.
 *
 * @param {object[]} closes - the day's realisations.
 * @returns {{contracts: number, turnover: number}} the totals.
 */
export function dayVolume(closes) {
  let contracts = 0
  let turnover = 0

  for (const row of Array.isArray(closes) ? closes : []) {
    const qty = Math.abs(Number(row?.qty) || 0)
    contracts += qty
    // Turnover uses the realised amount's own scale where no price is recorded: the
    // figure is for "how much did I actually trade", not for accounting.
    turnover += qty * (Number(row?.px) || 0)
  }

  return { contracts: Number(contracts.toFixed(8)), turnover: Number(turnover.toFixed(2)) }
}

/**
 * Publish the session tiles.
 *
 * @param {{now?: number}} [options] - the clock.
 * @returns {object} what was published.
 */
export function refreshSession(options = {}) {
  const now = Number(options.now) || 0
  const closes = ledger()

  const pace = tradesPerHour(closes, now)
  const streak = currentStreak(closes)
  const volume = dayVolume(closes)
  const target = Number(appState.settings?.tradesPerHourTarget) || 0

  const session = {
    ...pace,
    target,
    paceState: paceState(pace.perHour, target),
    paceRatio: paceRatio(pace.perHour, target),
    streak: streak.length,
    streakKind: streak.kind,
    streakTone: streakTone(streak),
    ...volume,
    paceLabel: formatCompact(pace.perHour),
    turnoverLabel: formatCompact(volume.turnover),
  }

  setValue(PATHS.ui.session, session)
  return session
}
