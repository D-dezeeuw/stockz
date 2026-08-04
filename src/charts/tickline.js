import { timeToX, priceToY } from './scale.js'

/**
 * The tick line — the raw wiggle itself.
 *
 * This is the chart a scalper actually trades off, so it has two jobs the pretty ones
 * don't: it must stay honest, and it must stay cheap.
 *
 * **Honest** means never drawing a price that did not print. A feed stall becomes a gap,
 * not a straight line implying the market sat still — a flat line across a two-second
 * outage reads as "no volatility" and invites exactly the wrong-sized entry.
 *
 * **Cheap** means a busy pair pushing thousands of prints into a 600px plot costs one
 * segment per pixel column, not one per print. Min/max downsampling keeps every spike
 * visible while capping the path at twice the column count.
 */

/**
 * Reduce a tick series to at most one min/max segment per pixel column.
 *
 * @param {Array<{ts: number, px: number}>} ticks - the series, oldest first.
 * @param {{from: number, to: number}} window - the visible time window.
 * @param {number} width - plot width in CSS pixels.
 * @returns {Array<{x: number, min: number, max: number, first: number, last: number}>}
 *   one entry per occupied column, left to right.
 */
export function downsampleColumn(ticks, window, width) {
  const list = Array.isArray(ticks) ? ticks : []
  const columns = new Map()

  for (const tick of list) {
    const px = Number(tick?.px)
    const ts = Number(tick?.ts)
    if (!Number.isFinite(px) || !Number.isFinite(ts)) continue

    const x = Math.round(timeToX(ts, window, width))
    const column = columns.get(x)

    if (!column) {
      columns.set(x, { x, min: px, max: px, first: px, last: px })
      continue
    }
    // Keeping both extremes is what preserves a one-frame spike: an average would erase
    // exactly the print the scalper is watching for.
    if (px < column.min) column.min = px
    if (px > column.max) column.max = px
    column.last = px
  }

  return [...columns.values()].sort((a, b) => a.x - b.x)
}

/**
 * Split a tick series wherever the feed went quiet longer than it should have.
 *
 * @param {Array<{ts: number}>} ticks - the series, oldest first.
 * @param {number} [maxGapMs] - spacing above which the line breaks.
 * @returns {Array<Array<object>>} contiguous runs.
 */
export function gapSplit(ticks, maxGapMs = 2000) {
  const list = Array.isArray(ticks) ? ticks : []
  const runs = []
  let run = []
  let previous = null

  for (const tick of list) {
    const ts = Number(tick?.ts)
    if (!Number.isFinite(ts)) continue

    if (previous !== null && ts - previous > maxGapMs) {
      if (run.length) runs.push(run)
      run = []
    }
    run.push(tick)
    previous = ts
  }

  if (run.length) runs.push(run)
  return runs
}

/**
 * The radius of the last-price pulse at a given moment.
 *
 * @param {number} now - current time in milliseconds.
 * @param {number} lastTickAt - when the newest tick landed.
 * @param {{base?: number, peak?: number, durationMs?: number}} [options] - pulse shape.
 * @returns {number} radius in CSS pixels.
 */
export function pulseRadius(now, lastTickAt, options = {}) {
  const { base = 2.5, peak = 6, durationMs = 400 } = options
  const elapsed = Number(now) - Number(lastTickAt)
  if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed >= durationMs) return base

  // Ease out: the dot snaps open on the print and settles back, so a burst of trades
  // reads as a heartbeat rather than a strobe.
  const progress = elapsed / durationMs
  return base + (peak - base) * (1 - progress) ** 2
}

/**
 * Draw the tick line.
 *
 * @param {CanvasRenderingContext2D} ctx - the 2D context.
 * @param {{ticks: Array<object>, window: object, range: object, width: number,
 *   height: number, palette: object, maxGapMs?: number, now?: number,
 *   glow?: boolean}} options - what to draw.
 * @returns {number} the number of segments drawn.
 */
export function drawTickLine(ctx, options = {}) {
  const {
    ticks = [],
    window,
    range,
    width = 0,
    height = 0,
    palette = {},
    maxGapMs = 2000,
    now = 0,
    glow = true,
  } = options
  if (!ctx) return 0

  const runs = gapSplit(ticks, maxGapMs)
  const rising = trendUp(ticks)
  const colour = rising ? (palette.up ?? '#00e676') : (palette.down ?? '#ff9100')

  ctx.save?.()
  ctx.strokeStyle = colour
  ctx.lineWidth = 1.5
  ctx.lineJoin = 'round'
  if (glow) {
    // The phosphor look is one low-alpha blur pass, not a second stroke: a terminal glow
    // that costs a repaint is a glow that gets switched off.
    ctx.shadowBlur = 6
    ctx.shadowColor = colour
  }

  let segments = 0
  for (const run of runs) {
    const columns = downsampleColumn(run, window, width)
    if (columns.length === 0) continue

    ctx.beginPath?.()
    columns.forEach((column, index) => {
      const y = priceToY(column.last, range, height)
      if (index === 0) ctx.moveTo?.(column.x, y)
      else ctx.lineTo?.(column.x, y)

      // A column holding a spike draws its full extent, or the wiggle flattens.
      if (column.max !== column.min) {
        ctx.moveTo?.(column.x, priceToY(column.max, range, height))
        ctx.lineTo?.(column.x, priceToY(column.min, range, height))
        ctx.moveTo?.(column.x, y)
      }
      segments += 1
    })
    ctx.stroke?.()
  }

  const newest = ticks[ticks.length - 1]
  if (newest) {
    ctx.beginPath?.()
    ctx.fillStyle = colour
    ctx.arc?.(
      timeToX(Number(newest.ts), window, width),
      priceToY(Number(newest.px), range, height),
      pulseRadius(now, Number(newest.ts)),
      0,
      Math.PI * 2,
    )
    ctx.fill?.()
  }

  ctx.restore?.()
  return segments
}

/**
 * Whether a tick series is rising over its visible span.
 *
 * @param {Array<{px: number}>} ticks - the series, oldest first.
 * @returns {boolean} true when the newest price is at or above the oldest.
 */
export function trendUp(ticks) {
  const list = (Array.isArray(ticks) ? ticks : []).filter((t) => Number.isFinite(Number(t?.px)))
  if (list.length === 0) return true

  return Number(list[list.length - 1].px) >= Number(list[0].px)
}
