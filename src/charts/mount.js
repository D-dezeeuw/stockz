import { onTick, recentTrades } from '../pipeline/bus.js'
import { createRenderLoop, repaintOnTheme, sizeCanvas, chartPalette } from './canvas.js'
import { drawAxisGrid } from './axis.js'
import { drawTickLine } from './tickline.js'
import { autoRange } from './scale.js'

/**
 * Mounting a chart onto a live feed.
 *
 * The renderers are pure draw calls and the pipeline is pure data; this is the one place
 * that knows about both. It is deliberately thin — a tick arrives, the surface is marked
 * dirty, and the next animation frame does the drawing. Nothing here draws directly on
 * the tick, because a burst of forty prints in one frame must still cost exactly one
 * repaint.
 */

/**
 * The visible time window ending now.
 *
 * @param {number} now - current time in milliseconds.
 * @param {number} spanMs - how far back the plot looks.
 * @returns {{from: number, to: number}} the window.
 */
export function tickWindow(now, spanMs = 60000) {
  const to = Number(now)
  const span = Math.max(1, Number(spanMs) || 1)
  if (!Number.isFinite(to)) return { from: 0, to: span }

  return { from: to - span, to }
}

/**
 * Mark a render loop dirty whenever a symbol prints.
 *
 * @param {string} symbol - the instrument to follow.
 * @param {{markDirty: Function}} loop - the render loop.
 * @returns {() => void} unsubscribe.
 */
export function markOnTick(symbol, loop) {
  if (typeof loop?.markDirty !== 'function') return () => {}

  return onTick((tick) => {
    // A chart showing BTC must not repaint because ETH traded.
    if (!symbol || tick?.symbol === symbol) loop.markDirty()
  })
}

/**
 * Mount a live tick chart on a canvas.
 *
 * @param {HTMLCanvasElement} canvas - the canvas to draw on.
 * @param {{symbol: string, spanMs?: number, tickSize?: number, limit?: number,
 *   clock?: () => number, raf?: Function, size?: () => object}} [options] - what to show.
 * @returns {{loop: object, draw: Function, dispose: () => void}} the mounted chart.
 */
export function mountTickChart(canvas, options = {}) {
  const {
    symbol = '',
    spanMs = 60000,
    tickSize = 0.01,
    limit = 600,
    clock = () => Date.now(),
    raf,
    size = () => ({
      width: canvas?.clientWidth ?? 0,
      height: canvas?.clientHeight ?? 0,
    }),
  } = options

  const draw = (ctx, box) => {
    if (!ctx) return 0
    const applied = sizeCanvas(canvas, box)
    const palette = chartPalette()
    const ticks = recentTrades(symbol, limit)
    const now = clock()
    const window = tickWindow(now, spanMs)
    const range = autoRange(
      ticks.map((t) => Number(t?.px)),
      tickSize,
    )

    ctx.clearRect?.(0, 0, applied.width, applied.height)
    drawAxisGrid(ctx, { range, ...applied, palette, tickSize })
    return drawTickLine(ctx, { ticks, window, range, ...applied, palette, now })
  }

  const loop = createRenderLoop(draw, { canvas, raf, size })
  const stops = [markOnTick(symbol, loop), repaintOnTheme(loop)]
  loop.start()

  return {
    loop,
    draw,
    dispose: () => {
      loop.stop()
      for (const stop of stops) stop()
    },
  }
}
