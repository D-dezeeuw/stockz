import { setValue, appState, watch } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { sizeCanvas, chartPalette } from '../charts/canvas.js'

/**
 * How much of the edge the exchanges are eating.
 *
 * This is the number that quietly decides whether a scalping desk is a business or a hobby.
 * A strategy making twelve basis points a trade against a venue charging ten is not a
 * marginal strategy — it is a job the trader is doing for the exchange, and nothing else on
 * this dashboard will say so. The P&L is already net. The win rate does not care. Only the
 * ratio of fees to gross tells the trader they are the employee.
 *
 * Fees are attributed to **the venue that charged them**, taken from the fill rather than
 * from the trade. A round trip can open on one venue and close on another, and folding both
 * legs into whichever venue happened to open it would misattribute exactly the cost being
 * measured.
 *
 * The ratio is fees over **gross**, not over net. Over net it goes to infinity as a desk
 * approaches break-even and then flips sign, which is the precise moment a trader most needs
 * a number they can read.
 */

/** Where fee drag stops being a cost and starts being the business. */
export const DRAG_WARN = 0.3
export const DRAG_BAD = 0.5

/**
 * Gross, fees, and what is left.
 *
 * @param {object[]} trades - the enriched trades.
 * @returns {object} the totals.
 */
export function grossVsFees(trades) {
  const rows = Array.isArray(trades) ? trades : []
  const gross = rows.reduce((sum, trade) => sum + (Number(trade?.pnl) || 0), 0)
  const fees = rows.reduce((sum, trade) => sum + Math.abs(Number(trade?.fees) || 0), 0)

  // Over gross, never over net: over net the ratio runs to infinity as a desk approaches
  // break-even and then flips sign, at exactly the moment a readable number matters most.
  const ratio = gross > 0 ? Number((fees / gross).toFixed(4)) : 0

  return {
    gross: Number(gross.toFixed(2)),
    fees: Number(fees.toFixed(2)),
    net: Number((gross - fees).toFixed(2)),
    ratio,
    ratioLabel: gross > 0 ? `${Math.round(ratio * 100)}%` : '—',
    // Named rather than left to a colour: "fees are 62% of gross" is a sentence a trader
    // acts on, and a slightly orange tile is one they get used to.
    tone: gross <= 0 ? 'flat' : ratio >= DRAG_BAD ? 'down' : ratio >= DRAG_WARN ? 'warn' : 'up',
    trades: rows.length,
  }
}

/**
 * Fees, by the venue that charged them.
 *
 * @param {object[]} trades - the enriched trades.
 * @returns {object[]} one row per venue.
 */
export function venueFeeSplit(trades) {
  const venues = new Map()

  for (const trade of Array.isArray(trades) ? trades : []) {
    const legs = [...(trade?.entryFills ?? []), ...(trade?.exitFills ?? [])]
    for (const fill of legs) {
      // From the fill, not the trade: a round trip can open on one venue and close on
      // another, and attributing both legs to whichever opened it misattributes exactly the
      // cost being measured.
      const venue = String(fill?.venue ?? '').toLowerCase() || 'unknown'
      if (!venues.has(venue)) venues.set(venue, { venue, fees: 0, fills: 0 })

      const row = venues.get(venue)
      row.fees = Number((row.fees + Math.abs(Number(fill?.fee) || 0)).toFixed(6))
      row.fills += 1
    }
  }

  return [...venues.values()]
    .map((row) => ({
      ...row,
      fees: Number(row.fees.toFixed(2)),
      avgFee: row.fills ? Number((row.fees / row.fills).toFixed(4)) : 0,
    }))
    .sort((a, b) => b.fees - a.fees)
}

/**
 * Draw gross against fees.
 *
 * @param {CanvasRenderingContext2D} ctx - the 2D context.
 * @param {object} totals - the grossVsFees result.
 * @param {{width: number, height: number}} size - the box.
 * @param {object} [palette] - the theme colours.
 * @returns {boolean} true when drawn.
 */
export function drawFeeBars(ctx, totals, size, palette = chartPalette()) {
  const width = Number(size?.width) || 0
  const height = Number(size?.height) || 0
  if (!ctx || width <= 0 || height <= 0) return false

  ctx.clearRect(0, 0, width, height)

  const gross = Math.abs(Number(totals?.gross) || 0)
  const fees = Math.abs(Number(totals?.fees) || 0)
  const max = Math.max(gross, fees)
  if (max <= 0) return false

  const barH = Math.max(4, Math.floor(height / 3))
  const gap = Math.floor((height - barH * 2) / 3)

  // Both bars on the same scale, stacked. Side-by-side bars on independent scales are how a
  // chart makes 90% fee drag look like a fair fight.
  ctx.fillStyle = palette.up ?? '#00e676'
  ctx.fillRect(0, gap, Math.round((gross / max) * width), barH)

  ctx.fillStyle = palette.down ?? '#ff9100'
  ctx.fillRect(0, gap * 2 + barH, Math.round((fees / max) * width), barH)

  return true
}

/**
 * Publish the comparison.
 *
 * @param {object[]} [trades] - the enriched trades.
 * @returns {object} the totals.
 */
export function refreshFees(trades = appState.analytics?.trades) {
  const totals = grossVsFees(trades)

  setValue(PATHS.analytics.fees, totals)
  setValue(PATHS.analytics.venueFees, venueFeeSplit(trades))

  return totals
}

/**
 * Mount and keep the bars drawn.
 *
 * @param {{doc?: Document, raf?: Function, totals?: () => object}} [deps] - injectable
 *   plumbing.
 * @returns {Function|null} the redraw, or null when there is no canvas.
 */
export function startFeeBars(deps = {}) {
  const doc = deps.doc ?? globalThis.document
  const canvas = doc?.getElementById?.('fees-canvas')
  if (!canvas) return null

  const read = deps.totals ?? (() => appState.analytics?.fees ?? {})
  const redraw = () => {
    const size = sizeCanvas(canvas, { width: canvas.clientWidth, height: canvas.clientHeight })
    drawFeeBars(canvas.getContext('2d'), read(), size)
  }

  const raf = deps.raf ?? globalThis.requestAnimationFrame?.bind(globalThis) ?? ((fn) => fn())
  watch([PATHS.analytics.fees], () => raf(redraw))
  redraw()

  return redraw
}
