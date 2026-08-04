import { setValue, appState } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { registerAction } from '../actions/registry.js'
import { ACTIONS } from '../actions/names.js'
import { refreshJournalRows } from './metrics.js'
import { refreshDays } from './summary.js'
import { refreshKpis } from '../analytics/kpis.js'
import { refreshEquity } from '../analytics/equity.js'
import { refreshHeatmap } from '../analytics/heatmap.js'
import { refreshRanking } from '../analytics/instruments.js'
import { refreshHoldTimes } from '../analytics/holdtime.js'
import { refreshStreaks } from '../analytics/streaks.js'
import { refreshFees } from '../analytics/fees.js'
import { refreshDrawdown } from '../analytics/drawdown.js'
import { scopeToPeriod } from '../analytics/period.js'

/**
 * Finding the trades worth studying.
 *
 * A day's journal is a list nobody reads end to end. The value is in slices — *every fomo
 * tag*, *every loser on this instrument*, *the ten worst by net* — and those are the
 * questions a trader actually has. So the block is a filter first and a list second.
 *
 * Sorting defaults to newest-first and not to worst-first, deliberately. The most recent
 * trade is the one still being thought about; a journal that opened on the day's disasters
 * would be a journal people stop opening.
 *
 * Filters are AND, never OR. "Losses tagged fomo on BTC" is a real question; "losses or fomo
 * or BTC" is not one anybody asks, and offering the choice would make every filter read
 * ambiguous.
 */

/** How the list can be ordered. */
export const SORT_KEYS = Object.freeze(['closeTs', 'net', 'hold', 'qty'])

/** What the outcome filter can be. */
export const OUTCOMES = Object.freeze(['all', 'wins', 'losses'])

/** Which record to look at: both, practice only, or real only. */
export const BOOKS = Object.freeze(['all', 'paper', 'live'])

/**
 * Does one trade survive the filters?
 *
 * @param {object} trade - the enriched trade.
 * @param {{instrument?: string, tag?: string, outcome?: string, book?: string}} [filters] - the slice.
 * @returns {boolean} true when it belongs in the list.
 */
export function matchesFilters(trade, filters = {}) {
  const instrument = String(filters.instrument ?? '')
  if (instrument && String(trade?.instrument ?? '') !== instrument) return false

  const tag = String(filters.tag ?? '')
  if (tag && !(trade?.tags ?? []).includes(tag)) return false

  const outcome = String(filters.outcome ?? 'all')
  const net = Number(trade?.net) || 0
  // Break-even counts as neither. A scratch is not a win, and calling it one is how a
  // win-rate becomes a number that flatters rather than informs.
  if (outcome === 'wins' && net <= 0) return false
  if (outcome === 'losses' && net >= 0) return false

  // Practice and real, separable. Both are kept — a paper trade dropped from the record is
  // a lesson lost — but a win rate computed over the two mixed together is a number that
  // means nothing, and the default is 'all' only because most sessions are one or the
  // other anyway.
  const book = String(filters.book ?? 'all')
  if (book === 'paper' && trade?.paper !== true) return false
  if (book === 'live' && trade?.paper === true) return false

  return true
}

/**
 * The slice.
 *
 * @param {object[]} trades - the enriched trades.
 * @param {object} [filters] - the slice.
 * @returns {object[]} what survived.
 */
export function filterTrades(trades, filters = {}) {
  // AND, never OR: "losses tagged fomo on BTC" is a real question, and "losses or fomo or
  // BTC" is not one anybody asks.
  return (Array.isArray(trades) ? trades : []).filter((trade) => matchesFilters(trade, filters))
}

/**
 * The order.
 *
 * @param {object[]} trades - the trades.
 * @param {string} [key] - the sort key.
 * @param {string} [dir] - 'asc' or 'desc'.
 * @returns {object[]} a sorted copy.
 */
export function sortTrades(trades, key = 'closeTs', dir = 'desc') {
  const field = SORT_KEYS.includes(String(key)) ? String(key) : 'closeTs'
  const sign = String(dir) === 'asc' ? 1 : -1

  // A copy, because the caller's array is the journal's own and sorting it in place would
  // reorder the record itself.
  return [...(Array.isArray(trades) ? trades : [])].sort(
    (a, b) => ((Number(a?.[field]) || 0) - (Number(b?.[field]) || 0)) * sign,
  )
}

/**
 * Every instrument the journal has seen.
 *
 * @param {object[]} trades - the trades.
 * @returns {string[]} the instruments, sorted.
 */
export function journalInstruments(trades) {
  const seen = new Set(
    (Array.isArray(trades) ? trades : []).map((trade) => String(trade?.instrument ?? '')),
  )
  seen.delete('')

  // The "all instruments" row is *data*, not a literal `<option>` beside the bound ones.
  // Spektrum's `data-each` binds the container and clones its first **element** child, so a
  // select cannot hold both a hand-written option and a repeated list — and putting
  // `data-each` on the option itself, which is what this used to do, warns
  // "needs an element child to clone" and renders nothing at all.
  return [{ id: '', name: 'all instruments' }, ...[...seen].sort().map((id) => ({ id, name: id }))]
}

