import { setValue } from '../app/engine.js'
import { PATHS } from '../state/paths.js'

/**
 * Order-book imbalance — who is heavier, as one number.
 *
 * The raw reading flickers violently: at the top of a book a single cancelled order can
 * swing it from +0.4 to −0.2 and back inside a second. A flickering gauge is worse than
 * no gauge, because it invites acting on noise, so the displayed value is an EMA of the
 * raw one — slow enough to mean something, fast enough to still be about *now*.
 *
 * Depth is a parameter for a reason. Five levels reads the touch, twenty reads the
 * structure behind it, and which one is informative changes with the instrument and the
 * hour. Hard-coding a depth would bake one answer into all of them.
 */

/** The last smoothed reading, so the EMA has something to lag against. */
let smoothed

/** Level counts the depth selector offers. */
export const DEPTH_OPTIONS = Object.freeze([5, 10, 20])

/**
 * Total resting size over the top N levels of one side.
 *
 * @param {Array<[number, number]|{sz: number}>} levels - book levels, best first.
 * @param {number} [depth] - how many levels to count.
 * @returns {number} the summed size.
 */
export function sumDepth(levels, depth = 10) {
  const list = Array.isArray(levels) ? levels : []
  const count = Math.max(0, Math.floor(Number(depth) || 0))
  let total = 0

  for (let i = 0; i < Math.min(count, list.length); i += 1) {
    const level = list[i]
    const size = Number(Array.isArray(level) ? level[1] : level?.sz)
    if (Number.isFinite(size) && size > 0) total += size
  }

  return Number(total.toFixed(8))
}

/**
 * The imbalance between two sides.
 *
 * @param {object} book - {bids, asks}.
 * @param {number} [depth] - levels per side.
 * @returns {number} −1 (all offer) to +1 (all bid), 0 for an empty or balanced book.
 */
export function computeImbalance(book, depth = 10) {
  const bid = sumDepth(book?.bids, depth)
  const ask = sumDepth(book?.asks, depth)
  const total = bid + ask
  // An empty book is not balanced, but zero is the only honest reading of "no data" on
  // a −1..+1 scale, and it renders as a centred gauge rather than a lie in either
  // direction.
  if (total <= 0) return 0

  return Number(((bid - ask) / total).toFixed(4))
}

/**
 * Smooth a reading into the previous one.
 *
 * @param {number} previous - the last smoothed value.
 * @param {number} next - the new raw reading.
 * @param {number} [alpha] - weight of the new reading, 0–1.
 * @returns {number} the smoothed value.
 */
export function emaSmooth(previous, next, alpha = 0.2) {
  const value = Number(next)
  if (!Number.isFinite(value)) return Number(previous) || 0

  const prior = Number(previous)
  // The first reading has nothing to smooth into: seeding with the value itself avoids a
  // gauge that spends its first second crawling out of zero.
  if (!Number.isFinite(prior)) return value

  const weight = Math.min(1, Math.max(0, Number(alpha) || 0))
  return Number((prior + weight * (value - prior)).toFixed(6))
}

/**
 * The gauge view for a book.
 *
 * @param {object} book - {bids, asks}.
 * @param {{depth?: number, previous?: number, alpha?: number,
 *   threshold?: number}} [options] - reading options.
 * @returns {{raw: number, value: number, bidPct: number, askPct: number, side: string,
 *   hot: boolean, label: string}} the gauge.
 */
export function imbalanceGauge(book, options = {}) {
  const { depth = 10, previous, alpha = 0.2, threshold = 0.4 } = options

  const raw = computeImbalance(book, depth)
  const value = emaSmooth(previous, raw, alpha)
  // The −1..+1 reading becomes two percentages that sum to 100, which is what a split
  // bar can bind to directly with no arithmetic in the template.
  const bidPct = Number((((value + 1) / 2) * 100).toFixed(1))

  return {
    raw,
    value,
    bidPct,
    askPct: Number((100 - bidPct).toFixed(1)),
    side: value > 0 ? 'bid' : value < 0 ? 'ask' : 'flat',
    hot: Math.abs(value) >= Math.abs(Number(threshold) || 0),
    label: `${value > 0 ? '+' : ''}${(value * 100).toFixed(0)}%`,
  }
}

/**
 * Keep the imbalance reading in state, smoothed across frames.
 *
 * The previous value has to live somewhere for the EMA to lag against, and state is the
 * wrong place: reading it back each frame couples the smoother to the render cycle. It
 * lives here, module-local, and only the result is published.
 *
 * @param {object} book - the current book.
 * @param {{depth?: number, alpha?: number, threshold?: number}} [options] - reading options.
 * @returns {object} the gauge that was written.
 */
export function updateImbalance(book, options = {}) {
  const gauge = imbalanceGauge(book, { ...options, previous: smoothed })
  smoothed = gauge.value
  setValue(PATHS.market.imbalance, gauge)

  return gauge
}

/** Forget the smoothed reading — on a symbol change, where lag would be a lie. */
export function resetImbalance() {
  smoothed = undefined
  return true
}
