import { setValue, appState } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { registerAction } from '../actions/registry.js'
import { ACTIONS } from '../actions/names.js'
import { setFilter } from '../journal/filters.js'

/**
 * Which instruments actually pay.
 *
 * Traders accumulate symbols the way people accumulate browser tabs — something moved once,
 * it went on the watchlist, and it has been quietly costing money ever since. The ranking is
 * the list nobody wants to look at and everybody should.
 *
 * **Sorted by net, and the row carries the count.** Net alone would put a single lucky trade
 * above a hundred grinding ones, and a ranking that recommended an instrument on one sample
 * would be worse than no ranking. The count sits on every row precisely so the reader can
 * discount the top line when it says `1 trade`.
 *
 * Fees are shown per instrument rather than folded into the net alone, because the instrument
 * that pays least is very often not the one that moves least — it is the one being traded
 * most, at a venue charging the most, in size too small to carry the charge.
 */

/** How many rows show before the rest collapse. */
export const TOP_N = 10

/**
 * Totals per instrument.
 *
 * @param {object[]} trades - the enriched trades.
 * @returns {object[]} one row per instrument.
 */
export function groupByInstrument(trades) {
  const groups = new Map()

  for (const trade of Array.isArray(trades) ? trades : []) {
    const instrument = String(trade?.instrument ?? '')
    if (!instrument) continue

    if (!groups.has(instrument)) {
      groups.set(instrument, { instrument, net: 0, fees: 0, count: 0, wins: 0, losses: 0 })
    }

    const row = groups.get(instrument)
    const net = Number(trade?.net) || 0
    row.net = Number((row.net + net).toFixed(4))
    row.fees = Number((row.fees + (Number(trade?.fees) || 0)).toFixed(4))
    row.count += 1
    if (net > 0) row.wins += 1
    else if (net < 0) row.losses += 1
  }

  return [...groups.values()]
}

/**
 * Best to worst, with the rates that qualify the number.
 *
 * @param {object[]} groups - the per-instrument totals.
 * @returns {object[]} the ranking.
 */
export function rankInstruments(groups) {
  const rows = Array.isArray(groups) ? groups : []

  return [...rows]
    .map((row) => {
      const decided = (row?.wins || 0) + (row?.losses || 0)

      return {
        ...row,
        avg: row?.count ? Number(((Number(row.net) || 0) / row.count).toFixed(4)) : 0,
        // "—" for an instrument with only scratches, the same honesty the KPI tiles use.
        winRate: decided ? `${Math.round((row.wins / decided) * 100)}%` : '—',
        tone: (Number(row?.net) || 0) >= 0 ? 'up' : 'down',
      }
    })
    .sort((a, b) => (Number(b.net) || 0) - (Number(a.net) || 0))
}

/**
 * The top rows, plus everything else as one.
 *
 * @param {object[]} ranked - the ranking.
 * @param {number} [top] - how many rows to show.
 * @returns {object[]} the visible rows.
 */
export function collapseTail(ranked, top = TOP_N) {
  const rows = Array.isArray(ranked) ? ranked : []
  const limit = Math.max(1, Number(top) || TOP_N)
  if (rows.length <= limit) return rows

  const tail = rows.slice(limit)
  // Aggregated rather than truncated. A list that simply stopped at ten would hide the
  // twenty small bleeders that together outweigh the one instrument at the top.
  const other = tail.reduce(
    (acc, row) => ({
      ...acc,
      net: Number((acc.net + (Number(row.net) || 0)).toFixed(4)),
      fees: Number((acc.fees + (Number(row.fees) || 0)).toFixed(4)),
      count: acc.count + (Number(row.count) || 0),
    }),
    { instrument: `+${tail.length} more`, net: 0, fees: 0, count: 0, winRate: '—', avg: 0, other: true },
  )

  return [...rows.slice(0, limit), { ...other, tone: other.net >= 0 ? 'up' : 'down' }]
}

/**
 * The widest bar the chart has to draw.
 *
 * @param {object[]} rows - the visible rows.
 * @returns {number} the max absolute net.
 */
export function rankingScale(rows) {
  const values = (Array.isArray(rows) ? rows : []).map((row) => Math.abs(Number(row?.net) || 0))

  return values.length ? Math.max(...values) : 0
}

/**
 * A row's bar, as a share of the width.
 *
 * @param {object} row - the ranked row.
 * @param {number} max - the scale.
 * @returns {number} 0..1.
 */
export function barWidth(row, max) {
  const span = Number(max) || 0
  if (span <= 0) return 0

  // A minimum sliver so a tiny-but-real number is still visible: a bar of zero width reads
  // as "no data", which is a different claim from "barely made anything".
  return Number(Math.max(0.02, Math.min(1, Math.abs(Number(row?.net) || 0) / span)).toFixed(4))
}

/**
 * Publish the ranking.
 *
 * @param {object[]} [trades] - the enriched trades.
 * @returns {object[]} the visible rows.
 */
export function refreshRanking(trades = appState.journal?.filtered) {
  const ranked = rankInstruments(groupByInstrument(trades))
  const expanded = appState.analytics?.rankingExpanded === true
  const rows = expanded ? ranked : collapseTail(ranked)
  const max = rankingScale(rows)

  setValue(
    PATHS.analytics.ranking,
    rows.map((row) => ({ ...row, bar: barWidth(row, max) })),
  )
  setValue(PATHS.analytics.rankingTotal, ranked.length)

  return rows
}

/**
 * Register the ranking actions.
 *
 * @returns {string[]} the registered names.
 */
export function registerRankingActions() {
  registerAction(ACTIONS.analytics.pickInstrument, (_state, payload) => {
    const instrument = String(payload?.instrument ?? '')
    // Straight into the journal's own filter: the ranking's whole value is "which of these
    // should I look at", and a chart that could only be looked at would stop one step short.
    if (!instrument || payload?.other) return ''

    return setFilter('instrument', instrument).instrument
  })
  registerAction(ACTIONS.analytics.expandRanking, () => {
    const next = appState.analytics?.rankingExpanded !== true
    setValue(PATHS.analytics.rankingExpanded, next)
    refreshRanking()

    return next
  })

  return [ACTIONS.analytics.pickInstrument, ACTIONS.analytics.expandRanking]
}
