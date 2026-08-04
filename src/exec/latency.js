/**
 * Order latency.
 *
 * "It feels slow" is not a bug report. Stamping each transition turns the claim into a
 * number, and the number is usually somewhere surprising — the click-to-submit leg is
 * almost always the desk's own fault, while submit-to-ack is the venue's and there is
 * nothing to do but know it.
 *
 * The clock is `performance.now()`: a monotonic clock, immune to the wall clock stepping
 * mid-session, which would otherwise produce negative latencies nobody can explain.
 */

/** clientId -> stamps. */
const stamps = new Map()

/** Rolling window used for the summary. */
export const WINDOW = 100

/** Completed submit→ack samples, newest last. */
let samples = []

/**
 * Record a moment in an order's life.
 *
 * @param {string} clientId - the order.
 * @param {string} phase - 'submit', 'ack' or 'fill'.
 * @param {number} at - a monotonic timestamp.
 * @returns {object} the stamps so far.
 */
export function stampLatency(clientId, phase, at) {
  const id = String(clientId ?? '')
  const when = Number(at)
  if (!id || !Number.isFinite(when)) return stamps.get(id) ?? {}

  const record = { ...(stamps.get(id) ?? {}), [String(phase)]: when }
  stamps.set(id, record)

  // The submit→ack leg is the one worth aggregating: it is the venue's round trip, and
  // it is what changes when something is wrong with the connection rather than the code.
  if (phase === 'ack' && Number.isFinite(record.submit)) {
    samples = [...samples, when - record.submit].slice(-WINDOW)
  }

  return record
}

/**
 * The legs of one order's life.
 *
 * @param {string} clientId - the order.
 * @returns {{toAck: number, toFill: number, total: number}} the durations.
 */
export function latencyFor(clientId) {
  const record = stamps.get(String(clientId ?? '')) ?? {}
  const submit = Number(record.submit)
  const ack = Number(record.ack)
  const fill = Number(record.fill)

  const leg = (from, to) => (Number.isFinite(from) && Number.isFinite(to) ? to - from : 0)

  return {
    toAck: leg(submit, ack),
    toFill: leg(ack, fill),
    total: leg(submit, fill),
  }
}

/**
 * The rolling summary the HUD shows.
 *
 * @returns {{count: number, p50: number, p95: number, worst: number}} the summary.
 */
export function latencySummary() {
  if (samples.length === 0) return { count: 0, p50: 0, p95: 0, worst: 0 }

  const sorted = [...samples].sort((a, b) => a - b)
  const at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))]

  // p95 rather than an average: the average hides the one submit in twenty that took a
  // second, and that one is the whole story when a desk feels unreliable.
  return {
    count: sorted.length,
    p50: Math.round(at(0.5)),
    p95: Math.round(at(0.95)),
    worst: Math.round(sorted[sorted.length - 1]),
  }
}

/** Forget every stamp. */
export function resetLatency() {
  stamps.clear()
  samples = []
  return true
}
