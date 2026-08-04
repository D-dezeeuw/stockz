import { setValue, appState } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { currentLists, commitLists, activeList } from './state.js'
import { createList, splitSymbol, qualifySymbol } from './ops.js'
import { fetchTickers, rankBlueChips } from '../venues/okx/tickers.js'
import { setBlockStatus } from '../blocks/registry.js'
import { registerAction } from '../actions/registry.js'
import { ACTIONS } from '../actions/names.js'
import { formatPrice, formatSigned } from '../utils/format.js'
import { createLogger } from '../utils/log.js'

/**
 * The watchlist: what the desk is watching, and what those things cost.
 *
 * The block existed from phase 2 with a title and an empty state, and nothing ever filled
 * it — the whole `lists/` module was built, tested and wired to no UI at all. This is the
 * missing half.
 *
 * It populates itself. A desk that opens on an empty list and waits to be told what to
 * watch is a desk that cannot start without a human, and the top instruments by real
 * traded volume are a better default than anyone's typed guess. Quotes come from the
 * public tickers endpoint, so rows are live before a single credential exists.
 */

const log = createLogger('watchlist')

/** How many instruments the auto list holds. */
export const AUTO_LIMIT = 8

/** The auto-populated list's id and name. */
export const AUTO_LIST_ID = 'bluechips'
export const AUTO_LIST_NAME = 'Blue Chips'

/** How often the rows are re-quoted. */
export const QUOTE_MS = 4000

/** How often the membership itself is re-ranked. */
export const RERANK_MS = 15 * 60 * 1000

/**
 * Is the desk allowed to manage the watchlist itself?
 *
 * The override the trader gets: turn this off and the list is theirs, and nothing here
 * will reorder or replace it again.
 *
 * @param {object} [state] - engine state.
 * @returns {boolean} true when the desk maintains the list.
 */
export function autoEnabled(state = appState) {
  return state?.settings?.autoWatchlist !== false
}

/**
 * Replace the auto list's membership.
 *
 * Only ever touches its own list. A trader's hand-made lists are left exactly alone —
 * "the desk manages a list for you" must not mean "the desk edits your lists".
 *
 * @param {string[]} symbols - qualified or bare symbols, ranked.
 * @returns {object[]} the lists now in state.
 */
export function commitAutoList(symbols) {
  const wanted = (Array.isArray(symbols) ? symbols : []).filter(Boolean)
  if (wanted.length === 0) return currentLists()

  const others = currentLists().filter((list) => list?.id !== AUTO_LIST_ID)
  const rebuilt = createList(others, AUTO_LIST_NAME, { id: AUTO_LIST_ID, symbols: wanted })

  // The auto list leads: it is the one the desk keeps current, so it is the one a trader
  // opening the desk should be looking at.
  const ordered = [
    ...rebuilt.filter((list) => list.id === AUTO_LIST_ID),
    ...rebuilt.filter((list) => list.id !== AUTO_LIST_ID),
  ]

  commitLists(ordered)

  // Checked against the rebuilt lists rather than through `activeList()`, which falls back
  // to the first list and so is never null — asking it "is anything active" always answers
  // yes and the stored id would stay empty forever.
  const active = String(appState?.settings?.activeListId ?? '')
  if (!ordered.some((list) => list.id === active)) {
    setValue(PATHS.settings.activeListId, AUTO_LIST_ID)
  }

  return ordered
}

/**
 * Re-rank the auto list from live venue volume.
 *
 * @param {object} [options] - injected fetch.
 * @returns {Promise<{ok: boolean, symbols: string[], error?: string}>} the outcome.
 */
export async function refreshBlueChips(options = {}) {
  if (!autoEnabled()) return { ok: false, symbols: [], error: 'auto watchlist off' }

  const result = await fetchTickers(options)
  // A failed fetch keeps whatever is already listed. Emptying the watchlist because the
  // venue had a bad second would take the desk's instruments away over a hiccup.
  if (!result.ok) return { ok: false, symbols: [], error: result.error }

  const ranked = rankBlueChips(result.rows, options.limit ?? AUTO_LIMIT)
  if (ranked.length === 0) return { ok: false, symbols: [], error: 'no tradeable pairs' }

  const symbols = ranked.map((row) => row.symbol)
  commitAutoList(symbols)
  log.info(`blue chips: ${symbols.join(', ')}`)

  return { ok: true, symbols }
}

/**
 * Build the rows the block renders, quoting each against a ticker snapshot.
 *
 * @param {string[]} symbols - the list's qualified symbols.
 * @param {object[]} ranked - normalised ticker rows.
 * @param {string} [focus] - the focused instrument.
 * @returns {object[]} rows ready to bind.
 */
