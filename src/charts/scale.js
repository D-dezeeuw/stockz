/**
 * Chart scale maths.
 *
 * All the arithmetic a renderer needs, as pure functions — the draw calls themselves stay
 * a thin untested edge, but the maths that decides *where* a price lands is exactly the
 * part that goes wrong in subtle ways: an off-by-one on the y-axis puts the last price a
 * pixel off the line, and on a tick chart that is the difference between reading "at the
 * offer" and "through it".
 */

/**
 * Map a value from one range to another.
 *
 * @param {number} value - input.
 * @param {number} inMin - input range start.
 * @param {number} inMax - input range end.
 * @param {number} outMin - output range start.
 * @param {number} outMax - output range end.
 * @returns {number} the mapped value; the output midpoint for a zero-width input range.
 */
export function mapRange(value, inMin, inMax, outMin, outMax) {
  const span = inMax - inMin
  if (!Number.isFinite(value) || !Number.isFinite(span)) return outMin
  // A flat series has no range to map into; centring beats dividing by zero.
  if (span === 0) return (outMin + outMax) / 2

  return outMin + ((value - inMin) / span) * (outMax - outMin)
}

/**
 * The price range to draw, padded so the line never rides the edge.
 *
 * @param {number[]} prices - the series.
 * @param {number} [padRatio] - fraction of range added above and below.
 * @returns {{min: number, max: number}} the drawing range.
 */
export function priceRange(prices, padRatio = 0.08) {
  const list = (Array.isArray(prices) ? prices : []).filter(Number.isFinite)
  if (list.length === 0) return { min: 0, max: 1 }

  const min = Math.min(...list)
  const max = Math.max(...list)

  // A flat series still needs a visible band, or the line renders on the axis itself.
  if (min === max) return { min: min - 0.5, max: max + 0.5 }

  const pad = (max - min) * padRatio
  return { min: min - pad, max: max + pad }
}

/**
 * Price → y pixel. Inverted, because canvas y grows downward and prices grow upward.
 *
 * @param {number} price - the price.
 * @param {{min: number, max: number}} range - drawing range.
 * @param {number} height - canvas height in CSS pixels.
 * @returns {number} y coordinate.
 */
export function priceToY(price, range, height) {
  return mapRange(price, range?.min ?? 0, range?.max ?? 1, height, 0)
}

/**
 * Y pixel → price. The inverse of {@link priceToY}, for reading the cursor.
 *
 * @param {number} y - y coordinate.
 * @param {{min: number, max: number}} range - drawing range.
 * @param {number} height - canvas height in CSS pixels.
 * @returns {number} the price under that pixel.
 */
export function yToPrice(y, range, height) {
  const min = range?.min ?? 0
  const max = range?.max ?? 1
  if (!Number.isFinite(height) || height <= 0) return min

  return mapRange(y, height, 0, min, max)
}

/**
 * Timestamp → x pixel across a sliding window.
 *
 * The newest edge of the window is the right edge of the plot: on a scalping chart the
 * present moment is pinned there and history scrolls away to the left.
 *
 * @param {number} ts - epoch milliseconds.
 * @param {{from: number, to: number}} window - the visible time window.
 * @param {number} width - canvas width in CSS pixels.
 * @returns {number} x coordinate.
 */
export function timeToX(ts, window, width) {
  const from = Number(window?.from)
  const to = Number(window?.to)
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return width

  return mapRange(ts, from, to, 0, width)
}

/**
 * X pixel → timestamp. The inverse of {@link timeToX}, for the crosshair readout.
 *
 * @param {number} x - x coordinate.
 * @param {{from: number, to: number}} window - the visible time window.
 * @param {number} width - canvas width in CSS pixels.
 * @returns {number} epoch milliseconds.
 */
export function xToTime(x, window, width) {
  const from = Number(window?.from)
  const to = Number(window?.to)
  if (!Number.isFinite(from) || !Number.isFinite(to) || !Number.isFinite(width) || width <= 0) {
    return Number.isFinite(to) ? to : 0
  }

  return mapRange(x, 0, width, from, to)
}

/**
 * Auto-frame a slice of prices, snapped to the instrument's tick size.
 *
 * Snapping matters: an unsnapped range puts the axis labels between tradable prices, and
 * a scalper reading "63,421.037" on an instrument that only trades in 0.1 steps is
 * reading a number that cannot exist.
 *
 * @param {number[]} prices - the visible slice.
 * @param {number} [tickSize] - the instrument's minimum price increment.
 * @param {number} [padRatio] - fraction of range added above and below.
 * @returns {{min: number, max: number}} the drawing range.
 */
export function autoRange(prices, tickSize = 0, padRatio = 0.08) {
  const { min, max } = priceRange(prices, padRatio)
  const step = Number(tickSize)
  if (!Number.isFinite(step) || step <= 0) return { min, max }

  return {
    min: Number((Math.floor(min / step) * step).toFixed(10)),
    max: Number((Math.ceil(max / step) * step).toFixed(10)),
  }
}

