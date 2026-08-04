import { unrealizedPnl, sideOf } from './math.js'
import { bookFor } from '../book/state.js'
import { latestTick } from '../pipeline/bus.js'
import { appState } from '../app/engine.js'

/**
 * Marks and money.
 *
 * A position's floating P&L is only as honest as its mark, and the mark that matters is
 * what the position could be *closed* at — the mid, or failing that the last print.
 * Marking a long at the offer flatters it; marking at the last trade lags a book that
 * has moved away.
 *
 * Multipliers are the other quiet source of wrongness: an OKX swap contract is not one
 * unit of the underlying, and a P&L computed as if it were is out by whatever `ctVal`
 * happens to be.
 */

/**
 * The mark for an instrument.
 *
 * @param {string} instrument - the instrument id.
 * @returns {{mark: number, source: string}} the mark and where it came from.
 */
export function midFor(instrument) {
  const book = bookFor(String(instrument ?? ''))
  const bid = Number(book?.bids?.[0]?.[0]) || 0
  const ask = Number(book?.asks?.[0]?.[0]) || 0

  if (bid > 0 && ask > 0) return { mark: (bid + ask) / 2, source: 'mid' }

  // A one-sided book still marks: the resting side is a real price someone would trade
  // at, and it beats no mark at all.
  if (bid > 0) return { mark: bid, source: 'bid' }
  if (ask > 0) return { mark: ask, source: 'ask' }

  const last = Number(latestTick(String(instrument ?? ''))?.px) || 0
  return last > 0 ? { mark: last, source: 'last' } : { mark: 0, source: 'none' }
}

/**
 * The contract multiplier for an instrument.
 *
 * @param {string} venue - the venue.
 * @param {string} instrument - the instrument id.
 * @param {Record<string, object>} [meta] - instrument metadata by id.
 * @returns {number} units of the underlying per contract.
 */
export function multiplierFor(venue, instrument, meta = appState.market?.instrumentMeta) {
  const record = meta?.[String(instrument ?? '')]
  const ctVal = Number(record?.ctVal)
  // Spot is one-for-one; a swap is not, and treating it as one is out by exactly ctVal.
  if (Number.isFinite(ctVal) && ctVal > 0) return ctVal

  return 1
}

/**
 * Floating P&L for a position at a mark, in quote currency.
 *
 * @param {object} position - the position.
 * @param {number} mark - the mark.
 * @param {number} [multiplier] - contract multiplier.
 * @returns {number} the floating P&L.
 */
export function floatingPnl(position, mark, multiplier = 1) {
  const factor = Number(multiplier)
  const raw = unrealizedPnl(position, mark)

  return Number((raw * (Number.isFinite(factor) && factor > 0 ? factor : 1)).toFixed(10))
}

/**
 * Convert a quote-currency amount into the account currency.
 *
 * @param {number} amount - the amount.
 * @param {string} quoteCcy - the currency it is in.
 * @param {{account?: string, rates?: Record<string, number>}} [fx] - cached rates.
 * @returns {number} the converted amount.
 */
export function toAccountCcy(amount, quoteCcy, fx = {}) {
  const value = Number(amount)
  if (!Number.isFinite(value)) return 0

  const account = String(fx.account ?? 'USDT').toUpperCase()
  const quote = String(quoteCcy ?? account).toUpperCase()
  if (quote === account) return value

  const rate = Number(fx.rates?.[`${quote}${account}`])
  // No cached rate means no conversion, not a guess: an FX fetch on the hot path would
  // cost more than the number is worth, and a wrong rate is worse than an unconverted
  // one the trader can still read.
  return Number.isFinite(rate) && rate > 0 ? Number((value * rate).toFixed(8)) : value
}

/**
 * Format a P&L for display, sign included.
 *
 * @param {number} amount - the amount.
 * @param {number} [decimals] - decimal places.
 * @returns {string} e.g. '+12.40', '−3.10', '0.00'.
 */
export function fmtPnl(amount, decimals = 2) {
  const value = Number(amount)
  if (!Number.isFinite(value)) return '—'

  const places = Math.max(0, Math.min(8, Math.floor(Number(decimals) || 0)))
  const text = Math.abs(value).toFixed(places)
  if (Math.abs(value) < 10 ** -places / 2) return text

  // An explicit sign on the positive side too: a column where only losses are marked
  // makes a profit look like an absolute figure at a glance.
  return value > 0 ? `+${text}` : `−${text}`
}

/**
 * The CSS class a P&L cell should wear.
 *
 * @param {number} amount - the amount.
 * @returns {string} the class.
 */
export function pnlClass(amount) {
  const value = Number(amount)
  if (!Number.isFinite(value) || value === 0) return 'pnl'

  return value > 0 ? 'pnl pnl--up' : 'pnl pnl--down'
}

/**
 * Mark and price a whole book of positions.
 *
 * @param {object[]} positions - the open positions.
 * @param {{rates?: object, account?: string}} [fx] - conversion inputs.
 * @returns {Array<object>} rows with mark, floating P&L and display fields.
 */
export function priceBook(positions, fx = {}) {
  return (Array.isArray(positions) ? positions : []).map((position) => {
    const { mark, source } = midFor(position?.instrument)
    const multiplier = multiplierFor(position?.venue, position?.instrument)
    const raw = floatingPnl({ ...position, mark }, mark, multiplier)
    const unrealized = toAccountCcy(raw, position?.quoteCcy, fx)

    return {
      ...position,
      mark,
      markSource: source,
      side: sideOf(position?.qty),
      unrealized,
      unrealizedLabel: fmtPnl(unrealized),
      pnlClass: pnlClass(unrealized),
    }
  })
}