/**
 * Apply the filters and publish the list.
 *
 * @param {object[]} [rows] - the enriched trades.
 * @param {object} [filters] - the slice.
 * @returns {object[]} the visible rows.
 */
export function refreshFiltered(rows = refreshJournalRows(), filters = appState.journal?.filters) {
  const slice = filters ?? {}
  const visible = sortTrades(filterTrades(rows, slice), slice.sort, slice.dir)

  setValue(PATHS.journal.filtered, visible.slice(0, 300))
  setValue(PATHS.journal.instruments, journalInstruments(rows))
  // The count of what was hidden, not just what is shown: a filter that quietly matched
  // nothing looks exactly like a day with no trades.
  setValue(PATHS.journal.hidden, Math.max(0, rows.length - visible.length))
  // The scorecard summarises the slice, not the whole journal: a day row that ignored the
  // filters would contradict the list directly under it.
  refreshDays(visible, slice.now)

  // Analytics answers a *second* question of the same rows: not "what did I trade" but
  // "over what stretch". The journal keeps its own filters; the period narrows what every
  // chart and tile is computed from, and it is published so the canvas redraw closures read
  // the same scoped list rather than the unscoped one they would otherwise reach for.
  const scoped = scopeToPeriod(visible, slice.now)
  setValue(PATHS.analytics.trades, scoped)

  // The KPIs describe the slice too. Tiles that answered a different question from the list
  // under them would be four numbers nobody could place.
  refreshKpis(scoped)
  refreshEquity(scoped)
  refreshHeatmap(scoped)
  refreshRanking(scoped)
  refreshHoldTimes(scoped)
  refreshStreaks(scoped)
  refreshFees(scoped)
  refreshDrawdown(scoped)

  return visible
}

/**
 * Change one filter.
 *
 * @param {string} key - which filter.
 * @param {string} value - the new value.
 * @returns {object} the filters after.
 */
export function setFilter(key, value) {
  const name = String(key ?? '')
  if (!['instrument', 'tag', 'outcome', 'book', 'sort', 'dir'].includes(name)) {
    return appState.journal?.filters ?? {}
  }

  const current = { ...(appState.journal?.filters ?? {}) }
  // Re-selecting the active value clears it, so every chip is its own off switch and no
  // filter needs a second control to undo it. `book` and `outcome` clear to 'all' rather
  // than to '' — an empty book is not "both", it is a filter that matches nothing.
  const next = String(value ?? '')
  const cycles = name !== 'sort' && name !== 'dir'
  const empty = name === 'book' || name === 'outcome' ? 'all' : ''
  current[name] = cycles && current[name] === next ? empty : next

  setValue(PATHS.journal.filters, current)
  refreshFiltered(undefined, current)

  return current
}

/**
 * Cycle a column's sort.
 *
 * @param {string} key - the column.
 * @returns {object} the filters after.
 */
export function toggleSort(key) {
  const current = appState.journal?.filters ?? {}
  const field = SORT_KEYS.includes(String(key)) ? String(key) : 'closeTs'
  // Clicking the active column flips it; clicking a new one starts descending, because the
  // interesting end of every column here — biggest loss, longest hold — is the top.
  const dir = current.sort === field && current.dir === 'desc' ? 'asc' : 'desc'

  const next = { ...current, sort: field, dir }
  setValue(PATHS.journal.filters, next)
  refreshFiltered(undefined, next)

  return next
}

/**
 * Drop every filter.
 *
 * @returns {object} the empty filter set.
 */
export function clearFilters() {
  const cleared = { instrument: '', tag: '', outcome: 'all', book: 'all', sort: 'closeTs', dir: 'desc' }
  setValue(PATHS.journal.filters, cleared)
  refreshFiltered(undefined, cleared)

  return cleared
}

/**
 * Register the filter actions.
 *
 * @returns {string[]} the registered names.
 */
export function registerFilterActions() {
  registerAction(ACTIONS.journal.filter, (_state, payload) =>
    // `field` before `key`: on an element that also carries `data-each`, Spektrum reads
    // `data-key` as the *clone key expression*, so the instrument select was keying every
    // option to `undefined` — duplicate keys, merged clones, and a dropdown that showed
    // one instrument however many the journal held. The chips keep `data-key`; only the
    // bound list needed a name of its own.
    setFilter(payload?.field ?? payload?.key, payload?.value ?? payload?.filterValue),
  )
  registerAction(ACTIONS.journal.sort, (_state, payload) => toggleSort(payload?.key))
  registerAction(ACTIONS.journal.clearFilters, () => clearFilters())

  return [ACTIONS.journal.filter, ACTIONS.journal.sort, ACTIONS.journal.clearFilters]
}
