import { blockCanvas, sizeCanvas, chartPalette } from '../charts/canvas.js'
import { appState, watch } from '../app/engine.js'
import { PATHS } from '../state/paths.js'

/**
 * Where the trades went, as one shape.
 *
 * The decision feed answers "what happened just now"; this answers "what has been happening",
 * which is the question a desk that looks idle actually raises. A session can produce
 * thousands of lines and two orders, and reading that off a scrolling list is impossible —
 * the eye needs the proportion, not the entries.
 *
 * A ring rather than a filled pie: the hole carries the number that matters most (how many
 * were taken), so the one fact worth reading across the room is text, not an arc somebody
 * has to estimate. Arcs are for the comparison; the middle is for the answer.
 *
 * Palette rules are the desk's, not this chart's: taken is green, a refusal that cost
 * something is orange, and a limit doing its job is muted. Never a categorical rainbow —
 * on this desk colour already means profit and loss, and a third meaning would break both.
 */

/** The canvas the ring draws on. */
export const DONUT_ID = 'trader-donut'

/** How much of the radius is hole. Wide enough for the count to sit inside it. */
export const HOLE = 0.62

/**
 * Colour for a slice's tone, from the theme rather than from a literal.
 *
 * @param {string} tone - 'up', 'down' or 'muted'.
 * @param {object} palette - the chart palette.
 * @returns {string} the colour.
 */
export function sliceColor(tone, palette) {
  if (tone === 'up') return palette.up
  if (tone === 'down') return palette.down
  return palette.muted
}

/**
 * Draw the ring.
 *
 * Slices are drawn from twelve o'clock clockwise, which is the only starting point a reader
 * assumes without being told.
 *
 * @param {object} ctx - a 2D context.
 * @param {{width: number, height: number}} box - the drawing surface.
 * @param {object[]} slices - from `decisionBreakdown`.
 * @param {object} palette - the chart palette.
 * @returns {number} slices drawn.
 */
export function drawDonut(ctx, box, slices, palette) {
  const width = Number(box?.width) || 0
  const height = Number(box?.height) || 0
  if (!ctx || width <= 0 || height <= 0) return 0

  ctx.clearRect(0, 0, width, height)
  const rows = Array.isArray(slices) ? slices.filter((s) => Number(s?.share) > 0) : []

  const cx = width / 2
  const cy = height / 2
  const radius = Math.max(0, Math.min(width, height) / 2 - 2)
  if (radius <= 0) return 0

  if (rows.length === 0) {
    // An empty ring, not an empty canvas: a blank block reads as broken, a drawn-but-empty
    // one reads as "nothing yet", which is the truth.
    ctx.strokeStyle = palette.grid
    ctx.lineWidth = radius * (1 - HOLE)
    ctx.beginPath()
    ctx.arc(cx, cy, radius * ((1 + HOLE) / 2), 0, Math.PI * 2)
    ctx.stroke()
    return 0
  }

  let from = -Math.PI / 2
  for (const slice of rows) {
    const sweep = slice.share * Math.PI * 2
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.arc(cx, cy, radius, from, from + sweep)
    ctx.closePath()
    ctx.fillStyle = sliceColor(slice.tone, palette)
    // Refusals share the muted/orange tones, so an outline is what keeps two adjacent
    // slices of the same colour from reading as one.
    ctx.globalAlpha = slice.taken ? 1 : 0.55
    ctx.fill()
    ctx.globalAlpha = 1
    ctx.strokeStyle = palette.bg
    ctx.lineWidth = 1
    ctx.stroke()
    from += sweep
  }

  // Punch the hole last: cheaper than arc maths per slice, and exact.
  ctx.globalCompositeOperation = 'destination-out'
  ctx.beginPath()
  ctx.arc(cx, cy, radius * HOLE, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalCompositeOperation = 'source-over'

  const taken = rows.filter((s) => s.taken).reduce((sum, s) => sum + s.count, 0)
  ctx.fillStyle = taken > 0 ? palette.up : palette.muted
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `600 ${Math.max(11, Math.round(radius * 0.42))}px ui-monospace, monospace`
  ctx.fillText(String(taken), cx, cy - radius * 0.08)
  ctx.fillStyle = palette.muted
  ctx.font = `${Math.max(8, Math.round(radius * 0.2))}px ui-monospace, monospace`
  ctx.fillText('taken', cx, cy + radius * 0.28)

  return rows.length
}

/**
 * Keep the ring in step with the breakdown.
 *
 * Redrawn on a watch rather than a render loop: this changes when the server's snapshot
 * changes, which is every couple of seconds, and a rAF loop would repaint it sixty times
 * for each new number.
 *
 * @param {{doc?: Document, watch?: Function, draw?: Function}} [deps] - injectable plumbing.
 * @returns {{redraw: Function, stop: () => void}} the controller.
 */
export function startTraderDonut(deps = {}) {
  const doc = deps.doc ?? globalThis.document
  const watchImpl = deps.watch ?? watch
  const drawImpl = deps.draw ?? drawDonut

  const redraw = () => {
    // Re-acquired each time, and scoped to its block: the grid clones the block template
    // once per block, so a bare id finds the watchlist's hidden 0x0 copy. Both lessons
    // already paid for by the micro chart.
    const canvas = blockCanvas('trader', DONUT_ID, doc)
    if (!canvas) return 0

    const box = sizeCanvas(canvas, { width: canvas.clientWidth, height: canvas.clientHeight })
    const ctx = canvas.getContext?.('2d')
    return drawImpl(ctx, box, appState.trader?.view?.breakdown ?? [], chartPalette())
  }

  const unwatch = watchImpl([PATHS.trader.view], () => redraw())
  redraw()

  return { redraw, stop: () => unwatch?.() }
}
