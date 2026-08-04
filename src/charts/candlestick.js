import { candleGeometry, priceToY } from './scale.js'
import { TIMEFRAMES } from '../pipeline/candles.js'
import { registerAction } from '../actions/registry.js'
import { ACTIONS } from '../actions/names.js'
import { PATHS } from '../state/paths.js'
import { setValue } from '../app/engine.js'

/**
 * Micro-candles and their volume band.
 *
 * A 1s candle is a different instrument from a 1m candle: at scalping resolution the
 * body/wick shape *is* the micro-structure — where size got absorbed, where a sweep
 * failed. The aggregation itself lives in the pipeline (`pipeline/candles.js`, wall-clock
 * aligned so two instruments' bars line up); everything here is placement and paint.
 *
 * The volume histogram shares the candles' x geometry exactly. If the bars drift even a
 * pixel from the candle they belong to, the chart starts lying about which second the
 * size actually traded in.
 */

/** Intervals the toggle offers, smallest first. */
export const CANDLE_INTERVALS = Object.freeze(['1s', '5s', '1m'])

/**
 * Horizontal placement for a candle series.
 *
 * @param {number} count - number of candles.
 * @param {number} width - plot width in CSS pixels.
 * @param {number} [gapRatio] - fraction of each slot left as spacing.
 * @returns {Array<{x: number, width: number, slot: number}>} one box per candle,
 *   oldest first.
 */
export function candleBoxes(count, width, gapRatio = 0.2) {
  const total = Math.max(0, Math.floor(Number(count) || 0))
  const plot = Math.max(0, Number(width) || 0)
  if (total === 0 || plot === 0) return []

  const slot = plot / total
  // Below about three pixels a gap costs more than it communicates, so dense series
  // render as a solid block of bodies rather than dissolving into stripes.
  const body = slot < 3 ? slot : Math.max(1, slot * (1 - gapRatio))

  return Array.from({ length: total }, (_, index) => ({
    x: index * slot + (slot - body) / 2,
    width: body,
    slot,
  }))
}

/**
 * The volume scale for a candle series.
 *
 * @param {object[]} list - candles.
 * @returns {number} the largest volume, or 0 when the series carries none.
 */
export function volumeScale(list) {
  const rows = Array.isArray(list) ? list : []
  let max = 0

  for (const candle of rows) {
    const v = Number(candle?.v)
    if (Number.isFinite(v) && v > max) max = v
  }
  return max
}

/**
 * Draw a candle series.
 *
 * @param {CanvasRenderingContext2D} ctx - the 2D context.
 * @param {{candles: object[], range: object, width: number, height: number,
 *   palette: object, gapRatio?: number}} options - what to draw.
 * @returns {number} the number of candles drawn.
 */
export function drawCandles(ctx, options = {}) {
  const { candles: list = [], range, width = 0, height = 0, palette = {}, gapRatio } = options
  if (!ctx || list.length === 0) return 0

  const boxes = candleBoxes(list.length, width, gapRatio)
  ctx.save?.()

  list.forEach((candle, index) => {
    const box = boxes[index]
    if (!box) return

    const geometry = candleGeometry(candle, range, { ...box, height })
    const colour = geometry.up ? (palette.up ?? '#00e676') : (palette.down ?? '#ff9100')
    ctx.fillStyle = colour
    ctx.strokeStyle = colour

    // The wick is a one-pixel column down the centre of the body's slot.
    const centre = Math.round(box.x + box.width / 2) + 0.5
    ctx.beginPath?.()
    ctx.moveTo?.(centre, geometry.wickTop)
    ctx.lineTo?.(centre, geometry.wickBottom)
    ctx.stroke?.()

    ctx.fillRect?.(box.x, geometry.bodyTop, geometry.width, geometry.bodyHeight)
  })

  ctx.restore?.()
  return list.length
}

/**
 * Draw the volume histogram beneath the candles.
 *
 * @param {CanvasRenderingContext2D} ctx - the 2D context.
 * @param {{candles: object[], width: number, height: number, palette: object,
 *   bandHeight?: number, alpha?: number, gapRatio?: number}} options - what to draw.
 * @returns {number} the number of bars drawn.
 */
export function drawVolumeBand(ctx, options = {}) {
  const {
    candles: list = [],
    width = 0,
    height = 0,
    palette = {},
    bandHeight,
    alpha = 0.35,
    gapRatio,
  } = options
  if (!ctx || list.length === 0) return 0

  const max = volumeScale(list)
  if (max <= 0) return 0

  // A fifth of the plot: enough to read relative size, not enough to crowd price.
  const band = Number.isFinite(bandHeight) ? bandHeight : height * 0.2
  const boxes = candleBoxes(list.length, width, gapRatio)

  ctx.save?.()
  ctx.globalAlpha = alpha
  let drawn = 0

  list.forEach((candle, index) => {
    const box = boxes[index]
    const v = Number(candle?.v)
    if (!box || !Number.isFinite(v) || v <= 0) return

    const barHeight = (v / max) * band
    ctx.fillStyle =
      Number(candle?.c) >= Number(candle?.o) ? (palette.up ?? '#00e676') : (palette.down ?? '#ff9100')
    ctx.fillRect?.(box.x, height - barHeight, box.width, barHeight)
    drawn += 1
  })

  ctx.restore?.()
  return drawn
}

/**
 * The y pixel a candle's close sits at — used by the level lines and the readout.
 *
 * @param {object} candle - the candle.
 * @param {{min: number, max: number}} range - drawing range.
 * @param {number} height - plot height.
 * @returns {number} y coordinate.
 */
export function closeY(candle, range, height) {
  const close = Number(candle?.c)
  // A candle without a close belongs on the floor, not at a fabricated price of 0 —
  // on a $100 instrument that would draw the level far below the plot.
  if (!Number.isFinite(close)) return height

  return priceToY(close, range, height)
}

/**
 * Register the interval toggle.
 *
 * @returns {string} the registered action name.
 */
export function registerCandleActions() {
  registerAction(ACTIONS.ui.setCandleInterval, (_state, payload) => {
    const wanted = String(payload?.interval ?? payload ?? '')
    // Unknown intervals are ignored rather than clearing the chart: a fat-fingered
    // data-action attribute must never leave the desk without candles.
    if (!Object.hasOwn(TIMEFRAMES, wanted)) return false

    setValue(PATHS.ui.candleInterval, wanted)
    return true
  })
  return ACTIONS.ui.setCandleInterval
}
