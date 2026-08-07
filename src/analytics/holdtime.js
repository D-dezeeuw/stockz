import { setValue, appState, watch } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { sizeCanvas, chartPalette } from '../charts/canvas.js'
import { cellColor } from './heatmap.js'
import { formatHold } from '../journal/metrics.js'
import { blockCanvas } from '../charts/canvas.js'

/**
 * How long the edge actually lives.
 *
 * The single most common way a scalper stops being one is by holding. Not by taking bad
 * entries — by taking a good entry, watching it work, and then staying in it long past the
 * point the move was over. That failure is invisible in every other view on this desk: the
 * P&L nets it out, the win rate counts it as one loss, and the equity curve shows a dip
 * indistinguishable from a bad trade.
 *
 * It is completely visible here, as a bucket with plenty of trades and a red average.
 *
 * The bins are **logarithmic**, and they have to be. A linear axis over a range that spans
 * five seconds to half an hour puts ninety percent of a scalper's trades in the first bar,
 * which is a chart that has told the reader nothing except that they scalp.
 *
 * Bars are coloured by *average* P&L per bucket, not total. Total would make the busiest
 * bucket the greenest by construction, and the busiest bucket is exactly the one whose
 * per-trade quality the trader most needs to know.
 */

/** Bin edges in milliseconds. The last bin catches everything above. */
export const HOLD_BINS = Object.freeze([10000, 30000, 60000, 180000, 600000, 1800000])

/**
 * Which bin a duration falls in.
 *
 * @param {number} ms - the hold time.
 * @returns {number} the bin index, 0..HOLD_BINS.length.
 */
export function binFor(ms) {
  const held = Number(ms)
  if (!Number.isFinite(held) || held < 0) return 0

  // Upper-exclusive: a hold of exactly ten seconds belongs to the "under 10s" bucket, and a
  // boundary that went the other way would put every round-number hold in the slower bin.
  const index = HOLD_BINS.findIndex((edge) => held < edge)

  return index === -1 ? HOLD_BINS.length : index
}

/**
 * The distribution.
 *
 * @param {object[]} trades - the enriched trades.
 * @returns {object[]} one bucket per bin.
 */
export function holdTimeBuckets(trades) {
  const buckets = HOLD_BINS.map((edge, index) => ({
    index,
    edge,
    label: `<${formatHold(edge)}`,
    count: 0,
    net: 0,
    avg: 0,
  }))
  buckets.push({
    index: HOLD_BINS.length,
    edge: Infinity,
    label: `${formatHold(HOLD_BINS[HOLD_BINS.length - 1])}+`,
    count: 0,
    net: 0,
    avg: 0,
  })

  for (const trade of Array.isArray(trades) ? trades : []) {
    const bucket = buckets[binFor(trade?.hold)]
    bucket.count += 1
    bucket.net = Number((bucket.net + (Number(trade?.net) || 0)).toFixed(4))
  }

  for (const bucket of buckets) {
    // Average, not total. Total makes the busiest bucket the greenest by construction, and
    // the busiest bucket is exactly the one whose per-trade quality matters most.
    bucket.avg = bucket.count ? Number((bucket.net / bucket.count).toFixed(4)) : 0
  }

  return buckets
}

/**
 * The typical hold.
 *
 * @param {object[]} trades - the enriched trades.
 * @returns {number} the median in ms.
 */
export function medianHold(trades) {
  const holds = (Array.isArray(trades) ? trades : [])
    .map((trade) => Number(trade?.hold) || 0)
    .sort((a, b) => a - b)
  if (holds.length === 0) return 0

  const mid = Math.floor(holds.length / 2)
  // The median rather than the mean is the honest "typical": one trade held overnight by
  // accident would drag a mean past every hold the trader actually intends to take.
  return holds.length % 2 ? holds[mid] : Math.round((holds[mid - 1] + holds[mid]) / 2)
}

/**
 * The mean hold.
 *
 * @param {object[]} trades - the enriched trades.
 * @returns {number} the average in ms.
 */
export function avgHold(trades) {
  const rows = Array.isArray(trades) ? trades : []
  if (rows.length === 0) return 0

  const total = rows.reduce((sum, trade) => sum + (Number(trade?.hold) || 0), 0)

  return Math.round(total / rows.length)
}

/**
 * Draw the distribution.
 *
 * @param {CanvasRenderingContext2D} ctx - the 2D context.
 * @param {object[]} buckets - the buckets.
 * @param {{width: number, height: number}} size - the box.
 * @param {object} [palette] - the theme colours.
 * @returns {number} how many bars were drawn.
 */
export function drawHistogram(ctx, buckets, size, palette = chartPalette()) {
  const width = Number(size?.width) || 0
  const height = Number(size?.height) || 0
  const rows = Array.isArray(buckets) ? buckets : []
  if (!ctx || width <= 0 || height <= 0 || rows.length === 0) return 0

  ctx.clearRect(0, 0, width, height)

  const labelRoom = 12
  const plot = Math.max(1, height - labelRoom)
  const barW = width / rows.length
  const maxCount = Math.max(1, ...rows.map((bucket) => Number(bucket?.count) || 0))
  const maxAvg = Math.max(0, ...rows.map((bucket) => Math.abs(Number(bucket?.avg) || 0)))

  ctx.font = '9px ui-monospace, monospace'
  ctx.textBaseline = 'top'

  let drawn = 0
  for (const bucket of rows) {
    const count = Number(bucket?.count) || 0
    const barH = Math.round((count / maxCount) * plot)
    // The diverging scale is shared with the heatmap on purpose: two charts using different
    // colour languages for the same idea is two charts the reader has to learn separately.
    ctx.fillStyle = cellColor({ count, net: bucket?.avg }, maxAvg, palette)
    ctx.fillRect(bucket.index * barW + 1, plot - barH, Math.max(1, barW - 2), barH)

    ctx.fillStyle = palette.muted ?? '#6f8a76'
    ctx.fillText(String(bucket?.label ?? ''), bucket.index * barW + 1, plot + 1)
    drawn += 1
  }

  return drawn
}

/**
 * Publish the distribution and its centre.
 *
 * @param {object[]} [trades] - the enriched trades.
 * @returns {object[]} the buckets.
 */
export function refreshHoldTimes(trades = appState.analytics?.trades) {
  const buckets = holdTimeBuckets(trades)
  const median = medianHold(trades)
  const mean = avgHold(trades)

  setValue(PATHS.analytics.holds, buckets)
  setValue(PATHS.analytics.holdCentre, {
    median,
    mean,
    medianLabel: formatHold(median),
    meanLabel: formatHold(mean),
  })

  return buckets
}

/**
 * Mount and keep the histogram drawn.
 *
 * @param {{doc?: Document, raf?: Function, buckets?: () => object[]}} [deps] - injectable
 *   plumbing.
 * @returns {Function|null} the redraw, or null when there is no canvas.
 */
export function startHistogram(deps = {}) {
  const doc = deps.doc ?? globalThis.document
  const canvas = blockCanvas('analytics', 'holds-canvas', doc)
  if (!canvas) return null

  const read = deps.buckets ?? (() => appState.analytics?.holds ?? [])
  const redraw = () => {
    const size = sizeCanvas(canvas, { width: canvas.clientWidth, height: canvas.clientHeight })
    drawHistogram(canvas.getContext('2d'), read(), size)
  }

  const raf = deps.raf ?? globalThis.requestAnimationFrame?.bind(globalThis) ?? ((fn) => fn())
  watch([PATHS.analytics.holds], () => raf(redraw))
  redraw()

  return redraw
}
