import { setValue, appState, watch } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { sizeCanvas, chartPalette } from '../charts/canvas.js'
import { mapRange } from '../charts/scale.js'
import { equitySeries } from './equity.js'

/**
 * The worst pain the strategy inflicts.
 *
 * The equity curve shows where the money went; this shows how it felt. They are not the same
 * chart and a trader needs both, because the question that decides whether a strategy is
 * survivable is not "does it make money" but "how long, and how far down, does it make you
 * wait". A curve that ends up four thousand having spent three weeks eight thousand under
 * water is a curve almost nobody actually holds through.
 *
 * Everything here is measured **from the running peak**, not from zero. A trader up two
 * thousand who gives back fifteen hundred has been in a drawdown, and a chart that only knew
 * about losses would show that as a flat green line.
 *
 * A trough with no recovery is reported as unrecovered rather than as recovered-at-the-end.
 * "Still down" and "recovered on the last trade" are different facts, and the second one is
 * the more comfortable lie.
 */

/**
 * Distance below the running peak at every trade.
 *
 * @param {object[]} series - the equity points, oldest first.
 * @returns {object[]} points of {i, ts, equity, peak, depth}.
 */
export function drawdownSeries(series) {
  const points = Array.isArray(series) ? series : []
  let peak = 0

  return points.map((point) => {
    const equity = Number(point?.equity) || 0
    if (equity > peak) peak = equity

    return {
      i: Number(point?.i) || 0,
      ts: Number(point?.ts) || 0,
      equity,
      peak,
      // Zero or negative, never positive: this is a chart of how far under water, and a
      // positive value here would be a new high pretending to be a drawdown.
      depth: Number((equity - peak).toFixed(4)),
    }
  })
}

/**
 * The worst slide, and whether it ended.
 *
 * @param {object[]} series - the drawdown points.
 * @returns {object} the deepest trough.
 */
export function maxDrawdown(series) {
  const points = Array.isArray(series) ? series : []
  if (points.length === 0) {
    return { depth: 0, peakIndex: 0, troughIndex: 0, recoveredIndex: null, duration: 0, recovered: false }
  }

  let worst = { depth: 0, troughIndex: 0, peak: 0 }
  for (const point of points) {
    if (point.depth < worst.depth) {
      worst = { depth: point.depth, troughIndex: point.i, peak: point.peak }
    }
  }

  // The peak that started it: the last point at or above that high before the trough.
  let peakIndex = 0
  for (const point of points) {
    if (point.i > worst.troughIndex) break
    if (point.equity >= worst.peak) peakIndex = point.i
  }

  // Recovery is a *later* point back at the old high. Absent one, the slide is unrecovered —
  // "still down" and "recovered on the last trade" are different facts, and the second is the
  // more comfortable lie.
  const recovery = points.find((point) => point.i > worst.troughIndex && point.equity >= worst.peak)

  return {
    depth: worst.depth,
    peakIndex,
    troughIndex: worst.troughIndex,
    recoveredIndex: recovery ? recovery.i : null,
    duration: (recovery ? recovery.i : points[points.length - 1].i) - peakIndex,
    recovered: Boolean(recovery),
  }
}

/**
 * How far under water the desk is right now.
 *
 * @param {object[]} series - the drawdown points.
 * @returns {number} the current depth, zero or negative.
 */
export function currentDepth(series) {
  const points = Array.isArray(series) ? series : []

  return points.length ? points[points.length - 1].depth : 0
}

/**
 * Draw the lake.
 *
 * @param {CanvasRenderingContext2D} ctx - the 2D context.
 * @param {object[]} series - the drawdown points.
 * @param {{width: number, height: number}} size - the box.
 * @param {object} [palette] - the theme colours.
 * @returns {boolean} true when drawn.
 */
export function drawUnderwater(ctx, series, size, palette = chartPalette()) {
  const width = Number(size?.width) || 0
  const height = Number(size?.height) || 0
  const points = Array.isArray(series) ? series : []
  if (!ctx || width <= 0 || height <= 0 || points.length === 0) return false

  ctx.clearRect(0, 0, width, height)

  const deepest = Math.min(-1, ...points.map((point) => point.depth))
  const y = (depth) => mapRange(depth, deepest, 0, height, 0)
  const x = (index) =>
    points.length === 1 ? width / 2 : mapRange(index, 0, points.length - 1, 0, width)

  // Filled rather than stroked: the area is the message. A line at the same coordinates
  // reads as a value moving around, and an area reads as time spent under water, which is
  // the thing that actually breaks people.
  ctx.beginPath()
  ctx.moveTo(x(0), y(0))
  points.forEach((point, index) => ctx.lineTo(x(index), y(point.depth)))
  ctx.lineTo(x(points.length - 1), y(0))
  ctx.closePath()
  ctx.fillStyle = palette.down ?? '#ff9100'
  ctx.globalAlpha = 0.35
  ctx.fill()
  ctx.globalAlpha = 1

  return true
}

/**
 * Publish the drawdown picture.
 *
 * @param {object[]} [trades] - the enriched trades, newest first.
 * @returns {object[]} the drawdown series.
 */
export function refreshDrawdown(trades = appState.journal?.filtered) {
  const ordered = [...(Array.isArray(trades) ? trades : [])].reverse()
  const series = drawdownSeries(equitySeries(ordered))
  const worst = maxDrawdown(series)
  const now = currentDepth(series)

  setValue(PATHS.analytics.underwater, series.slice(-500))
  setValue(PATHS.analytics.worstRun, {
    ...worst,
    current: now,
    // Duration in trades, not in time: a scalper's drawdown is measured in how many more
    // decisions they had to make while under water, which is what actually wears them down.
    durationLabel: `${worst.duration} trades`,
    depthLabel: worst.depth.toFixed(2),
    currentLabel: now.toFixed(2),
  })

  return series
}

/**
 * Mount and keep the lake drawn.
 *
 * @param {{doc?: Document, raf?: Function, series?: () => object[]}} [deps] - injectable
 *   plumbing.
 * @returns {Function|null} the redraw, or null when there is no canvas.
 */
export function startUnderwater(deps = {}) {
  const doc = deps.doc ?? globalThis.document
  const canvas = doc?.getElementById?.('underwater-canvas')
  if (!canvas) return null

  const read = deps.series ?? (() => appState.analytics?.underwater ?? [])
  const redraw = () => {
    const size = sizeCanvas(canvas, { width: canvas.clientWidth, height: canvas.clientHeight })
    drawUnderwater(canvas.getContext('2d'), read(), size)
  }

  const raf = deps.raf ?? globalThis.requestAnimationFrame?.bind(globalThis) ?? ((fn) => fn())
  watch([PATHS.analytics.underwater], () => raf(redraw))
  redraw()

  return redraw
}
