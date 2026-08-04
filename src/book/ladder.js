import { formatPrice, decimalsOf } from '../charts/scale.js'
import { groupBook } from './grouping.js'

/**
 * The depth ladder.
 *
 * A ladder is read at a glance and at speed, so everything here exists to make one
 * number comparable to the one above it without the eye doing arithmetic: sizes become
 * bar widths against the *visible* maximum, prices carry exactly the decimals the
 * instrument trades in, and the spread sits in the middle as a cost, in ticks, rather
 * than as two prices to subtract.
 *
 * All pure over plain arrays. The book state machine (snapshots, deltas, checksums)
 * lives next door in `book.js`; this file only decides what the trader sees.
 */

/** How many levels a side shows by default — the actionable top of book. */
export const LADDER_DEPTH = 12

/**
 * A size as a percentage of the visible maximum.
 *
 * @param {number} size - the level's resting size.
 * @param {number} max - the largest size currently on screen.
 * @returns {number} 0–100, rounded to one decimal.
 */
export function sizeToPct(size, max) {
  const value = Number(size)
  const peak = Number(max)
  if (!Number.isFinite(value) || !Number.isFinite(peak) || peak <= 0 || value <= 0) return 0

  // Against the *visible* max, not an all-time one: the bars must re-scale as the book
  // thins out, or a quiet ladder renders as twelve identical stubs.
  return Math.round(Math.min(100, (value / peak) * 100) * 10) / 10
}

/**
 * Format a size with the decimals its lot size implies.
 *
 * @param {number} size - the size.
 * @param {number} [lotSize] - the instrument's minimum size increment.
 * @returns {string} the formatted size.
 */
