import { onTick, recentTrades } from '../pipeline/bus.js'
import { candles } from '../pipeline/candles.js'
import { createRenderLoop, repaintOnTheme, sizeCanvas, chartPalette } from './canvas.js'
import { drawAxisGrid } from './axis.js'
import { drawTickLine } from './tickline.js'
import { drawCandles, drawVolumeBand } from './candlestick.js'
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

  return startChart(draw, { canvas, raf, size, symbol })
}

/**
 * Mount a live micro-candle chart on a canvas.
 *
 * @param {HTMLCanvasElement} canvas - the canvas to draw on.
 * @param {{symbol: string, interval?: () => string, tickSize?: number, limit?: number,
 *   raf?: Function, size?: () => object}} [options] - what to show.
 * @returns {{loop: object, draw: Function, dispose: () => void}} the mounted chart.
 */
export function mountCandleChart(canvas, options = {}) {
  const {
    symbol = '',
    interval = () => '1s',
    tickSize = 0.01,
    limit = 120,
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
    const list = candles(symbol, interval(), limit)
    const range = autoRange(
      // Wicks define the frame, not closes: a range built from closes clips the spikes.
      list.flatMap((c) => [Number(c?.h), Number(c?.l)]),
      tickSize,
    )

    ctx.clearRect?.(0, 0, applied.width, applied.height)
    drawAxisGrid(ctx, { range, ...applied, palette, tickSize })
    drawVolumeBand(ctx, { candles: list, ...applied, palette })
    return drawCandles(ctx, { candles: list, range, ...applied, palette })
  }

  return startChart(draw, { canvas, raf, size, symbol })
}

/**
 * Start a draw function on its own loop, wired to ticks and theme flips.
 *
 * @param {(ctx: object, size: object) => unknown} draw - the renderer.
 * @param {{canvas?: object, raf?: Function, size?: () => object, symbol?: string}} options
 * @returns {{loop: object, draw: Function, dispose: () => void}} the mounted chart.
 */
export function startChart(draw, options = {}) {
  const { canvas, raf, size, symbol = '', scheduler = null, id = symbol, priority } = options

  // Two ways to run: standalone (its own dirty-flag loop) or on the shared scheduler,
  // which is what the dashboard uses so forty sparklines cannot outvote the price chart.
  if (scheduler) {
    const render = () => draw(canvas?.getContext?.('2d') ?? null, size?.() ?? {})
    const unregister = scheduler.register(id, render, { priority })
    const stops = [
      unregister,
      markOnTick(symbol, { markDirty: () => scheduler.markDirty(id) }),
      repaintOnTheme({ markDirty: () => scheduler.markDirty(id) }),
    ]
    scheduler.markDirty(id)

    return { loop: scheduler, draw, dispose: () => stops.forEach((stop) => stop()) }
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
