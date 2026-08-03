import { latestTick, recentTrades } from '../pipeline/bus.js'
import { splitSymbol } from './ops.js'
import { tickPulseClass, valueClass } from '../ui/status-color.js'
import { formatPrice, formatPct, formatCompact } from '../utils/format.js'

/** Previous price per symbol, so a row knows which way it moved. */
const lastPrice = new Map()

/**
 * Build the display row for one watchlist symbol.
 *
 * Everything a row shows is derived here rather than in the template: the pulse direction
 * needs the *previous* price, which no binding can see, and doing it in one place keeps
 * the row cheap — this runs for every symbol on every frame.
 *
 * @param {string} qualified - venue-qualified symbol.
 * @returns {object} the row model.
 */
export function buildRow(qualified) {
  const { venue, symbol } = splitSymbol(qualified)
  const tick = latestTick(qualified) ?? latestTick(symbol)

  const last = Number(tick?.last ?? tick?.px ?? 0)
  const open = Number(tick?.open24h ?? 0)
  const previous = lastPrice.get(qualified)

  return {
    id: qualified,
    venue,
    symbol,
    last,
    price: formatPrice(last),
    changePct: open > 0 ? ((last - open) / open) * 100 : 0,
    change: formatPct(open > 0 ? ((last - open) / open) * 100 : 0),
    changeClass: valueClass(open > 0 ? last - open : 0),
    spread: Number(tick?.ask ?? 0) - Number(tick?.bid ?? 0),
    volume: formatCompact(Number(tick?.vol24h ?? 0)),
    pulse: previous === undefined ? '' : tickPulseClass(last, previous),
    stale: !tick,
  }
}

/**
 * Build every row for a list, remembering prices for the next pulse.
 *
 * @param {string[]} symbols - qualified symbols.
 * @returns {object[]} row models.
 */
export function buildRows(symbols) {
  const rows = (Array.isArray(symbols) ? symbols : []).map(buildRow)

  // Remember AFTER building, so this frame's pulse compares against the previous frame.
  for (const row of rows) lastPrice.set(row.id, row.last)
  return rows
}

/** Forget remembered prices (tests, symbol change, reconnect). */
export function resetRowMemory() {
  lastPrice.clear()
}

/**
 * Points for a row's inline sparkline, scaled into a 0–1 box.
 *
 * Returned as ratios rather than pixels so the same series renders at any row height
 * without recomputation.
 *
 * @param {string} qualified - venue-qualified symbol.
 * @param {number} [points] - how many prints to include.
 * @returns {number[]} y-ratios, oldest first; empty when there is nothing to draw.
 */
export function sparklinePoints(qualified, points = 24) {
  const trades = recentTrades(qualified, points)
  const prices = trades.map((t) => Number(t?.px)).filter(Number.isFinite)
  if (prices.length < 2) return []

  const min = Math.min(...prices)
  const max = Math.max(...prices)
  const range = max - min

  // A flat series draws a centred line rather than dividing by zero.
  if (range === 0) return prices.map(() => 0.5)
  return prices.map((px) => (px - min) / range)
}

/**
 * Turn sparkline ratios into an SVG polyline `points` attribute.
 *
 * @param {number[]} ratios - y-ratios, oldest first.
 * @param {number} [width] - viewport width.
 * @param {number} [height] - viewport height.
 * @returns {string} the points attribute, or '' when there is nothing to draw.
 */
export function sparklinePath(ratios, width = 60, height = 16) {
  const list = Array.isArray(ratios) ? ratios : []
  if (list.length < 2) return ''

  const step = width / (list.length - 1)
  // Invert y: SVG grows downward, prices grow upward.
  return list.map((r, i) => `${(i * step).toFixed(1)},${((1 - r) * height).toFixed(1)}`).join(' ')
}
