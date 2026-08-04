import { setValue, appState, watch } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { sizeCanvas, chartPalette } from '../charts/canvas.js'

/**
 * When the money is actually made.
 *
 * Almost every trader has an hour that quietly costs them everything the rest of the day
 * earns, and almost none of them can name it. It is not visible in a P&L, it is not visible
 * in a win rate, and it is completely obvious in a seven-by-twenty-four grid.
 *
 * Hours are **local**, unlike the journal's day rows which are UTC. The difference is
 * deliberate and it is the whole point of this chart: "do I trade badly after lunch" is a
 * question about the trader's own body clock, not about an exchange's session boundary. The
 * day rows answer a different question and correctly use a different clock.
 *
 * **An empty cell must never look like a break-even one.** Zero P&L and no trades are
 * completely different facts — one says "this hour does not work", the other says "you have
 * never tried" — and a diverging colour scale renders both as the neutral midpoint unless
 * something is done about it. Empty cells get their own flat treatment and are excluded from
 * the scale entirely.
 */

/** Row labels, Sunday first to match `getDay()`. */
export const WEEKDAYS = Object.freeze(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'])

/**
 * Fold trades into weekday-by-hour cells.
 *
 * @param {object[]} trades - the enriched trades.
 * @returns {object[]} 168 cells of {day, hour, net, count, wins}.
 */
export function bucketByHour(trades) {
  const cells = []
  for (let day = 0; day < 7; day += 1) {
    for (let hour = 0; hour < 24; hour += 1) {
      cells.push({ day, hour, net: 0, count: 0, wins: 0 })
    }
  }

  for (const trade of Array.isArray(trades) ? trades : []) {
    const at = Number(trade?.closeTs)
    if (!Number.isFinite(at) || at <= 0) continue

    const when = new Date(at)
    // Local, deliberately: "do I trade badly after lunch" is a question about the trader's
    // body clock, not about an exchange's session boundary.
    const cell = cells[when.getDay() * 24 + when.getHours()]
    const net = Number(trade?.net) || 0
    cell.net = Number((cell.net + net).toFixed(4))
    cell.count += 1
    if (net > 0) cell.wins += 1
  }

  return cells
}

/**
 * The largest magnitude the scale has to cover.
 *
 * @param {object[]} cells - the buckets.
 * @returns {number} the max absolute net.
 */
export function scaleMax(cells) {
  const rows = Array.isArray(cells) ? cells : []
  // Only cells that were traded count toward the scale. An untraded hour is not a
  // zero-performance hour, and letting it anchor the scale would be letting an absence
  // change how a real number is coloured.
  const magnitudes = rows.filter((cell) => cell?.count > 0).map((cell) => Math.abs(Number(cell?.net) || 0))

  return magnitudes.length ? Math.max(...magnitudes) : 0
}

/**
 * A cell's colour.
 *
 * @param {object} cell - the bucket.
 * @param {number} max - the scale maximum.
 * @param {object} [palette] - the theme colours.
 * @returns {string} a CSS colour.
 */
export function cellColor(cell, max, palette = chartPalette()) {
  // Never traded gets its own flat treatment, outside the scale. Rendering it as the neutral
  // midpoint would say "this hour breaks even", which is a claim nobody made.
  if (!cell || (Number(cell.count) || 0) === 0) return palette.bg ?? '#0f1510'

  const net = Number(cell.net) || 0
  const span = Number(max) || 0
  if (span <= 0 || net === 0) return palette.grid ?? '#1b3a24'

  // Symmetric around zero so a +50 hour and a -50 hour are equally loud. An asymmetric scale
  // would make a good week's losses look mild purely because the wins were larger.
  const weight = Math.min(1, Math.abs(net) / span)
  const alpha = Number((0.15 + weight * 0.85).toFixed(3))
  const base = net > 0 ? (palette.up ?? '#00e676') : (palette.down ?? '#ff9100')

  return `color-mix(in srgb, ${base} ${Math.round(alpha * 100)}%, transparent)`
}

/**
 * Draw the grid.
 *
 * @param {CanvasRenderingContext2D} ctx - the 2D context.
 * @param {object[]} cells - the buckets.
 * @param {{width: number, height: number}} size - the box.
 * @param {object} [palette] - the theme colours.
 * @returns {number} how many cells were painted.
 */
export function drawHeatmap(ctx, cells, size, palette = chartPalette()) {
  const width = Number(size?.width) || 0
  const height = Number(size?.height) || 0
  const rows = Array.isArray(cells) ? cells : []
  if (!ctx || width <= 0 || height <= 0 || rows.length === 0) return 0

  ctx.clearRect(0, 0, width, height)

  const gutter = 26
  const cellW = (width - gutter) / 24
  const cellH = height / 7
  const max = scaleMax(rows)

  ctx.font = '9px ui-monospace, monospace'
  ctx.fillStyle = palette.muted ?? '#6f8a76'
  ctx.textBaseline = 'middle'

  for (let day = 0; day < 7; day += 1) {
    ctx.fillStyle = palette.muted ?? '#6f8a76'
    ctx.fillText(WEEKDAYS[day], 0, day * cellH + cellH / 2)
  }

  let painted = 0
  for (const cell of rows) {
    ctx.fillStyle = cellColor(cell, max, palette)
    ctx.fillRect(
      gutter + cell.hour * cellW,
      cell.day * cellH,
      Math.max(1, cellW - 1),
      Math.max(1, cellH - 1),
    )
    painted += 1
  }

  return painted
}

/**
 * What a cell says on hover.
 *
 * @param {object} cell - the bucket.
 * @returns {object|null} the tooltip.
 */
export function cellStats(cell) {
  if (!cell) return null

  const count = Number(cell.count) || 0
  const wins = Number(cell.wins) || 0

  return {
    label: `${WEEKDAYS[Number(cell.day) || 0]} ${String(Number(cell.hour) || 0).padStart(2, '0')}:00`,
    net: Number(cell.net) || 0,
    count,
    // "—" rather than 0% for an hour never traded, the same honesty the KPI tiles use.
    winRate: count ? `${Math.round((wins / count) * 100)}%` : '—',
  }
}

/**
 * The best and worst hours, which is what anybody actually wants told to them.
 *
 * @param {object[]} cells - the buckets.
 * @returns {{best: object|null, worst: object|null}} the extremes.
 */
export function hourExtremes(cells) {
  const traded = (Array.isArray(cells) ? cells : []).filter((cell) => (cell?.count || 0) > 0)
  if (traded.length === 0) return { best: null, worst: null }

  const sorted = [...traded].sort((a, b) => (Number(b.net) || 0) - (Number(a.net) || 0))

  return { best: cellStats(sorted[0]), worst: cellStats(sorted[sorted.length - 1]) }
}

/**
 * Publish the grid.
 *
 * @param {object[]} [trades] - the enriched trades.
 * @returns {object[]} the cells.
 */
export function refreshHeatmap(trades = appState.journal?.filtered) {
  const cells = bucketByHour(trades)
  // Only traded cells are published: a hundred and sixty-eight rows of zeroes in state on
  // every trade close is a write nobody reads.
  setValue(
    PATHS.analytics.hours,
    cells.filter((cell) => cell.count > 0),
  )
  setValue(PATHS.analytics.hourExtremes, hourExtremes(cells))

  return cells
}

/**
 * Mount and keep the grid drawn.
 *
 * @param {{doc?: Document, raf?: Function, cells?: () => object[]}} [deps] - injectable
 *   plumbing.
 * @returns {Function|null} the redraw, or null when there is no canvas.
 */
export function startHeatmap(deps = {}) {
  const doc = deps.doc ?? globalThis.document
  const canvas = doc?.getElementById?.('hours-canvas')
  if (!canvas) return null

  const read = deps.cells ?? (() => bucketByHour(appState.journal?.filtered))
  const redraw = () => {
    const size = sizeCanvas(canvas, { width: canvas.clientWidth, height: canvas.clientHeight })
    drawHeatmap(canvas.getContext('2d'), read(), size)
  }

  const raf = deps.raf ?? globalThis.requestAnimationFrame?.bind(globalThis) ?? ((fn) => fn())
  watch([PATHS.analytics.hours], () => raf(redraw))
  redraw()

  return redraw
}
