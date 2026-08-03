import { tickDecimals } from './math.js'

/**
 * Display formatting for the desk.
 *
 * Every number the trader reads goes through here so decimals, signs and grouping stay
 * identical across blocks (tabular numerals do the rest — see design-system.md).
 */

/**
 * Format a price at its instrument's tick precision.
 *
 * @param {number} value - the price.
 * @param {number} [tickSize] - venue tick, e.g. 0.01; defaults to cent precision.
 * @returns {string} fixed-decimal price, or '—' when the value is not a number.
 */
export function formatPrice(value, tickSize = 0.01) {
  if (!Number.isFinite(value)) return '—'
  return value.toFixed(tickDecimals(tickSize))
}

/**
 * Format a quantity at its instrument's lot granularity, truncating rather than
 * rounding — never display size the venue would reject as too large.
 *
 * @param {number} value - the quantity.
 * @param {number} [lotSize] - venue lot step, e.g. 0.001.
 * @returns {string} truncated quantity, or '—' when the value is not a number.
 */
export function formatQty(value, lotSize = 1) {
  if (!Number.isFinite(value)) return '—'

  const decimals = tickDecimals(lotSize)
  const factor = 10 ** decimals
  const truncated = Math.trunc(value * factor) / factor
  return truncated.toFixed(decimals)
}

/**
 * Format a percentage move with an explicit sign, as PnL badges show it.
 *
 * @param {number} value - percent value, e.g. 1.2345 for +1.23%.
 * @returns {string} e.g. '+1.23%', '-0.40%', '0.00%'; '—' when not a number.
 */
export function formatPct(value) {
  if (!Number.isFinite(value)) return '—'

  const fixed = value.toFixed(2)
  return Number(fixed) > 0 ? `+${fixed}%` : `${fixed}%`
}

/**
 * Format a signed money amount for PnL readouts.
 *
 * @param {number} value - the amount.
 * @param {number} [decimals] - decimal places.
 * @returns {string} e.g. '+12.40', '-3.10'; '—' when not a number.
 */
export function formatSigned(value, decimals = 2) {
  if (!Number.isFinite(value)) return '—'

  const fixed = value.toFixed(decimals)
  return Number(fixed) > 0 ? `+${fixed}` : `${fixed}`
}

/**
 * Compact large numbers for dense tiles (volume, turnover).
 *
 * @param {number} value - the number.
 * @returns {string} e.g. '1.2M', '45.0K', '870'; '—' when not a number.
 */
export function formatCompact(value) {
  if (!Number.isFinite(value)) return '—'

  const abs = Math.abs(value)
  if (abs >= 1e9) return `${(value / 1e9).toFixed(1)}B`
  if (abs >= 1e6) return `${(value / 1e6).toFixed(1)}M`
  if (abs >= 1e3) return `${(value / 1e3).toFixed(1)}K`
  return String(value)
}
