import { setValue, appState, watch } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { sizeCanvas, chartPalette } from '../charts/canvas.js'
import { mapRange, gridLines } from '../charts/scale.js'

/**
 * The shape of the session.
 *
 * The KPI tiles say whether the edge exists; this says what the ride was like, and they are
 * genuinely different questions. Two traders can end the week on the same number with one of
 * them having ground it out and the other having been down four thousand on Wednesday, and
 * only the second one is about to blow up.
 *
 * The curve is **per trade, not per hour**. Time on the x-axis makes a lunch break look like
 * a flat patch of trading, and a scalper's day is not evenly distributed. Trade index is the
 * honest axis: every point is a decision, and the distance between two points is one.
 *
 * Colour splits at the zero line rather than at the start. Above water and below water are
 * different psychological states and the chart should not need a legend to say which one the
 * trader is in.
 */

/**
 * The cumulative curve.
 *
 * @param {object[]} trades - the enriched trades, oldest first.
 * @returns {object[]} points of {i, ts, net, equity}.
 */
export function equitySeries(trades) {
  const rows = Array.isArray(trades) ? trades : []
  let running = 0

  return rows.map((trade, index) => {
    running = Number((running + (Number(trade?.net) || 0)).toFixed(8))

    return {
      i: index,
      ts: Number(trade?.closeTs) || 0,
      net: Number(trade?.net) || 0,
      equity: running,
      id: String(trade?.id ?? ''),
    }
  })
}

/**
 * The vertical range the curve needs.
 *
 * @param {object[]} series - the points.
 * @param {number} [pad] - headroom as a fraction.
 * @returns {{min: number, max: number}} the range.
 */
export function equityRange(series, pad = 0.1) {
  const points = Array.isArray(series) ? series : []
  if (points.length === 0) return { min: -1, max: 1 }

  const values = points.map((point) => Number(point?.equity) || 0)
  let min = Math.min(0, ...values)
  let max = Math.max(0, ...values)
  // Zero is always inside the range. A curve that never showed the waterline would let a
  // losing session look like a rising one, which is the single most misleading thing this
  // chart could do.
  if (min === max) {
    min -= 1
    max += 1
  }

  const room = (max - min) * (Number(pad) || 0)

  return { min: min - room, max: max + room }
}

/**
 * The drawdown at each point, and the worst of them.
 *
 * @param {object[]} series - the points.
 * @returns {{maxDrawdown: number, peak: number, trough: number}} the worst run.
 */
export function drawdown(series) {
  const points = Array.isArray(series) ? series : []
  let peak = 0
  let worst = 0
  let at = { peak: 0, trough: 0 }

  for (const point of points) {
    const equity = Number(point?.equity) || 0
    if (equity > peak) peak = equity
    const dip = equity - peak
    // Measured from the running peak, not from zero: a trader who was up two thousand and
    // gave back fifteen hundred has had a drawdown, even though they never went red.
    if (dip < worst) {
      worst = dip
      at = { peak, trough: equity }
    }
  }

  return { maxDrawdown: Number(worst.toFixed(4)), ...at }
}

/**
 * Draw the curve.
 *
 * @param {CanvasRenderingContext2D} ctx - the 2D context.
 * @param {object[]} series - the points.
 * @param {{width: number, height: number}} size - the box.
 * @param {object} [palette] - the theme colours.
 * @returns {boolean} true when something was drawn.
 */
