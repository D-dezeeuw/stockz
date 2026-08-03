/**
 * Scalping math primitives.
 *
 * Pure, allocation-free and O(1) — these run on the order and tick hot paths, so they
 * never throw: bad input degrades to a safe number rather than interrupting a trade.
 */

/**
 * Constrain a value to an inclusive range.
 *
 * @param {number} value - the raw value.
 * @param {number} min - lower bound.
 * @param {number} max - upper bound.
 * @returns {number} the bounded value; NaN input yields the lower bound.
 */
export function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min
  return Math.min(Math.max(value, min), max)
}

/**
 * Round a price to the nearest venue tick, avoiding binary float drift
 * (0.1 + 0.2 style errors would otherwise produce unsubmittable prices).
 *
 * @param {number} price - raw price.
 * @param {number} tickSize - venue tick, e.g. 0.01.
 * @returns {number} price snapped to a tick multiple; the raw price when tickSize <= 0.
 */
export function roundToTick(price, tickSize) {
  if (!Number.isFinite(price)) return 0
  if (!Number.isFinite(tickSize) || tickSize <= 0) return price

  const decimals = tickDecimals(tickSize)
  const steps = Math.round(price / tickSize)
  return Number((steps * tickSize).toFixed(decimals))
}

/**
 * Decimal places implied by a tick or lot size (0.01 -> 2, 5 -> 0).
 *
 * @param {number} step - tick or lot size.
 * @returns {number} decimal places, 0 when the step is not a finite positive number.
 */
export function tickDecimals(step) {
  if (!Number.isFinite(step) || step <= 0) return 0

  const text = step.toExponential()
  const exponent = Number(text.slice(text.indexOf('e') + 1))
  return exponent < 0 ? Math.abs(exponent) : 0
}

/**
 * Difference between two prices in basis points — the scalper's unit for spread,
 * slippage and edge.
 *
 * @param {number} a - the measured price.
 * @param {number} b - the reference price.
 * @returns {number} ((a - b) / b) * 10000, or 0 when the reference is unusable.
 */
export function bpsDiff(a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return 0
  return ((a - b) / b) * 10000
}