export function formatSize(size, lotSize = 0.0001) {
  const value = Number(size)
  if (!Number.isFinite(value)) return '—'

  const step = Number(lotSize)
  const decimals = Number.isFinite(step) && step > 0 ? Math.min(8, decimalsOf(step)) : 4

  // Past a thousand the exact lot stops mattering and the magnitude starts to: "1.2K"
  // is read faster than "1234.5600", and on a ladder speed is the whole point.
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(1)}K`

  return value.toFixed(decimals)
}

/**
 * Build the rows for one side of the ladder.
 *
 * @param {Array<[number, number]|{px: number, sz: number}>} levels - book levels.
 * @param {{side: string, depth?: number, tickSize?: number, lotSize?: number,
 *   max?: number}} [options] - display options.
 * @returns {Array<{px: number, sz: number, side: string, pct: number, priceLabel: string,
 *   sizeLabel: string, total: number}>} the rows, best price first.
 */
export function ladderRows(levels, options = {}) {
  const { side = 'bid', depth = LADDER_DEPTH, tickSize = 0.01, lotSize = 0.0001, max } = options

  const parsed = (Array.isArray(levels) ? levels : [])
    .map((level) => ({
      px: Number(Array.isArray(level) ? level[0] : level?.px),
      sz: Number(Array.isArray(level) ? level[1] : level?.sz),
    }))
    .filter((level) => Number.isFinite(level.px) && Number.isFinite(level.sz) && level.sz > 0)
    // Best first on both sides: bids descend, asks ascend, so the touch is always row 0
    // and the two sides mirror around the spread.
    .sort((a, b) => (side === 'bid' ? b.px - a.px : a.px - b.px))
    .slice(0, Math.max(0, depth))

  const peak = Number.isFinite(max) ? max : Math.max(0, ...parsed.map((l) => l.sz))
  let running = 0

  return parsed.map((level) => {
    running += level.sz
    return {
      px: level.px,
      sz: level.sz,
      side,
      pct: sizeToPct(level.sz, peak),
      priceLabel: formatPrice(level.px, tickSize),
      sizeLabel: formatSize(level.sz, lotSize),
      // Cumulative size to this level — what a sweep through it would actually cost.
      total: Number(running.toFixed(8)),
    }
  })
}

/**
 * The spread row that sits between the two sides.
 *
 * @param {object} book - {bids, asks} arrays, any order.
 * @param {{tickSize?: number}} [options] - the instrument's tick size.
 * @returns {{bid: number, ask: number, mid: number, spread: number, ticks: number,
 *   bps: number, midLabel: string, spreadLabel: string, crossed: boolean}} the row.
 */
export function spreadRow(book, options = {}) {
  const { tickSize = 0.01 } = options
  const bids = ladderRows(book?.bids, { side: 'bid', depth: 1, tickSize })
  const asks = ladderRows(book?.asks, { side: 'ask', depth: 1, tickSize })

  const bid = bids[0]?.px ?? 0
  const ask = asks[0]?.px ?? 0
  if (!bid || !ask) {
    return {
      bid,
      ask,
      mid: 0,
      spread: 0,
      ticks: 0,
      bps: 0,
      midLabel: '—',
      spreadLabel: '—',
      crossed: false,
    }
  }

  const spread = ask - bid
  const mid = (ask + bid) / 2
  const step = Number(tickSize) > 0 ? Number(tickSize) : 0.01

  return {
    bid,
    ask,
    mid,
    spread,
    // Ticks, not currency: "two ticks wide" is the number that decides whether a scalp
    // clears its own cost, and it means the same thing on every instrument.
    ticks: Math.round(spread / step),
    bps: mid > 0 ? Number(((spread / mid) * 10000).toFixed(2)) : 0,
    midLabel: formatPrice(mid, tickSize),
    spreadLabel: `${Math.round(spread / step)}t`,
    // A crossed book is a stale or corrupt one — the ladder must say so, not average it.
    crossed: spread < 0,
  }
}

/**
 * The largest size across both sides of the visible ladder.
 *
 * @param {object} book - {bids, asks} arrays.
 * @param {number} [depth] - levels per side.
 * @returns {number} the peak size, or 0 for an empty book.
 */
export function visibleMax(book, depth = LADDER_DEPTH) {
  const sizes = [...(book?.bids ?? []), ...(book?.asks ?? [])]
    .map((level) => Number(Array.isArray(level) ? level[1] : level?.sz))
    .filter((size) => Number.isFinite(size) && size > 0)

  const bids = ladderRows(book?.bids, { side: 'bid', depth })
  const asks = ladderRows(book?.asks, { side: 'ask', depth })
  const visible = [...bids, ...asks].map((row) => row.sz)

  // One scale for both sides, or a 10-lot bid and a 10-lot ask draw different widths and
  // the ladder stops being comparable across the spread.
  return visible.length ? Math.max(...visible) : sizes.length ? Math.max(...sizes) : 0
}

/**
 * The whole ladder view for a book — what the template binds to.
 *
 * One function rather than three computeds so both sides and the spread row are always
 * derived from the *same* book snapshot. Three independent computeds could each fire on
 * a different frame, and a ladder whose bids are one update ahead of its asks shows a
 * spread that never existed.
 *
 * @param {object} book - {bids, asks}.
 * @param {{depth?: number, tickSize?: number, lotSize?: number}} [options] - display options.
 * @returns {{bids: object[], asks: object[], spread: object}} the view.
 */
export function ladderView(book, options = {}) {
  const { depth = LADDER_DEPTH, tickSize = 0.01, lotSize = 0.0001, group = 0 } = options
  // Grouping happens before anything is measured, so the bars scale against the grouped
  // sizes rather than against the raw levels they were aggregated from.
  const source = Number(group) > 0 ? groupBook(book, group) : book
  const max = visibleMax(source, depth)
  const shared = { depth, tickSize, lotSize, max }

  return {
    bids: ladderRows(source?.bids, { ...shared, side: 'bid' }),
    asks: ladderRows(source?.asks, { ...shared, side: 'ask' }),
    spread: spreadRow(source, { tickSize }),
    group: Number(group) || 0,
  }
}