export function drawEquity(ctx, series, size, palette = chartPalette()) {
  const width = Number(size?.width) || 0
  const height = Number(size?.height) || 0
  if (!ctx || width <= 0 || height <= 0) return false

  ctx.clearRect(0, 0, width, height)
  const points = Array.isArray(series) ? series : []
  if (points.length === 0) return false

  const range = equityRange(points)
  const y = (value) => mapRange(value, range.min, range.max, height, 0)
  const x = (index) => (points.length === 1 ? width / 2 : mapRange(index, 0, points.length - 1, 0, width))

  // Gridlines first and dim: they are reference, not content, and a chart whose grid draws
  // over its data is a chart nobody trusts the shape of.
  ctx.strokeStyle = palette.grid ?? '#1b3a24'
  ctx.lineWidth = 1
  for (const line of gridLines(range, 4)) {
    const gy = Math.round(y(line)) + 0.5
    ctx.beginPath()
    ctx.moveTo(0, gy)
    ctx.lineTo(width, gy)
    ctx.stroke()
  }

  // The waterline, brighter than the grid: it is the one reference that means something.
  const zero = Math.round(y(0)) + 0.5
  ctx.strokeStyle = palette.muted ?? '#6f8a76'
  ctx.beginPath()
  ctx.moveTo(0, zero)
  ctx.lineTo(width, zero)
  ctx.stroke()

  ctx.lineWidth = 1.5
  ctx.lineJoin = 'round'
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1]
    const to = points[index]
    // Segment-by-segment rather than one path: above water and below water are different
    // states, and the chart should not need a legend to say which one the trader is in.
    ctx.strokeStyle = to.equity >= 0 ? (palette.up ?? '#00e676') : (palette.down ?? '#ff9100')
    ctx.beginPath()
    ctx.moveTo(x(from.i), y(from.equity))
    ctx.lineTo(x(to.i), y(to.equity))
    ctx.stroke()
  }

  return true
}

/**
 * The point nearest a pointer.
 *
 * @param {number} px - the pointer x.
 * @param {object[]} series - the points.
 * @param {number} width - the canvas width.
 * @returns {object|null} the point.
 */
export function nearestPoint(px, series, width) {
  const points = Array.isArray(series) ? series : []
  if (points.length === 0 || !(Number(width) > 0)) return null

  // Snapped to a point rather than interpolated: every point is a trade, and a crosshair
  // reading a value between two trades would be showing an equity that never existed.
  const ratio = Math.min(1, Math.max(0, Number(px) / Number(width)))
  const index = Math.round(ratio * (points.length - 1))

  return points[index] ?? null
}

/**
 * Publish the curve and its worst run.
 *
 * @param {object[]} [trades] - the enriched trades.
 * @returns {object[]} the series.
 */
export function refreshEquity(trades = appState.analytics?.trades) {
  // Oldest first: the journal publishes newest-first for reading, and a curve drawn in that
  // order would run backwards.
  const rows = [...(Array.isArray(trades) ? trades : [])].reverse()
  const series = equitySeries(rows)
  const worst = drawdown(series)

  setValue(PATHS.analytics.equity, series.slice(-500))
  setValue(PATHS.analytics.drawdown, worst)

  return series
}

/**
 * Mount the curve onto a canvas.
 *
 * @param {HTMLCanvasElement} canvas - the canvas.
 * @param {{series?: () => object[]}} [deps] - injectable plumbing.
 * @returns {() => void} a redraw function.
 */
export function mountEquity(canvas, deps = {}) {
  if (!canvas?.getContext) return () => {}

  const read = deps.series ?? (() => appState.analytics?.equity ?? [])

  return () => {
    // Re-rasterised on every draw rather than on resize alone: a block that changed size
    // between frames would otherwise render the previous size's bitmap stretched.
    const size = sizeCanvas(canvas, { width: canvas.clientWidth, height: canvas.clientHeight })
    drawEquity(canvas.getContext('2d'), read(), size)
  }
}

/**
 * Find the canvas and keep it in step with the curve.
 *
 * @param {{doc?: Document, raf?: Function}} [deps] - injectable plumbing.
 * @returns {Function|null} the redraw, or null when there is no canvas.
 */
export function startEquityChart(deps = {}) {
  const doc = deps.doc ?? globalThis.document
  const canvas = doc?.getElementById?.('equity-canvas')
  if (!canvas) return null

  const redraw = mountEquity(canvas, deps)
  const raf = deps.raf ?? globalThis.requestAnimationFrame?.bind(globalThis) ?? ((fn) => fn())

  // Redrawn on a frame rather than inside the watch: the curve changes when a trade closes,
  // and closing a trade is already the busiest moment the desk has.
  watch([PATHS.analytics.equity], () => raf(redraw))
  redraw()

  return redraw
}
