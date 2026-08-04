/**
 * HUD maths.
 *
 * The numbers a scalper checks between trades rather than during them: how fast the desk
 * is answering, how wide the market is, how the session is pacing. All of it is derived
 * from data the desk already has — no new measurement, just arithmetic over what the
 * pipeline and the execution engine already stamped.
 *
 * Everything is smoothed. A latency readout showing the last sample changes faster than
 * it can be read; one showing a mean hides the tail that actually hurts. So the tiles
 * show a smoothed centre *and* a percentile.
 */

/**
 * The mean of a sample list.
 *
 * @param {number[]} values - the samples.
 * @returns {number} the mean, or 0 when there are none.
 */
export function rollingMean(values) {
  const list = (Array.isArray(values) ? values : []).filter(Number.isFinite)
  if (list.length === 0) return 0

  let total = 0
  for (const value of list) total += value

  return Number((total / list.length).toFixed(6))
}

/**
 * Exponentially weighted mean.
 *
 * @param {number} previous - the last smoothed value.
 * @param {number} next - the new sample.
 * @param {number} [alpha] - weight of the new sample.
 * @returns {number} the smoothed value.
 */
export function ewma(previous, next, alpha = 0.2) {
  const sample = Number(next)
  if (!Number.isFinite(sample)) return Number(previous) || 0

  const prior = Number(previous)
  // Seeded by the first sample rather than crawling out of zero: a HUD that spends its
  // first ten seconds climbing is one that gets ignored for the first ten seconds.
  if (!Number.isFinite(prior)) return sample

  const weight = Math.min(1, Math.max(0, Number(alpha) || 0))
  return Number((prior + weight * (sample - prior)).toFixed(6))
}

/**
 * A percentile of a sample list.
 *
 * @param {number[]} values - the samples.
 * @param {number} p - the percentile, 0..1.
 * @returns {number} the value at that percentile, or 0 without samples.
 */
export function percentile(values, p) {
  const list = (Array.isArray(values) ? values : []).filter(Number.isFinite).sort((a, b) => a - b)
  if (list.length === 0) return 0

  const q = Math.min(1, Math.max(0, Number(p) || 0))
  // Nearest-rank rather than interpolated: with a handful of samples an interpolated p95
  // reports a number that never actually happened.
  const index = Math.min(list.length - 1, Math.floor(q * list.length))

  return list[index]
}

/**
 * Events per minute from a window of timestamps.
 *
 * @param {number[]} timestamps - event times, any order.
 * @param {number} now - the current time.
 * @param {number} [windowMs] - how far back to count.
 * @returns {number} the rate per minute.
 */
export function ratePerMinute(timestamps, now, windowMs = 60000) {
  const at = Number(now)
  const span = Math.max(1, Number(windowMs) || 60000)
  if (!Number.isFinite(at)) return 0

  const cutoff = at - span
  const count = (Array.isArray(timestamps) ? timestamps : []).filter(
    (ts) => Number.isFinite(Number(ts)) && Number(ts) > cutoff,
  ).length

  return Number(((count / span) * 60000).toFixed(2))
}

/**
 * Milliseconds, at a width that does not shift.
 *
 * @param {number} ms - the duration.
 * @returns {string} e.g. '84ms', '1.2s', '—'.
 */
export function formatMs(ms) {
  const value = Number(ms)
  if (!Number.isFinite(value) || value < 0) return '—'

  // A tile that changes width makes the whole row jump, and past a second the precision
  // stops mattering anyway.
  if (value >= 1000) return `${(value / 1000).toFixed(1)}s`
  return `${Math.round(value)}ms`
}

/**
 * Basis points, at a fixed width.
 *
 * @param {number} bps - the value.
 * @returns {string} e.g. '2.4bp'.
 */
export function formatBps(bps) {
  const value = Number(bps)
  if (!Number.isFinite(value)) return '—'

  return `${value.toFixed(1)}bp`
}

/**
 * A count, compacted.
 *
 * @param {number} value - the number.
 * @returns {string} e.g. '1.2K'.
 */
export function formatCompact(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'

  const magnitude = Math.abs(n)
  if (magnitude >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (magnitude >= 1e3) return `${(n / 1e3).toFixed(1)}K`

  return magnitude >= 100 ? String(Math.round(n)) : n.toFixed(1)
}

/**
 * Grade a latency for the tile's colour.
 *
 * @param {number} ms - the latency.
 * @param {{good?: number, bad?: number}} [thresholds] - the bands.
 * @returns {string} 'good', 'warn' or 'bad'.
 */
export function gradeLatency(ms, thresholds = {}) {
  const value = Number(ms)
  const good = Number(thresholds.good) || 120
  const bad = Number(thresholds.bad) || 400
  if (!Number.isFinite(value)) return 'warn'

  // Named bands rather than a gradient: the question asked of this tile is "can I trust
  // the fast path right now", which has three answers, not a spectrum.
  if (value <= good) return 'good'
  return value <= bad ? 'warn' : 'bad'
}