/**
 * Format a price with the decimals its tick size implies.
 *
 * @param {number} price - the price.
 * @param {number} [tickSize] - the instrument's minimum price increment.
 * @returns {string} the formatted price.
 */
export function formatPrice(price, tickSize = 0.01) {
  const value = Number(price)
  if (!Number.isFinite(value)) return '—'

  const step = Number(tickSize)
  // The tick size *is* the precision contract: 0.001 means three decimals, 0.5 means one,
  // 1 means none. Deriving it beats a per-venue table that drifts out of date.
  const decimals =
    Number.isFinite(step) && step > 0 ? Math.max(0, Math.min(10, decimalsOf(step))) : 2

  return value.toFixed(decimals)
}

/**
 * Count the decimals a tick size carries.
 *
 * @param {number} step - the tick size.
 * @returns {number} decimal places.
 */
export function decimalsOf(step) {
  const text = String(step)
  // Small ticks arrive from JSON in exponential form (1e-8); the exponent is the answer.
  const exponent = text.match(/e-(\d+)$/i)
  if (exponent) return Number(exponent[1])

  const dot = text.indexOf('.')
  return dot === -1 ? 0 : text.length - dot - 1
}

/**
 * Compose two pan/zoom transforms into one.
 *
 * @param {{offset?: number, scale?: number}} a - the outer transform.
 * @param {{offset?: number, scale?: number}} b - the inner transform.
 * @returns {{offset: number, scale: number}} the combined transform.
 */
export function composeTransform(a, b) {
  const scaleA = Number(a?.scale) || 1
  const scaleB = Number(b?.scale) || 1
  const offsetA = Number(a?.offset) || 0
  const offsetB = Number(b?.offset) || 0

  return { offset: offsetA + offsetB * scaleA, scale: scaleA * scaleB }
}

/**
 * Apply a pan/zoom transform to an x coordinate.
 *
 * @param {number} x - the untransformed coordinate.
 * @param {{offset?: number, scale?: number}} [transform] - the transform.
 * @returns {number} the transformed coordinate.
 */
export function applyTransform(x, transform) {
  const value = Number(x)
  if (!Number.isFinite(value)) return 0

  return value * (Number(transform?.scale) || 1) + (Number(transform?.offset) || 0)
}

/**
 * Index → x pixel across a series.
 *
 * @param {number} index - position in the series.
 * @param {number} count - series length.
 * @param {number} width - canvas width in CSS pixels.
 * @returns {number} x coordinate.
 */
export function indexToX(index, count, width) {
  if (!Number.isFinite(count) || count <= 1) return width
  return mapRange(index, 0, count - 1, 0, width)
}

/**
 * Candle geometry for one bar.
 *
 * @param {object} candle - {o,h,l,c}.
 * @param {{min: number, max: number}} range - drawing range.
 * @param {{x: number, width: number, height: number}} box - placement.
 * @returns {{x: number, width: number, bodyTop: number, bodyHeight: number,
 *   wickTop: number, wickBottom: number, up: boolean}} geometry.
 */
export function candleGeometry(candle, range, box) {
  const open = Number(candle?.o ?? 0)
  const close = Number(candle?.c ?? 0)
  const up = close >= open

  const top = priceToY(Math.max(open, close), range, box?.height ?? 0)
  const bottom = priceToY(Math.min(open, close), range, box?.height ?? 0)

  return {
    x: box?.x ?? 0,
    width: Math.max(1, box?.width ?? 1),
    bodyTop: top,
    // A doji would otherwise be invisible; one pixel keeps it on screen.
    bodyHeight: Math.max(1, bottom - top),
    wickTop: priceToY(Number(candle?.h ?? close), range, box?.height ?? 0),
    wickBottom: priceToY(Number(candle?.l ?? close), range, box?.height ?? 0),
    up,
  }
}

/**
 * Round price gridlines inside a range.
 *
 * @param {{min: number, max: number}} range - drawing range.
 * @param {number} [count] - approximate number of lines.
 * @returns {number[]} gridline prices, ascending.
 */
export function gridLines(range, count = 4) {
  const min = Number(range?.min)
  const max = Number(range?.max)
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min || count < 1) return []

  const rawStep = (max - min) / count
  const magnitude = 10 ** Math.floor(Math.log10(rawStep))
  // Snap to 1/2/2.5/5 x a power of ten so labels read as round numbers rather than
  // 23.7419. The 2.5 matters: it is what produces quarter steps (25, 250, 0.25), which is
  // how price axes are conventionally divided, and without it a request for four lines
  // silently returns three.
  const step =
    [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rawStep) ?? magnitude * 10

  const lines = []
  for (let price = Math.ceil(min / step) * step; price <= max; price += step) {
    lines.push(Number(price.toFixed(10)))
  }
  return lines
}
