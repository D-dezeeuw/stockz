import { gridLines, priceToY, formatPrice } from './scale.js'

/**
 * The price axis: gridlines and right-edge labels.
 *
 * Split out from the price renderers on purpose. Every chart type in the phase — tick
 * line, micro-candles, sparkline-with-scale — wants the same axis, and an axis drawn
 * three slightly different ways is three chances for the labels to disagree with the
 * line they annotate.
 */

/**
 * The y positions and labels for a range's gridlines.
 *
 * Pure, so the placement can be asserted without a canvas: the drawing below is a
 * transcription of this list, nothing more.
 *
 * @param {{min: number, max: number}} range - drawing range.
 * @param {number} height - plot height in CSS pixels.
 * @param {{count?: number, tickSize?: number}} [options] - line count and price precision.
 * @returns {Array<{price: number, y: number, label: string}>} the axis rows.
 */
export function axisRows(range, height, options = {}) {
  const { count = 4, tickSize = 0.01 } = options

  return gridLines(range, count).map((price) => ({
    price,
    y: priceToY(price, range, height),
    label: formatPrice(price, tickSize),
  }))
}

/**
 * Draw the axis gridlines and their labels.
 *
 * @param {CanvasRenderingContext2D} ctx - the 2D context.
 * @param {{range: object, width: number, height: number, palette: object,
 *   tickSize?: number, count?: number, labels?: boolean}} options - what to draw.
 * @returns {number} the number of lines drawn.
 */
export function drawAxisGrid(ctx, options = {}) {
  const { range, width = 0, height = 0, palette = {}, tickSize, count, labels = true } = options
  if (!ctx) return 0

  const rows = axisRows(range, height, { count, tickSize })

  ctx.save?.()
  ctx.strokeStyle = palette.grid ?? '#1b3a24'
  ctx.fillStyle = palette.muted ?? '#6f8a76'
  ctx.lineWidth = 1
  ctx.font = '10px ui-monospace, monospace'
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'

  for (const row of rows) {
    ctx.beginPath?.()
    // The half-pixel offset puts a 1px line on a device pixel instead of straddling two,
    // which is the difference between a hairline and a grey smear.
    const y = Math.round(row.y) + 0.5
    ctx.moveTo?.(0, y)
    ctx.lineTo?.(width, y)
    ctx.stroke?.()

    if (labels) ctx.fillText?.(row.label, width - 4, y)
  }

  ctx.restore?.()
  return rows.length
}
