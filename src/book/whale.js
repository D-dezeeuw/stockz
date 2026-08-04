import { trigger, setValue, appState } from '../app/engine.js'
import { PATHS } from '../state/paths.js'

/**
 * Whales — the size that is not like the others.
 *
 * "Big" is meaningless as an absolute: 5 BTC is a whale, 5 DOGE is dust, and 5 of
 * anything at 3am is a different creature from 5 at the open. So the baseline is a
 * **rolling median of recent print sizes** — session-adaptive, and median rather than
 * mean precisely because one 400-lot print must not redefine what counts as large.
 *
 * The detection fires a Spektrum trigger as well as flagging the row: later phases want
 * to alert on whales and trade against them, and neither should have to re-derive this.
 */

/** Prints the baseline looks back over. */
export const WINDOW = 200

/** How many times the median a print must be to count. */
export const DEFAULT_MULTIPLIER = 4

/** Whale events retained in state — a session's worth of notable prints, not all of them. */
export const FEED_CAP = 50

/**
 * The median of a size window.
 *
 * @param {number[]} sizes - recent print sizes.
 * @param {number} [window] - how far back to look.
 * @returns {number} the median, or 0 without samples.
 */
export function rollingMedian(sizes, window = WINDOW) {
  const list = (Array.isArray(sizes) ? sizes : [])
    .map(Number)
    .filter((size) => Number.isFinite(size) && size > 0)
    .slice(-Math.max(1, Math.floor(Number(window) || WINDOW)))

  if (list.length === 0) return 0

  const sorted = [...list].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)

  // Median, not mean: one 400-lot print must not redefine what "normal" is for the next
  // two hundred prints, which is exactly what an average would let it do.
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/**
 * Whether a size counts as a whale against a baseline.
 *
 * @param {number} size - the print or level size.
 * @param {number} median - the rolling median.
 * @param {number} [multiplier] - how many times the median counts as big.
 * @returns {boolean} true when the size stands out.
 */
export function isWhale(size, median, multiplier = DEFAULT_MULTIPLIER) {
  const value = Number(size)
  const baseline = Number(median)
  const k = Number(multiplier)
  if (!Number.isFinite(value) || !Number.isFinite(baseline) || baseline <= 0) return false

  return value >= baseline * (Number.isFinite(k) && k > 0 ? k : DEFAULT_MULTIPLIER)
}

/**
 * The per-instrument multiplier, falling back to the global default.
 *
 * @param {string} symbol - instrument.
 * @param {Record<string, number>} [overrides] - per-symbol multipliers.
 * @param {number} [fallback] - the default multiplier.
 * @returns {number} the multiplier to use.
 */
export function multiplierFor(symbol, overrides, fallback = DEFAULT_MULTIPLIER) {
  const override = Number(overrides?.[String(symbol ?? '')])
  if (Number.isFinite(override) && override > 0) return override

  const base = Number(fallback)
  return Number.isFinite(base) && base > 0 ? base : DEFAULT_MULTIPLIER
}

/**
 * Flag whales across a set of rows.
 *
 * @param {Array<{sz: number}>} rows - tape prints or ladder rows.
 * @param {{median?: number, multiplier?: number}} [options] - detection options.
 * @returns {Array<object>} the rows, each with a `whale` flag.
 */
export function flagWhales(rows, options = {}) {
  const list = Array.isArray(rows) ? rows : []
  const { multiplier = DEFAULT_MULTIPLIER } = options
  // Derived from the rows themselves when not supplied, so a ladder is measured against
  // its own book rather than against the tape's very different size distribution.
  const median = Number.isFinite(Number(options.median))
    ? Number(options.median)
    : rollingMedian(list.map((row) => Number(row?.sz)))

  return list.map((row) => ({ ...row, whale: isWhale(row?.sz, median, multiplier) }))
}

/**
 * Announce a whale so later phases can alert or trade on it.
 *
 * @param {object} print - the print that qualified.
 * @param {{median: number, multiplier: number}} context - what made it qualify.
 * @returns {boolean} true when a trigger fired.
 */
export function emitWhale(print, context = {}) {
  if (!print) return false

  const event = {
    symbol: print.symbol ?? '',
    px: Number(print.px) || 0,
    sz: Number(print.sz) || 0,
    side: print.side ?? 'buy',
    ts: Number(print.ts) || 0,
    // The ratio travels with the event: "6× normal" is what an alert wants to say, and
    // recomputing it downstream would need the whole window.
    ratio: Number(context.median) > 0 ? Number((Number(print.sz) / Number(context.median)).toFixed(2)) : 0,
    multiplier: Number(context.multiplier) || DEFAULT_MULTIPLIER,
  }

  const feed = Array.isArray(appState.market?.whales) ? appState.market.whales : []
  setValue(PATHS.market.whales, trimWhales([...feed, event]))

  // Spektrum's `trigger(id, path, value)` is a *labelled add* — an increment, not an
  // array push. Bumping a counter with it gives the history entry a name ("whale") that
  // devtools and replay show, and gives later phases a value to watch without diffing
  // the feed array.
  trigger('whale', PATHS.market.whaleCount, 1)
  return true
}

/**
 * Keep the whale feed bounded.
 *
 * @param {object[]} feed - the current feed.
 * @param {number} [cap] - maximum retained.
 * @returns {object[]} the trimmed feed, newest kept.
 */
export function trimWhales(feed, cap = FEED_CAP) {
  const list = Array.isArray(feed) ? feed : []
  const max = Math.max(1, Math.floor(Number(cap) || FEED_CAP))
  if (list.length <= max) return list

  return list.slice(-max)
}
