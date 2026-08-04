import { setValue, appState, watch } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { currentLists, commitLists, activeList } from './state.js'
import { createList, splitSymbol, qualifySymbol } from './ops.js'
import { fetchTickers, mapTicker } from '../venues/okx/tickers.js'
import { UNIVERSE, universeSymbols, instrumentName } from './universe.js'
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
 * It fills itself from the shipped universe (see `universe.js`), so a desk that has just
 * been opened is already watching forty instruments and needs nobody to tell it what to
 * look at. Quotes come from the public tickers endpoint, which needs no credentials — the
 * rows are live before a single key has been entered.
 */

const log = createLogger('watchlist')

/** How often the rows are re-quoted. */
export const QUOTE_MS = 4000

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
 * Install the shipped universe as the desk's lists.
 *
 * Only ever touches the lists it owns. A trader's hand-made list is left exactly alone —
 * "the desk keeps a list for you" must not mean "the desk edits your lists".
 *
 * @returns {object[]} the lists now in state.
 */
export function seedUniverse() {
  if (!autoEnabled()) return currentLists()

  const owned = new Set(UNIVERSE.map((list) => list.id))
  const mine = currentLists().filter((list) => !owned.has(list?.id))

  let rebuilt = []
  for (const list of UNIVERSE) {
    rebuilt = createList(rebuilt, list.name, {
      id: list.id,
      symbols: list.instruments.map((row) => row.symbol),
    })
  }

  // The desk's lists lead, so a trader opening the desk is looking at one of them.
  const ordered = [...rebuilt, ...mine]
  commitLists(ordered)

  // Checked against the rebuilt lists rather than through `activeList()`, which falls back
  // to the first list and so is never null — asking it "is anything active" always answers
  // yes and the stored id would stay empty forever.
  const active = String(appState?.settings?.activeListId ?? '')
  if (!ordered.some((list) => list.id === active)) {
    setValue(PATHS.settings.activeListId, UNIVERSE[0].id)
  }

  // Something has to be focused or the desk does nothing at all. `market.focus` shipped as
  // '' with only a click able to set it, and the socket subscribes to the focused
  // instrument — so an untouched desk received no ticks, drew no book, and gave the
  // strategies nothing to read. The first row is as good a default as exists, and it is
  // the most-traded instrument on the venue.
  if (!String(appState?.market?.focus ?? '') && ordered[0]?.symbols?.length) {
    setValue(PATHS.market.focus, ordered[0].symbols[0])
  }

  log.info(`universe: ${ordered.length} lists, ${universeSymbols().length} instruments`)
  return ordered
}

/**
 * Build the rows the block renders, quoting each against a ticker snapshot.
 *
 * @param {string[]} symbols - the list's qualified symbols.
 * @param {object[]} quoted - normalised ticker rows.
 * @param {string} [focus] - the focused instrument.
 * @returns {object[]} rows ready to bind.
 */
export function buildWatchRows(symbols, quoted, focus = '') {
  const quotes = new Map((Array.isArray(quoted) ? quoted : []).map((row) => [row.symbol, row]))
  const focused = String(focus ?? '')

  return (Array.isArray(symbols) ? symbols : []).map((qualified) => {
    const { symbol } = splitSymbol(qualified)
    const quote = quotes.get(symbol)
    const change = Number(quote?.changePct ?? 0)

    return {
      id: qualified,
      symbol,
      // The name, because `XMU` and `XSNDK` are Micron and SanDisk and nobody should have
      // to remember that. Blank for anything outside the shipped universe.
      name: instrumentName(symbol),
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
 * Index a raw ticker payload by symbol.
 *
 * @param {object[]} rows - raw OKX ticker rows.
 * @returns {object[]} normalised quotes.
 */
export function quoteIndex(rows) {
  return (Array.isArray(rows) ? rows : []).map(mapTicker).filter(Boolean)
}

/**
 * The last quote snapshot, held outside the reactive tree.
 *
 * So the rows can be rebuilt without a fetch when only the *highlight* needs to move.
 */
let lastQuotes = []

/**
 * Repaint the rows from the quotes already in hand.
 *
 * Focus changes on a click and the quote timer runs every four seconds, so without this the
 * highlight would follow the click by up to four seconds — on a desk whose whole claim is
 * sub-100ms feedback. It also fixes the first paint: `seedUniverse` sets the focus through
 * `setValue`, which lands next tick, so the rows built immediately after it read the *old*
 * (empty) focus and nothing appeared selected at all.
 *
 * @returns {object[]} the rows now in state.
 */
export function repaintRows() {
  const list = activeList()
  const symbols = Array.isArray(list?.symbols) ? list.symbols : []
  if (symbols.length === 0) return []

  const rows = buildWatchRows(symbols, lastQuotes, String(appState?.market?.focus ?? ''))
  setValue(PATHS.market.watchRows, rows)

  return rows
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
  // Kept, so a focus change can repaint the highlight without another round trip.
  if (result.ok) lastQuotes = quoteIndex(result.rows)
  const rows = buildWatchRows(symbols, result.ok ? lastQuotes : [], String(appState?.market?.focus ?? ''))

  setValue(PATHS.market.watchRows, rows)
  // Leaves the placeholder the block has shown since phase 2. Nothing ever moved this
  // block off `empty`, so it rendered "nothing to show yet" no matter what it held.
  setBlockStatus('watchlist', result.ok ? 'ready' : 'error')

  return rows
}

/**
 * Hand the watchlist to the trader, or back to the desk.
 *
 * The override. Off means the desk stops installing its universe and the lists are theirs
 * to edit; on means it puts the shipped forty back immediately, rather than waiting for a
 * reload to do what the switch just said.
 *
 * @param {object} _state - engine state (unused).
 * @param {{value?: boolean}} [payload] - the new setting.
 * @returns {boolean} whether the desk now manages the list.
 */
export function toggleAutoWatchlist(_state, payload = {}) {
  const next = typeof payload?.value === 'boolean' ? payload.value : !autoEnabled()
  setValue(PATHS.settings.autoWatchlist, next)

  // Taken back over immediately rather than at the next reload, so the switch does what it
  // says the moment it is flipped.
  if (next) {
    seedUniverse()
    refreshQuotes({ symbols: universeSymbols().map((s) => qualifySymbol(s)) }).catch(() => [])
  }

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
 * @param {{timer?: object, quoteMs?: number}} [options] - plumbing.
 * @returns {() => void} stop.
 */
export function startWatchlist(options = {}) {
  const timer = options.timer ?? globalThis
  const quoteEvery = Number(options.quoteMs) > 0 ? Number(options.quoteMs) : QUOTE_MS

  // The highlight follows the click, not the four-second quote timer.
  const unfocus = watch([PATHS.market.focus], () => repaintRows())

  const listed = seedUniverse()
  // The symbols are passed straight across rather than read back out of state, which has
  // not flushed yet — `commitLists` writes through `setValue`, which lands next tick, so
  // the first quote pass would otherwise read the previous (empty) list and paint nothing.
  const first = listed[0]?.symbols?.length ? { ...options, symbols: listed[0].symbols } : options
  refreshQuotes(first).catch(() => [])

  const quotes = timer.setInterval?.(() => refreshQuotes(options).catch(() => []), quoteEvery)
  return () => {
    unfocus?.()
    timer.clearInterval?.(quotes)
  }
}
