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
