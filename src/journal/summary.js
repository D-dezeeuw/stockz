import { setValue, appState } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { registerAction } from '../actions/registry.js'
import { ACTIONS } from '../actions/names.js'

/**
 * The day-by-day scorecard.
 *
 * A scalping desk produces hundreds of rows a day and exactly one question worth asking at
 * the end of it: *was today a good day, and why*. That question is not answered by a list.
 * It is answered by a line — trades, win rate, gross, fees, net — and by the gap between the
 * gross and the net, which on this kind of desk is usually the whole story.
 *
 * Days are keyed by **UTC date**, matching the session rollover the rest of the desk already
 * uses. A local-date key would split one trading session across two rows for anyone trading
 * across their own midnight, and the two halves would each look like a quiet day.
 *
 * The win rate counts scratches as neither wins nor losses. Break-even trades are noise in a
 * ratio designed to say whether the edge is real, and a desk that scratches half its trades
 * would otherwise report a win rate of fifty percent while making nothing.
 */

/**
 * The day a trade belongs to.
 *
 * @param {object} trade - the trade.
 * @returns {string} a YYYY-MM-DD key, or '' when it has no close.
 */
export function dayKey(trade) {
  const at = Number(trade?.closeTs)
  if (!Number.isFinite(at) || at <= 0) return ''

  // UTC, matching the session rollover the rest of the desk uses. A local key would split
  // one session across two rows for anyone trading through their own midnight.
  return new Date(at).toISOString().slice(0, 10)
}

/**
 * Bucket trades by day.
 *
 * @param {object[]} trades - the trades.
 * @returns {Map<string, object[]>} day key -> trades.
 */
export function groupByDay(trades) {
  const days = new Map()

  for (const trade of Array.isArray(trades) ? trades : []) {
    const key = dayKey(trade)
    if (!key) continue
    if (!days.has(key)) days.set(key, [])
    days.get(key).push(trade)
  }

  return days
}

/**
 * One day's line.
 *
 * @param {object[]} trades - that day's trades.
 * @returns {object} the summary.
 */
export function daySummary(trades) {
  const rows = Array.isArray(trades) ? trades : []
  const totals = rows.reduce(
    (acc, trade) => {
      const net = Number(trade?.net) || 0
      acc.gross += Number(trade?.pnl) || 0
      acc.fees += Number(trade?.fees) || 0
      acc.net += net
      acc.hold += Number(trade?.hold) || 0
      // Scratches count as neither. A desk that scratched half its trades would otherwise
      // report a fifty percent win rate while making nothing.
      if (net > 0) acc.wins += 1
      else if (net < 0) acc.losses += 1
      if (net > acc.maxWin) acc.maxWin = net
      if (net < acc.maxLoss) acc.maxLoss = net

      return acc
    },
    { gross: 0, fees: 0, net: 0, hold: 0, wins: 0, losses: 0, maxWin: 0, maxLoss: 0 },
  )

  const decided = totals.wins + totals.losses

  return {
    trades: rows.length,
    wins: totals.wins,
    losses: totals.losses,
    winRate: decided ? Number((totals.wins / decided).toFixed(4)) : 0,
    // Formatted here rather than in the template: the desk's `fmt.pct` signs its output and
    // expects a percentage, and a win rate rendered as "+0.50%" is a readout nobody trusts.
    winRateLabel: decided ? `${Math.round((totals.wins / decided) * 100)}%` : '—',
    gross: Number(totals.gross.toFixed(2)),
    fees: Number(totals.fees.toFixed(2)),
    net: Number(totals.net.toFixed(2)),
    // The gap between gross and net is usually the whole story on a scalping desk, so it is
    // a field rather than something the reader is left to subtract.
    feeShare: totals.gross > 0 ? Number((totals.fees / totals.gross).toFixed(4)) : 0,
    avgHold: rows.length ? Math.round(totals.hold / rows.length) : 0,
    maxWin: Number(totals.maxWin.toFixed(2)),
    maxLoss: Number(totals.maxLoss.toFixed(2)),
  }
}

/**
 * Every day, newest first.
 *
 * @param {object[]} trades - the trades.
 * @param {number} [today] - the current time.
 * @returns {object[]} the day rows.
 */
export function dailyRows(trades, today = 0) {
  const key = today ? new Date(Number(today)).toISOString().slice(0, 10) : ''

  return [...groupByDay(trades).entries()]
    .map(([day, rows]) => ({ day, today: day === key, ...daySummary(rows), rows }))
    .sort((a, b) => (a.day < b.day ? 1 : -1))
}

/**
 * Publish the scorecard.
 *
 * @param {object[]} [trades] - the filtered trades.
 * @param {number} [today] - the current time.
 * @returns {object[]} the day rows.
 */
export function refreshDays(trades = appState.journal?.filtered, today = 0) {
  const rows = dailyRows(trades, today)
  // The rows travel without their trades: the sublist is rendered from the filtered list
  // the block already holds, and shipping both would double the largest array in state.
  setValue(
    PATHS.journal.days,
    rows.slice(0, 60).map(({ rows: _rows, ...summary }) => summary),
  )

  return rows
}

/**
 * Open or close a day.
 *
 * @param {string} day - the day key.
 * @returns {string} the day now open, or ''.
 */
export function toggleDay(day) {
  const wanted = String(day ?? '')
  // One open at a time, and clicking the open one closes it. A journal with every day
  // expanded is the list the summary rows existed to replace.
  const next = appState.journal?.openDay === wanted ? '' : wanted
  setValue(PATHS.journal.openDay, next)

  return next
}

/**
 * Register the summary actions.
 *
 * @returns {string} the action name.
 */
export function registerSummaryActions() {
  registerAction(ACTIONS.journal.toggleDay, (_state, payload) => toggleDay(payload?.day))

  return ACTIONS.journal.toggleDay
}
