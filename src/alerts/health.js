import { appState } from '../app/engine.js'
import { emitAlert, alertEnabled } from './bus.js'

/**
 * Feed and market health warnings.
 *
 * The alerts a trader most needs are the ones about conditions rather than events, because
 * conditions are what make an otherwise good trade expensive. A spread that has quietly
 * tripled, a feed lagging by half a second, a venue that dropped and came back — none of
 * these announce themselves, and all of them cost money before anyone notices.
 *
 * Everything here is measured against a **baseline the desk learned**, not a constant. A
 * two-tick spread is normal on one instrument and a blowout on another, and a threshold
 * that has to be set per instrument is a threshold nobody sets.
 *
 * These warnings are the most likely on the whole desk to be muted for crying wolf, which
 * is why the spike detectors all require *persistence*: one wide print between two normal
 * ones is a print, not a condition.
 */

/** How many consecutive updates a spike must hold. */
export const SPIKE_STREAK = 3

/** How slow the feed has to get before it is worth saying so. */
export const LATENCY_WARN_MS = 500

/**
 * The learned normal spread.
 *
 * @param {number} prev - the previous baseline.
 * @param {number} spread - the current spread.
 * @param {number} [alpha] - the smoothing.
 * @returns {number} the new baseline.
 */
export function spreadBaseline(prev, spread, alpha = 0.02) {
  const value = Number(spread)
  if (!Number.isFinite(value) || value <= 0) return Number(prev) || 0

  const previous = Number(prev)
  // Seeded on the first reading. A baseline crawling up from zero would call the first
  // minute of every session a blowout.
  if (!Number.isFinite(previous) || previous <= 0) return value

  const a = Number(alpha)
  const rate = Number.isFinite(a) && a > 0 && a <= 1 ? a : 0.02

  // Very slow on purpose: the baseline is "what this instrument's spread normally is", and
  // one that chased the blowout would stop calling it a blowout within seconds.
  return Number((previous + rate * (value - previous)).toFixed(6))
}

/**
 * Has the spread blown out?
 *
 * @param {object} state - the run's scratchpad.
 * @param {number} spread - the current spread.
 * @param {number} baseline - the learned normal.
 * @param {number} k - the multiple that counts as a spike.
 * @param {number} [streakM] - how many consecutive updates it must hold.
 * @returns {{spiking: boolean, streak: number, ratio: number}} the verdict.
 */
export function spreadSpike(state, spread, baseline, k, streakM = SPIKE_STREAK) {
  const value = Number(spread) || 0
  const normal = Number(baseline) || 0
  const times = Number(k) > 0 ? Number(k) : 3
  const need = Math.max(1, Math.floor(Number(streakM) || SPIKE_STREAK))
  if (!state || normal <= 0 || value <= 0) {
    if (state) state.spreadStreak = 0
    return { spiking: false, streak: 0, ratio: 0 }
  }

  const ratio = Number((value / normal).toFixed(3))
  // One wide print between two normal ones is a print, not a condition — and this is the
  // alert most likely to get muted for crying wolf.
  state.spreadStreak = ratio >= times ? (Number(state.spreadStreak) || 0) + 1 : 0

  return { spiking: state.spreadStreak >= need, streak: state.spreadStreak, ratio }
}

/**
 * Is the feed lagging?
 *
 * @param {number[]} samples - recent round-trip times.
 * @param {number} thresholdMs - the level that counts as slow.
 * @returns {{slow: boolean, worst: number}} the verdict.
 */
export function latencySpike(samples, thresholdMs) {
  const rows = (Array.isArray(samples) ? samples : []).map(Number).filter(Number.isFinite)
  const limit = Number(thresholdMs) > 0 ? Number(thresholdMs) : LATENCY_WARN_MS
  if (rows.length === 0) return { slow: false, worst: 0 }

  // Judged on the *median* rather than the worst sample: one 900ms round trip is a hiccup,
  // and warning on it would fire several times an hour on a healthy connection.
  const sorted = [...rows].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]
  const worst = sorted.at(-1)

  return { slow: median > limit, worst }
}

/**
 * A downtime gap in words.
 *
 * @param {number} downMs - how long the venue was gone.
 * @returns {string} the duration.
 */
export function formatDowntime(downMs) {
  const ms = Number(downMs)
  if (!Number.isFinite(ms) || ms < 0) return 'unknown'
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`

  const minutes = Math.floor(ms / 60000)
  const seconds = Math.round((ms % 60000) / 1000)

  return `${minutes}m${seconds ? ` ${seconds}s` : ''}`
}

/** When each venue was last seen live. */
const venues = new Map()

/**
 * Announce a venue going down or coming back.
 *
 * @param {string} venue - the venue.
 * @param {string} state - its connection state.
 * @param {number} now - the current time.
 * @returns {object|null} the alert, or null when nothing changed.
 */
export function venueTransition(venue, state, now) {
  const id = String(venue ?? '')
  const live = String(state ?? '') === 'live'
  const at = Number(now) || 0
  if (!id) return null

  const before = venues.get(id)
  venues.set(id, { live, at: live === before?.live ? (before?.at ?? at) : at })
  // Only transitions alert. A socket reporting 'live' sixty times a second is not sixty
  // pieces of news.
  if (before === undefined || before.live === live) return null

  if (!live) {
    return emitAlert(
      { key: `health|down|${id}`, source: 'health', kind: 'disconnect', severity: 'error', text: `${id} disconnected`, ts: at },
      { debounceMs: 0 },
    )
  }

  // The gap is the whole point of the reconnect message: "back after 400ms" and "back
  // after four minutes" call for completely different next actions.
  const gap = formatDowntime(at - Number(before.at ?? at))

  return emitAlert(
    { key: `health|up|${id}`, source: 'health', kind: 'reconnect', severity: 'info', text: `${id} reconnected after ${gap}`, ts: at },
    { debounceMs: 0 },
  )
}

/**
 * Run the health checks for one frame.
 *
 * @param {object} state - the scratchpad holding the baselines.
 * @param {{spread?: number, rtt?: number[], now?: number}} reading - this frame's readings.
 * @returns {object[]} the alerts raised.
 */
export function checkHealth(state, reading = {}) {
  if (!state) return []

  const raised = []
  const now = Number(reading.now) || 0
  const settings = appState.settings ?? {}
  const spread = Number(reading.spread) || 0

  state.spreadBase = spreadBaseline(state.spreadBase, spread, settings.spreadBaselineAlpha)
  const spike = spreadSpike(state, spread, state.spreadBase, settings.spreadSpikeK)
  if (spike.spiking && alertEnabled('health', 'spread')) {
    const alert = emitAlert(
      {
        key: 'health|spread',
        source: 'health',
        kind: 'spread',
        severity: 'warn',
        text: `spread ${spike.ratio}× normal`,
        ts: now,
      },
      // A long debounce: the condition persists, and repeating it every frame would bury
      // everything else on the desk.
      { debounceMs: 30000 },
    )
    if (alert) raised.push(alert)
  }

  const lag = latencySpike(reading.rtt, settings.latencyWarnMs)
  if (lag.slow && alertEnabled('health', 'latency')) {
    const alert = emitAlert(
      {
        key: 'health|latency',
        source: 'health',
        kind: 'latency',
        severity: 'warn',
        text: `feed lagging — ${Math.round(lag.worst)}ms round trip`,
        ts: now,
      },
      { debounceMs: 30000 },
    )
    if (alert) raised.push(alert)
  }

  return raised
}

/**
 * Forget every learned baseline and connection state.
 *
 * @returns {boolean} true.
 */
export function resetHealth() {
  venues.clear()
  return true
}
