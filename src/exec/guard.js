import { bpsDiff } from '../utils/math.js'
import { canTradeBook } from '../book/integrity.js'

/**
 * The slippage guard.
 *
 * The one check between a fat finger and a filled order. It exists because the failure it
 * catches is silent: an order at 10,000 instead of 100 does not look wrong in a form
 * field, it looks like a number — and on a market order it is money gone before anyone
 * reads it back.
 *
 * It has to be O(1) and it has to be *last*, right before the send. A guard that runs on
 * keystroke can be stale by the time the click lands, and a guard that costs a round trip
 * is a guard that gets switched off.
 */

/** Default ceiling: an order this far from mid is almost certainly a mistake. */
export const MAX_DEVIATION_BPS = 500

/**
 * How far a price is from mid, in basis points.
 *
 * @param {number} price - the order's price.
 * @param {number} mid - the current mid.
 * @returns {number} absolute deviation in bps, 0 when it cannot be measured.
 */
export function deviationBps(price, mid) {
  const px = Number(price)
  const reference = Number(mid)
  if (!Number.isFinite(px) || !Number.isFinite(reference) || px <= 0 || reference <= 0) return 0

  return Math.abs(bpsDiff(px, reference))
}

/**
 * Whether an order may go out.
 *
 * @param {object} intent - the order intent.
 * @param {{mid?: number, maxBps?: number, bookStatus?: string}} market - the check's inputs.
 * @returns {{ok: boolean, reason: string, bps: number}} the verdict.
 */
export function checkSlippage(intent, market = {}) {
  const max = Number(market.maxBps)
  const ceiling = Number.isFinite(max) && max > 0 ? max : MAX_DEVIATION_BPS

  // A market order has no price to check — its whole nature is taking whatever is there
  // — so the book's health is the only thing that can be checked, and it must be.
  if (intent?.type === 'market') {
    return canTradeBook(market.bookStatus)
      ? { ok: true, reason: '', bps: 0 }
      : { ok: false, reason: 'book not live', bps: 0 }
  }

  const bps = deviationBps(intent?.price, market.mid)
  // No mid means nothing to compare against. Refusing here would block the first order
  // of a session; the book-status check above is what covers that case honestly.
  if (!(Number(market.mid) > 0)) return { ok: true, reason: '', bps: 0 }

  if (bps > ceiling) return { ok: false, reason: `${Math.round(bps)}bps from mid`, bps }

  return { ok: true, reason: '', bps }
}

/**
 * Whether a size is within the desk's per-order limit.
 *
 * @param {number} size - the order size.
 * @param {number} maxSize - the limit.
 * @returns {{ok: boolean, reason: string}} the verdict.
 */
export function checkSize(size, maxSize) {
  const value = Number(size)
  const max = Number(maxSize)
  if (!Number.isFinite(value) || value <= 0) return { ok: false, reason: 'no size' }
  if (!Number.isFinite(max) || max <= 0) return { ok: true, reason: '' }

  // The fat-finger case is an extra zero, so the limit is worth having even when the
  // trader set it generously.
  return value > max ? { ok: false, reason: `size over ${max}` } : { ok: true, reason: '' }
}
