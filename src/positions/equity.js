import { createRing } from '../pipeline/ring.js'
import { sparklinePath } from '../lists/rows.js'
import { setValue } from '../app/engine.js'
import { PATHS } from '../state/paths.js'

/**
 * The session's shape.
 *
 * A day's net P&L is one number and it hides everything that matters: whether the day was
 * a steady grind or one lucky trade on top of a losing morning, whether the drawdown came
 * before or after the peak. The curve answers that at a glance, which is the only way it
 * gets looked at during a session.
 *
 * Sampled on a timer rather than on every mark: a P&L that moves with every tick would
 * fill the buffer in a minute with a shape nobody can read.
 */

/** Samples retained. At one every few seconds, several hours of session. */
export const CAPACITY = 720

/** How often a sample is worth taking. */
export const SAMPLE_MS = 5000

const samples = createRing(CAPACITY)
let lastAt = 0

/**
 * Take a sample if enough time has passed.
 *
 * @param {number} value - the day's P&L right now.
 * @param {number} now - the current time.
 * @param {number} [everyMs] - the sampling interval.
 * @returns {boolean} true when a sample was taken.
 */
export function sample(value, now, everyMs = SAMPLE_MS) {
  const at = Number(now)
  const pnl = Number(value)
  if (!Number.isFinite(at) || !Number.isFinite(pnl)) return false

  const interval = Number(everyMs) || SAMPLE_MS
  // The first sample always lands, so a curve exists from the first frame rather than
  // appearing five seconds into the session.
  if (lastAt !== 0 && at - lastAt < interval) return false

  lastAt = at
  samples.push({ t: at, v: Number(pnl.toFixed(8)) })
  setValue(PATHS.trade.equityPath, curvePath())
  return true
}

/** @returns {object[]} the session's samples, oldest first. */
export function curve() {
  return samples.toArray()
}

/**
 * The session's shape, as numbers a renderer can use.
 *
 * @param {object[]} [points] - the samples.
 * @returns {{peak: number, trough: number, drawdown: number, last: number,
 *   direction: string}} the shape.
 */
export function curveStats(points = curve()) {
  const rows = Array.isArray(points) ? points : []
  if (rows.length === 0) return { peak: 0, trough: 0, drawdown: 0, last: 0, direction: 'flat' }

  let peak = -Infinity
  let trough = Infinity
  let drawdown = 0
  let runningPeak = -Infinity

  for (const point of rows) {
    const v = Number(point?.v) || 0
    peak = Math.max(peak, v)
    trough = Math.min(trough, v)
    runningPeak = Math.max(runningPeak, v)
    // Drawdown from the *running* peak, not the final one: the worst moment of the day
    // is what a trader wants, and measuring from the end would report zero on a day that
    // recovered.
    drawdown = Math.min(drawdown, v - runningPeak)
  }

  const last = Number(rows[rows.length - 1]?.v) || 0
  const first = Number(rows[0]?.v) || 0

  return {
    peak: Number(peak.toFixed(8)),
    trough: Number(trough.toFixed(8)),
    drawdown: Number(drawdown.toFixed(8)),
    last,
    direction: last > first ? 'up' : last < first ? 'down' : 'flat',
  }
}

/**
 * Normalise the curve to 0..1, so it can be drawn in any box.
 *
 * @param {object[]} [points] - the samples.
 * @returns {number[]} ratios, oldest first.
 */
export function curveRatios(points = curve()) {
  const values = (Array.isArray(points) ? points : []).map((point) => Number(point?.v) || 0)
  if (values.length === 0) return []

  const min = Math.min(...values)
  const max = Math.max(...values)
  // A flat session is a flat line through the middle, not a division by zero.
  if (max === min) return values.map(() => 0.5)

  return values.map((v) => (v - min) / (max - min))
}

/**
 * The curve as an SVG points string.
 *
 * @param {{width?: number, height?: number}} [box] - the drawing box.
 * @returns {string} the polyline points.
 */
export function curvePath(box = {}) {
  const { width = 120, height = 28 } = box
  // Reuses the watchlist's sparkline geometry rather than a second implementation: the
  // two curves should look identical, because they are the same idea at two sizes.
  return sparklinePath(curveRatios(), width, height)
}

/** Forget the session's curve. */
export function resetEquity() {
  samples.clear()
  lastAt = 0
  return true
}
