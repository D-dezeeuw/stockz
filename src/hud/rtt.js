import { setValue } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { etoroRequest } from '../venues/etoro/rest.js'
import { ewma } from './metrics.js'

/**
 * Venue round-trip time.
 *
 * The number that answers "is it me or is it them". A desk that feels slow could be a
 * busy tab, a saturated uplink or a venue having a bad minute, and those have completely
 * different responses — the first two are the trader's problem, the third means sitting
 * out until it clears.
 *
 * Probes are jittered on purpose. Two venues polled on the same 5s boundary produce a
 * synchronised spike in the desk's own network use every five seconds, which is a
 * self-inflicted version of exactly the problem being measured.
 */

/** Tier cut lines, in milliseconds. */
export const RTT_TIERS = Object.freeze({ ok: 80, warn: 250 })

/** How often a venue is probed. */
export const PROBE_MS = 5000

/** Smoothed readings per venue. */
let readings = {}

/**
 * Grade a round-trip time.
 *
 * @param {number} ms - the measurement.
 * @returns {string} 'ok', 'warn', 'bad' or 'unknown'.
 */
export function classifyRtt(ms) {
  const value = Number(ms)
  // Never measured is not the same as slow, and showing it as bad would have every desk
  // start its session looking broken.
  if (!Number.isFinite(value) || value < 0) return 'unknown'

  if (value <= RTT_TIERS.ok) return 'ok'
  return value <= RTT_TIERS.warn ? 'warn' : 'bad'
}

/**
 * Time an OKX ping/pong round trip.
 *
 * @param {object} socket - a socket exposing send() and an onFrame hook.
 * @param {{clock?: () => number, timeoutMs?: number, timer?: object}} [deps] - plumbing.
 * @returns {Promise<number>} the round trip in ms, or -1 on timeout.
 */
export function pingOkx(socket, deps = {}) {
  const { clock = () => globalThis.performance?.now?.() ?? 0, timeoutMs = 5000, timer = globalThis } =
    deps

  if (typeof socket?.send !== 'function' || typeof socket?.onPong !== 'function') {
    return Promise.resolve(-1)
  }

  return new Promise((resolve) => {
    const started = clock()
    let settled = false

    const finish = (value) => {
      if (settled) return
      settled = true
      resolve(value)
    }

    // A timeout resolves rather than rejects: an unanswered ping *is* the measurement —
    // it says the venue is not answering, which is the most important reading there is.
    const handle = timer.setTimeout?.(() => finish(-1), timeoutMs)

    socket.onPong(() => {
      timer.clearTimeout?.(handle)
      finish(Number((clock() - started).toFixed(3)))
    })
    socket.send('ping')
  })
}

/**
 * Time an EToro REST probe.
 *
 * @param {{request?: Function, clock?: () => number}} [deps] - plumbing.
 * @returns {Promise<number>} the round trip in ms, or -1 when it failed.
 */
export async function probeEtoro(deps = {}) {
  const { request = etoroRequest, clock = () => globalThis.performance?.now?.() ?? 0 } = deps
  const started = clock()

  const result = await request({ method: 'GET', path: '/status' }).catch(() => null)
  // A failed probe is -1, not a large number: reporting a timeout as "3000ms" would let
  // it drag a smoothed average around long after the venue came back.
  if (!result?.ok) return -1

  return Number((clock() - started).toFixed(3))
}

/**
 * Record a reading for a venue.
 *
 * @param {string} venue - the venue.
 * @param {number} ms - the measurement.
 * @returns {{ms: number, tier: string}} the smoothed reading.
 */
export function recordRtt(venue, ms) {
  const key = String(venue ?? '')
  if (!key) return { ms: -1, tier: 'unknown' }

  const value = Number(ms)
  // A failed probe replaces the reading outright rather than smoothing into it: "not
  // answering" is a state, not a slow sample.
  const next = value < 0 ? -1 : ewma(readings[key]?.ms >= 0 ? readings[key].ms : undefined, value)

  readings = { ...readings, [key]: { ms: next, tier: classifyRtt(next) } }
  return readings[key]
}

/**
 * The worst venue right now.
 *
 * @returns {{venue: string, ms: number, tier: string}} the worst reading.
 */
export function worstRtt() {
  let worst = { venue: '', ms: -1, tier: 'unknown' }

  for (const [venue, reading] of Object.entries(readings)) {
    // A venue that is not answering is the worst case outright, whatever the others read.
    if (reading.ms < 0) return { venue, ...reading }
    if (reading.ms > worst.ms) worst = { venue, ...reading }
  }

  return worst
}

/**
 * Publish the RTT readings.
 *
 * @returns {object} the readings now in state.
 */
export function flushRtt() {
  const snapshot = { ...readings, worst: worstRtt() }
  setValue(PATHS.ui.rtt, snapshot)

  return snapshot
}

/**
 * The delay before the next probe, jittered.
 *
 * @param {number} [baseMs] - the nominal interval.
 * @param {() => number} [random] - the jitter source.
 * @returns {number} milliseconds to wait.
 */
export function nextProbeDelay(baseMs = PROBE_MS, random = Math.random) {
  const base = Math.max(500, Number(baseMs) || PROBE_MS)
  const jitter = Number(random()) || 0

  // ±20%: two venues polled on the same boundary make a synchronised spike in the desk's
  // own network use, which is a self-inflicted version of the problem being measured.
  return Math.round(base * (0.8 + 0.4 * Math.min(1, Math.max(0, jitter))))
}

/**
 * Probe a venue on a loop.
 *
 * @param {string} venue - the venue name.
 * @param {() => Promise<number>} probe - the probe.
 * @param {{timer?: object, random?: () => number, baseMs?: number}} [options] - plumbing.
 * @returns {() => void} stop.
 */
export function startProbe(venue, probe, options = {}) {
  const { timer = globalThis, random = Math.random, baseMs = PROBE_MS } = options
  if (typeof timer?.setTimeout !== 'function' || typeof probe !== 'function') return () => {}

  let stopped = false
  let handle = null

  const run = async () => {
    if (stopped) return
    recordRtt(venue, await probe())
    flushRtt()
    if (!stopped) handle = timer.setTimeout(run, nextProbeDelay(baseMs, random))
  }

  handle = timer.setTimeout(run, nextProbeDelay(baseMs, random))
  return () => {
    stopped = true
    timer.clearTimeout?.(handle)
  }
}

/** Forget every reading. */
export function resetRtt() {
  readings = {}
  return true
}
