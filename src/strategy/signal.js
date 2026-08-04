import { setValue, appState } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { toSignal } from './contract.js'
import { appendSignal } from './history.js'

/**
 * The one dialect every strategy speaks.
 *
 * Direction as a number rather than a word, because a consumer that has to remember
 * whether 'sell' means -1 or 1 will eventually get it backwards, and getting it backwards
 * here means trading the opposite of what was signalled.
 *
 * Signals **expire**. A strategy that says "long" once and then goes quiet has not said
 * "long forever" — it has said nothing since. Without a ttl, a signal from twenty minutes
 * ago sits on screen looking exactly like one from this tick, which is how a stalled
 * strategy gets traded off.
 *
 * The action vocabulary lives in `contract.js` and is normalised there; this module maps
 * it to a direction and stamps it. Two vocabularies would be one too many.
 */

/** Directions. */
export const DIR = Object.freeze({ LONG: 1, SHORT: -1, FLAT: 0 })

/** How long a signal stays meaningful by default, in ms. */
export const DEFAULT_TTL_MS = 30000

/** Action → direction. The only place the two are related. */
export const ACTION_DIR = Object.freeze({
  buy: DIR.LONG,
  sell: DIR.SHORT,
  flat: DIR.FLAT,
  none: DIR.FLAT,
})

/**
 * Force strength into a usable 0..1.
 *
 * @param {any} value - the raw strength.
 * @returns {number} 0..1.
 */
export function clampStrength(value) {
  const num = Number(value)
  // Missing conviction is no conviction. Defaulting to 1 would make every sloppy return a
  // maximum-confidence signal.
  if (!Number.isFinite(num)) return 0

  return Math.min(1, Math.max(0, num))
}

/**
 * Turn whatever a strategy returned into a canonical signal.
 *
 * @param {any} raw - the hook's return value.
 * @param {{now?: number, ttl?: number, source?: string, instrument?: string}} [meta] - the run.
 * @returns {object} the signal.
 */
export function normalizeSignal(raw, meta = {}) {
  const base = toSignal(raw)
  const ttl = Number(raw?.ttl ?? meta.ttl)

  return {
    dir: ACTION_DIR[base.action] ?? DIR.FLAT,
    action: base.action,
    strength: clampStrength(base.strength),
    reason: base.reason,
    // A ttl of 0 means "until told otherwise" and is a deliberate choice, not a default —
    // hence `>= 0` rather than a truthiness check.
    ttl: Number.isFinite(ttl) && ttl >= 0 ? ttl : DEFAULT_TTL_MS,
    ts: Number(meta.now) || 0,
    source: String(meta.source ?? ''),
    instrument: String(meta.instrument ?? ''),
  }
}

/**
 * Has a signal outlived its own claim?
 *
 * @param {object} signal - the signal.
 * @param {number} now - the current time.
 * @returns {boolean} true when expired.
 */
export function isExpired(signal, now) {
  const ttl = Number(signal?.ttl)
  const ts = Number(signal?.ts)
  const at = Number(now)
  if (!Number.isFinite(at) || !Number.isFinite(ts)) return false
  // Zero means never — a signal that holds until the strategy replaces it.
  if (!Number.isFinite(ttl) || ttl <= 0) return false

  return at - ts > ttl
}

/**
 * A flat signal, for when one has expired.
 *
 * @param {object} signal - the expired signal.
 * @param {number} now - the current time.
 * @returns {object} a flat signal in its place.
 */
export function flatten(signal, now) {
  return {
    ...normalizeSignal({ action: 'flat', reason: 'expired' }, { now, ttl: 0 }),
    source: String(signal?.source ?? ''),
    instrument: String(signal?.instrument ?? ''),
  }
}

/**
 * Publish one run's signal.
 *
 * @param {string} runKey - the run.
 * @param {object} signal - the normalised signal.
 * @returns {object} the signal.
 */
export function publishSignal(runKey, signal) {
  const key = String(runKey ?? '')
  if (!key) return signal

  // Remembered on the same call that publishes it: a history appended from a second place
  // would eventually miss an emission path nobody thought to update.
  appendSignal(key, signal)

  setValue(PATHS.strategy.signals, {
    ...(appState.strategy?.signals ?? {}),
    [key]: signal,
  })

  return signal
}

/**
 * Flip every expired signal to flat.
 *
 * @param {number} now - the current time.
 * @param {object} [state] - the strategy slice.
 * @returns {string[]} the runs that expired.
 */
export function sweepSignals(now, state = appState?.strategy) {
  const signals = state?.signals ?? {}
  const expired = Object.keys(signals).filter((key) => isExpired(signals[key], now))
  if (expired.length === 0) return []

  // Folded into one write: `setValue` lands next tick, so writing per key would have each
  // write read a map missing the previous one.
  const next = { ...signals }
  for (const key of expired) next[key] = flatten(signals[key], now)
  setValue(PATHS.strategy.signals, next)

  return expired
}

/**
 * The chip a signal renders as.
 *
 * @param {object} signal - the signal.
 * @returns {{glyph: string, tone: string, pct: number, title: string}} the chip.
 */
export function signalChip(signal) {
  const dir = Number(signal?.dir) || DIR.FLAT
  const strength = clampStrength(signal?.strength)

  return {
    glyph: dir === DIR.LONG ? '▲' : dir === DIR.SHORT ? '▼' : '–',
    tone: dir === DIR.LONG ? 'long' : dir === DIR.SHORT ? 'short' : 'flat',
    pct: Math.round(strength * 100),
    // The reason is the whole point of carrying one: a chip that says "short" and nothing
    // else is a number nobody can argue with after the fact.
    title: String(signal?.reason ?? '') || 'no signal',
  }
}
