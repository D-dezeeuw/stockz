import { timeToX, priceToY } from './scale.js'

/**
 * Fill markers — your executions, on the wiggle they caught.
 *
 * The feedback loop this closes is the whole reason a scalper looks at a chart after the
 * trade rather than before it: did the entry land on the sweep or two ticks after it? A
 * fills overlay answers that in one glance, where a fills table never does.
 *
 * Clustering is not cosmetic. Twenty scalps in ten seconds put twenty triangles inside
 * forty pixels, which reads as a smear and hides the one fill that was mispriced. Merging
 * anything closer than a glyph-width into a single badge keeps the outliers visible.
 */

/**
 * Project fills onto the plot, dropping anything outside the window.
 *
 * @param {Array<{ts: number, px: number, side: string, sz: number}>} fills - executions.
 * @param {{window: object, range: object, width: number, height: number}} plot - geometry.
 * @returns {Array<{x: number, y: number, side: string, sz: number, ts: number,
 *   px: number}>} laid-out markers, left to right.
 */
export function layoutMarkers(fills, plot = {}) {
  const { window, range, width = 0, height = 0 } = plot
  const from = Number(window?.from)
  const to = Number(window?.to)

  return (Array.isArray(fills) ? fills : [])
    .filter((fill) => {
      const ts = Number(fill?.ts)
      const px = Number(fill?.px)
      if (!Number.isFinite(ts) || !Number.isFinite(px)) return false
      // Off-window fills are dropped, not clamped: a marker pinned to the edge would
      // claim a trade happened at a time it did not.
      return !Number.isFinite(from) || !Number.isFinite(to) || (ts >= from && ts <= to)
    })
    .map((fill) => ({
      x: timeToX(Number(fill.ts), window, width),
      y: priceToY(Number(fill.px), range, height),
      side: String(fill.side ?? 'buy').toLowerCase(),
      sz: Number(fill.sz) || 0,
      ts: Number(fill.ts),
      px: Number(fill.px),
    }))
    .sort((a, b) => a.x - b.x)
}

/**
 * Merge markers that land within a glyph's width of each other.
 *
 * @param {Array<object>} markers - laid-out markers, left to right.
 * @param {number} [radius] - merge distance in CSS pixels.
 * @returns {Array<object>} clusters, each carrying a count and total size.
 */
export function clusterFills(markers, radius = 8) {
  const list = Array.isArray(markers) ? markers : []
  const clusters = []

  for (const marker of list) {
    const open = clusters[clusters.length - 1]
    // Same side only: a buy and a sell at the same instant are the interesting case, and
    // merging them into one badge would hide exactly that.
    const near =
      open &&
      open.side === marker.side &&
      Math.abs(marker.x - open.x) <= radius &&
      Math.abs(marker.y - open.y) <= radius

    if (!near) {
      clusters.push({ ...marker, count: 1, totalSz: marker.sz })
      continue
    }

    open.count += 1
    open.totalSz += marker.sz
    // The badge sits on the cluster's centre of mass, so it points at the run of fills
    // rather than at whichever one happened to arrive first.
    open.x = (open.x * (open.count - 1) + marker.x) / open.count
    open.y = (open.y * (open.count - 1) + marker.y) / open.count
  }

  return clusters
}

/**
 * The marker under a cursor, if any.
 *
 * @param {Array<object>} markers - laid-out markers or clusters.
 * @param {{x: number, y: number}} position - cursor position.
 * @param {number} [radius] - hit radius in CSS pixels.
 * @returns {object|null} the nearest marker within range.
 */
export function hitTestMarker(markers, position, radius = 10) {
  const list = Array.isArray(markers) ? markers : []
  const x = Number(position?.x)
  const y = Number(position?.y)
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null

  let best = null
  let bestDistance = Infinity

  for (const marker of list) {
    const dx = Number(marker?.x) - x
    const dy = Number(marker?.y) - y
    const distance = Math.hypot(dx, dy)
    if (distance <= radius && distance < bestDistance) {
      best = marker
      bestDistance = distance
    }
  }
  return best
}

/**
 * Draw the fill markers.
 *
 * @param {CanvasRenderingContext2D} ctx - the 2D context.
 * @param {{markers: Array<object>, palette: object, size?: number}} options - what to draw.
 * @returns {number} the number of glyphs drawn.
 */
export function drawMarkers(ctx, options = {}) {
  const { markers = [], palette = {}, size = 5 } = options
  if (!ctx || markers.length === 0) return 0

  ctx.save?.()
  ctx.font = '9px ui-monospace, monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  for (const marker of markers) {
    const buy = marker.side === 'buy'
    ctx.fillStyle = buy ? (palette.up ?? '#00e676') : (palette.down ?? '#ff9100')

    // Buys point up from below the fill, sells point down from above it, so the glyph
    // never covers the price it marks.
    const tip = buy ? marker.y - size : marker.y + size
    const base = buy ? marker.y + size : marker.y - size

    ctx.beginPath?.()
    ctx.moveTo?.(marker.x, tip)
    ctx.lineTo?.(marker.x - size, base)
    ctx.lineTo?.(marker.x + size, base)
    ctx.closePath?.()
    ctx.fill?.()

    if (marker.count > 1) {
      ctx.fillStyle = palette.ink ?? '#c8e6c9'
      ctx.fillText?.(String(marker.count), marker.x, base + (buy ? 8 : -8))
    }
  }

  ctx.restore?.()
  return markers.length
}
