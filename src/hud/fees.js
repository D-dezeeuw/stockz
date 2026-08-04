import { setValue } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { ledger, netRealized } from '../positions/ledger.js'
import { formatCompact } from './metrics.js'

/**
 * What the day is costing to trade.
 *
 * A scalper's edge is measured in ticks and their fees are measured in the same ticks, so
 * the two numbers belong on the same screen. A hundred round trips at a two-tick edge and
 * a one-tick fee is a day that reads as a win on gross and is a loss in the account.
 *
 * The ledger already sums the fees the venue actually charged, and that sum is the
 * authority here — the schedule below is only for the fills nobody has been billed for
 * yet: a size preview, or a venue whose fill report omits the fee. An estimate that
 * overrode a real charge would be the worst of both.
 */

/**
 * Published venue rates, in basis points of notional.
 *
 * OKX Lv1: spot 0.080% maker / 0.100% taker; perpetuals 0.020% / 0.050%. EToro charges no
 * commission on the instruments this desk trades but takes a spread markup, ~1% on crypto,
 * which is a fee by another name and is counted as one.
 */
export const FEE_SCHEDULE = Object.freeze({
  okx: Object.freeze({
    spot: Object.freeze({ maker: 8, taker: 10 }),
    swap: Object.freeze({ maker: 2, taker: 5 }),
  }),
  etoro: Object.freeze({
    spot: Object.freeze({ maker: 100, taker: 100 }),
    swap: Object.freeze({ maker: 100, taker: 100 }),
  }),
})

/** Below this the elapsed session is too short to extrapolate an hour from. */
export const BURN_FLOOR_MS = 300000

/** The session's fee accumulator. Held outside the reactive tree; flushed per frame. */
let accrued = { total: 0, count: 0, estimated: 0 }

/**
 * The rate card for a venue and instrument.
 *
 * @param {string} venue - 'okx' or 'etoro'.
 * @param {string} instrument - the instrument id.
 * @returns {{maker: number, taker: number}} bps.
 */
export function scheduleFor(venue, instrument) {
  const card = FEE_SCHEDULE[String(venue ?? '').toLowerCase()] ?? FEE_SCHEDULE.okx
  // A perpetual is a third of the cost of spot on OKX; charging one rate for both would
  // misprice every scalp by enough to matter at this trade count.
  const swap = /-(SWAP|PERP)$/i.test(String(instrument ?? ''))

  return swap ? card.swap : card.spot
}

/**
 * What a fill costs.
 *
 * @param {{venue?: string, instrument?: string, qty?: number, px?: number,
 *   fee?: number, maker?: boolean}} fill - the fill.
 * @returns {{amount: number, estimated: boolean}} the cost, always positive.
 */
export function feeForFill(fill) {
  const billed = Number(fill?.fee)
  // The venue's own number wins whenever there is one: it is what left the account.
  if (Number.isFinite(billed) && billed !== 0) {
    return { amount: Number(Math.abs(billed).toFixed(8)), estimated: false }
  }

  const notional = Math.abs(Number(fill?.qty) || 0) * Math.abs(Number(fill?.px) || 0)
  if (notional <= 0) return { amount: 0, estimated: false }

  const card = scheduleFor(fill?.venue, fill?.instrument)
  const bps = fill?.maker === true ? card.maker : card.taker

  return { amount: Number(((notional * bps) / 10000).toFixed(8)), estimated: true }
}

/**
 * Add a fee to the accumulator.
 *
 * @param {{total?: number, count?: number, estimated?: number}} prev - the running total.
 * @param {{amount?: number, estimated?: boolean}} fee - the fee.
 * @returns {{total: number, count: number, estimated: number}} the new total.
 */
export function addFee(prev, fee) {
  const total = Number(prev?.total) || 0
  const count = Number(prev?.count) || 0
  const estimated = Number(prev?.estimated) || 0
  const amount = Number(fee?.amount)
  if (!Number.isFinite(amount) || amount <= 0) return { total, count, estimated }

  return {
    total: Number((total + amount).toFixed(8)),
    count: count + 1,
    estimated: fee?.estimated === true ? estimated + 1 : estimated,
  }
}

/**
 * Fees per hour.
 *
 * @param {number} total - fees paid so far.
 * @param {number} elapsedMs - how long the session has run.
 * @returns {number} the hourly burn.
 */
export function burnRate(total, elapsedMs) {
  const fees = Number(total) || 0
  const elapsed = Number(elapsedMs)
  if (fees <= 0 || !Number.isFinite(elapsed) || elapsed <= 0) return 0

  // Floored at five minutes. Extrapolating an hour from the first ninety seconds is
  // arithmetically true and practically a lie — it prints a four-figure burn rate off two
  // trades and the trader learns to ignore the tile before the session is warm.
  return Number(((fees / Math.max(BURN_FLOOR_MS, elapsed)) * 3600000).toFixed(2))
}

/**
 * What share of the gross the fees took.
 *
 * @param {number} fees - fees paid.
 * @param {number} gross - gross realised P&L.
 * @returns {number} the ratio.
 */
export function feesVsPnl(fees, gross) {
  const paid = Number(fees) || 0
  const made = Math.abs(Number(gross) || 0)
  if (paid <= 0) return 0
  // No gross to measure against yet, but fees already paid: that is total burn, and
  // reporting it as zero would hide the worst version of the number.
  if (made <= 0) return 1

  return Number(Math.min(9.99, paid / made).toFixed(4))
}

/**
 * Record a fill's fee.
 *
 * @param {object} fill - the fill.
 * @returns {{total: number, count: number, estimated: number}} the accumulator.
 */
export function recordFee(fill) {
  accrued = addFee(accrued, feeForFill(fill))
  return accrued
}

/**
 * Publish the burn tile.
 *
 * @param {{now?: number, since?: number}} [options] - the session clock.
 * @returns {object} what was published.
 */
export function flushFees(options = {}) {
  const rows = ledger()
  const { gross, fees: billed } = netRealized(rows)
  // Billed fees are the authority; the accumulator only carries what the venue has not
  // charged for yet, so taking the larger of the two never double-counts a fill.
  const total = Number(Math.max(billed, accrued.total).toFixed(8))

  const now = Number(options.now) || 0
  const since = Number(options.since) || Number(rows[0]?.ts) || 0
  const rate = burnRate(total, now > since ? now - since : 0)
  const ratio = feesVsPnl(total, gross)

  const fees = {
    total,
    rate,
    ratio,
    count: accrued.count,
    estimated: accrued.estimated,
    totalLabel: formatCompact(total),
    rateLabel: `${formatCompact(rate)}/h`,
    // Precomputed rather than left to the template: a meter that can render wider than its
    // track is a broken row, and the clamp belongs where it can be tested.
    barPct: Math.round(Math.min(1, ratio) * 100),
    // Past half the gross the fees are not a cost of doing business any more, they are
    // the business.
    tone: ratio >= 0.5 ? 'warn' : 'ok',
  }

  setValue(PATHS.ui.fees, fees)
  return fees
}

/**
 * Forget the session's fees.
 *
 * @returns {boolean} true.
 */
export function resetFees() {
  accrued = { total: 0, count: 0, estimated: 0 }
  return true
}
