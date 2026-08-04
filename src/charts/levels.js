import { priceToY, formatPrice } from './scale.js'

/**
 * Price level lines — last price and your entries, always in sight.
 *
 * The number a scalper needs constantly is not the price; it is the *distance* from the
 * price to their entry. Two horizontal lines and a tag answer that without arithmetic,
 * and they answer it in peripheral vision, which is where it needs to be answered while
 * the eye is on the tape.
 *
 * A level that scrolls off the plot must still say which way it went. Clamping to the
 * edge with an arrow beats hiding it: "your entry is above the visible range" is
 * actionable, and an absent line reads as no position at all.
 */

/** Dash patterns per level kind, so a level is never mistaken for a gridline. */
export const LEVEL_DASH = Object.freeze({
  last: Object.freeze([]),
  entry: Object.freeze([6, 4]),
  level: Object.freeze([1, 4]),
  stop: Object.freeze([2, 3]),
  target: Object.freeze([8, 3]),
})

/**
 * The palette role a position's level should use.
 *
 * @param {{side?: string, entry?: number}} position - the open position.
 * @param {number} price - the current market price.
 * @param {object} [palette] - the chart palette.
 * @returns {string} the colour to draw with.
 */
export function levelColor(position, price, palette = {}) {
  const entry = Number(position?.entry)
  const now = Number(price)
  const up = palette.up ?? '#00e676'
  const down = palette.down ?? '#ff9100'
  if (!Number.isFinite(entry) || !Number.isFinite(now)) return palette.muted ?? '#6f8a76'

  const long = String(position?.side ?? 'long').toLowerCase() !== 'short'
  // Winning is green whichever way the position points: a short in profit is a market
  // *below* its entry, and colouring that orange would read as a loss at a glance.
  const winning = long ? now >= entry : now <= entry

  return winning ? up : down
}

/**
 * Clamp a level to the plot, reporting which edge it ran off.
 *
 * @param {number} price - the level's price.
 * @param {{min: number, max: number}} range - drawing range.
 * @param {number} height - plot height in CSS pixels.
 * @returns {{y: number, offscreen: boolean, direction: string}} the clamped placement.
 */
export function clampLevel(price, range, height) {
  const y = priceToY(price, range, height)
  const plot = Number(height) || 0

  if (y < 0) return { y: 0, offscreen: true, direction: 'up' }
  if (y > plot) return { y: plot, offscreen: true, direction: 'down' }

  return { y, offscreen: false, direction: 'none' }
}

/**
 * Draw one horizontal level with its right-axis tag.
 *
 * @param {CanvasRenderingContext2D} ctx - the 2D context.
 * @param {{price: number, label?: string, color?: string, kind?: string, range: object,
 *   width: number, height: number, palette?: object, tickSize?: number}} options - the level.
 * @returns {boolean} true when the level was drawn.
 */
export function drawLevelLine(ctx, options = {}) {
  const {
    price,
    label,
    color,
    kind = 'entry',
    range,
    width = 0,
    height = 0,
    palette = {},
    tickSize = 0.01,
  } = options
  if (!ctx || !Number.isFinite(Number(price))) return false

  const placement = clampLevel(price, range, height)
  const stroke = color ?? palette.ink ?? '#c8e6c9'
  const y = Math.round(placement.y) + 0.5

  ctx.save?.()
  ctx.strokeStyle = stroke
  ctx.fillStyle = stroke
  ctx.lineWidth = 1
  ctx.setLineDash?.([...(LEVEL_DASH[kind] ?? LEVEL_DASH.entry)])

  ctx.beginPath?.()
  ctx.moveTo?.(0, y)
  ctx.lineTo?.(width, y)
  ctx.stroke?.()

  ctx.setLineDash?.([])
  ctx.font = '10px ui-monospace, monospace'
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'

  // An off-plot level keeps its tag and gains an arrow: "above the visible range" is
  // actionable, while a missing line reads as no position at all.
  const arrow = placement.direction === 'up' ? '▲ ' : placement.direction === 'down' ? '▼ ' : ''
  const tagY = placement.direction === 'up' ? 8 : placement.direction === 'down' ? height - 8 : y
  ctx.fillText?.(`${arrow}${label ?? formatPrice(price, tickSize)}`, width - 4, tagY)

  ctx.restore?.()
  return true
}

/**
 * Build the level list for a chart from the market price and open positions.
 *
 * @param {{price?: number, positions?: Array<object>, palette?: object,
 *   tickSize?: number}} context - what the desk currently holds.
 * @returns {Array<{price: number, label: string, color: string, kind: string}>} the levels.
 */
export function chartLevels(context = {}) {
  const { price, positions = [], palette = {}, tickSize = 0.01 } = context
  const levels = []

  if (Number.isFinite(Number(price))) {
    levels.push({
      price: Number(price),
      label: formatPrice(price, tickSize),
      color: palette.ink ?? '#c8e6c9',
      kind: 'last',
    })
  }

  for (const position of Array.isArray(positions) ? positions : []) {
    const entry = Number(position?.entry)
    if (!Number.isFinite(entry)) continue

    levels.push({
      price: entry,
      // Size on the tag, because the distance only means money once you know the size.
      label: `${formatPrice(entry, tickSize)} × ${position?.size ?? 0}`,
      color: levelColor(position, price, palette),
      kind: 'entry',
    })
  }

  // Support and resistance found by the range-fade strategy. Dashed and muted: these are
  // somebody's *inference* about the market, not a fact about the account like an entry, and
  // drawing them at the same weight would be a lie about how much to trust them.
  for (const level of Array.isArray(context.supports) ? context.supports : []) {
    const at = Number(level?.px)
    if (!Number.isFinite(at)) continue

    levels.push({
      price: at,
      label: `${formatPrice(at, tickSize)} ×${Number(level?.touches) || 1}`,
      color: palette.inkMuted ?? palette.ink ?? '#7a8c7a',
      kind: 'level',
    })
  }

  return levels
}