export function buildWatchRows(symbols, ranked, focus = '') {
  const quotes = new Map((Array.isArray(ranked) ? ranked : []).map((row) => [row.symbol, row]))
  const focused = String(focus ?? '')

  return (Array.isArray(symbols) ? symbols : []).map((qualified) => {
    const { symbol } = splitSymbol(qualified)
    const quote = quotes.get(symbol)
    const change = Number(quote?.changePct ?? 0)

    return {
      id: qualified,
      symbol,
      // A row with no quote yet says so rather than showing 0.00, which reads as a real
      // price that happens to be zero.
      price: quote ? formatPrice(quote.last, quote.last >= 100 ? 0.01 : 0.0001) : '—',
      change: quote ? `${formatSigned(change, 2)}%` : '',
      tone: !quote ? 'flat' : change > 0 ? 'up' : change < 0 ? 'down' : 'flat',
      active: symbol === focused || qualified === focused,
    }
  })
}

/**
 * Re-quote the visible rows and publish them.
 *
 * @param {object} [options] - injected fetch.
 * @returns {Promise<object[]>} the rows now in state.
 */
export async function refreshQuotes(options = {}) {
  // Symbols can be handed in. `commitLists` writes through `setValue`, which lands next
  // tick, so a quote pass that ran straight after a re-rank would read the *previous*
  // list out of state — at boot, the empty one, and the block would paint empty on the
  // very first frame.
  const list = activeList()
  const symbols = Array.isArray(options.symbols)
    ? options.symbols
    : Array.isArray(list?.symbols)
      ? list.symbols
      : []

  if (symbols.length === 0) {
    setValue(PATHS.market.watchRows, [])
    setBlockStatus('watchlist', 'empty')
    return []
  }

  const result = await fetchTickers(options)
  const ranked = result.ok ? rankBlueChips(result.rows, 500) : []
  const rows = buildWatchRows(symbols, ranked, String(appState?.market?.focus ?? ''))

  setValue(PATHS.market.watchRows, rows)
  // Leaves the placeholder the block has shown since phase 2. Nothing ever moved this
  // block off `empty`, so it rendered "nothing to show yet" no matter what it held.
  setBlockStatus('watchlist', result.ok ? 'ready' : 'error')

  return rows
}

/**
 * Hand the watchlist to the trader, or back to the desk.
 *
 * The override. Off means the desk stops re-ranking and the list is theirs to edit; on
 * means it takes the instruments back over and re-ranks immediately, rather than leaving
 * a stale list until the next quarter-hour.
 *
 * @param {object} _state - engine state (unused).
 * @param {{value?: boolean}} [payload] - the new setting.
 * @returns {boolean} whether the desk now manages the list.
 */
export function toggleAutoWatchlist(_state, payload = {}) {
  const next = typeof payload?.value === 'boolean' ? payload.value : !autoEnabled()
  setValue(PATHS.settings.autoWatchlist, next)

  if (next) refreshBlueChips().then(() => refreshQuotes()).catch(() => {})

  return next
}

/**
 * Register the watchlist actions.
 *
 * @returns {string[]} the names registered.
 */
export function registerWatchActions() {
  return [
    registerAction(ACTIONS.lists.auto, toggleAutoWatchlist, {
      description: 'Let the desk pick the watchlist instruments',
    }),
  ]
}

/**
 * Start the watchlist: populate, quote, and keep both current.
 *
 * @param {{timer?: object, quoteMs?: number, rerankMs?: number}} [options] - plumbing.
 * @returns {() => void} stop.
 */
export function startWatchlist(options = {}) {
  const timer = options.timer ?? globalThis
  const quoteEvery = Number(options.quoteMs) > 0 ? Number(options.quoteMs) : QUOTE_MS
  const rerankEvery = Number(options.rerankMs) > 0 ? Number(options.rerankMs) : RERANK_MS

  // Ranked first, then quoted, so the first paint already shows the right instruments
  // rather than the seeded guess being replaced a second later.
  refreshBlueChips(options)
    .catch(() => ({}))
    // The ranked symbols are passed straight across rather than read back out of state,
    // which has not flushed yet.
    .then((ranked) =>
      refreshQuotes(
        ranked?.symbols?.length
          ? { ...options, symbols: ranked.symbols.map((s) => qualifySymbol(s)) }
          : options,
      ),
    )
    .catch(() => [])

  const quotes = timer.setInterval?.(() => refreshQuotes(options).catch(() => []), quoteEvery)
  // Membership changes on the hour, not on the second: a watchlist that reshuffles while
  // being read is unusable, however current it is.
  const rerank = timer.setInterval?.(() => refreshBlueChips(options).catch(() => ({})), rerankEvery)

  return () => {
    timer.clearInterval?.(quotes)
    timer.clearInterval?.(rerank)
  }
}
