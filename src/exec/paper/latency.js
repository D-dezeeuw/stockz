import { appState } from '../../app/engine.js'
import { createSeededRng } from '../../backtest/determinism.js'

/**
 * Optional realism: paper orders feel the delay live ones would.
 *
 * A paper fill that lands the instant the button is pressed teaches a habit that does not
 * survive contact with a venue. Forty milliseconds is not a rounding error at scalping
 * frequency — it is the difference between the price on screen and the price in the fill,
 * and a trader who practises without it learns to click at moments that will not work.
 *
 * Off by default. The realism is worth having, but a beginner learning the desk should not
 * have their first ten orders feel broken, and *choosing* the delay is what makes it a
 * lesson rather than a bug.
 *
 * Jitter routes through the same seeded generator the backtester uses. A paper session with
 * unseeded randomness could not be reproduced from its recording, which would make the two
 * halves of this desk disagree about what "the same run" means.
 */

/** What the desk assumes when nobody has configured it. */
export const DEFAULT_LATENCY = Object.freeze({ ms: 0, jitter: 0.3 })

/** One generator for the session, so a run is reproducible from its seed. */
let rng = createSeededRng()

/**
 * The configured delay.
 *
 * @param {object} [state] - engine state.
 * @returns {{ms: number, jitter: number}} the setting.
 */
export function latencyConfig(state = appState) {
  const ms = Number(state?.settings?.paperLatencyMs)
  const jitter = Number(state?.settings?.paperLatencyJitter)

  return {
    ms: Number.isFinite(ms) && ms >= 0 ? ms : DEFAULT_LATENCY.ms,
    // Clamped to 0..1: a jitter above 1 would produce negative delays, and an order that
    // arrives before it was sent is not realism.
    jitter: Number.isFinite(jitter) ? Math.max(0, Math.min(1, jitter)) : DEFAULT_LATENCY.jitter,
  }
}

/**
 * How long this particular order takes to arrive.
 *
 * @param {{ms?: number, jitter?: number}} config - the setting.
 * @param {() => number} [draw] - injectable randomness.
 * @returns {number} milliseconds.
 */
export function latencyFor(config = DEFAULT_LATENCY, draw = rng) {
  const base = Math.max(0, Number(config?.ms) || 0)
  if (base === 0) return 0

  const spread = Math.max(0, Math.min(1, Number(config?.jitter) || 0))
  const sample = typeof draw === 'function' ? draw() : 0.5
  // Symmetric around the base. Real latency is not a constant, and a sim that always
  // delivered exactly 40ms would teach a rhythm the wire does not have.
  const delay = base * (1 + spread * (sample * 2 - 1))

  return Math.max(0, Math.round(delay))
}

/**
 * Run something after the wire would have carried it.
 *
 * @param {Function} fn - what to do on arrival.
 * @param {{timer?: object, config?: object, draw?: Function}} [deps] - injectable plumbing.
 * @returns {Promise<any>} what `fn` returned.
 */
export function afterLatency(fn, deps = {}) {
  const config = deps.config ?? latencyConfig()
  const delay = latencyFor(config, deps.draw ?? rng)
  const timer = deps.timer ?? globalThis

  // Zero is a *synchronous* return, not a zero-length timeout. A `setTimeout(fn, 0)` on
  // the default path would push every paper fill a frame later than the click, which is
  // exactly the latency this feature exists to make optional.
  if (delay <= 0 || typeof timer.setTimeout !== 'function') {
    return Promise.resolve(fn())
  }

  return new Promise((resolve) => {
    timer.setTimeout(() => resolve(fn()), delay)
  })
}

/**
 * Reseed the session's generator.
 *
 * @param {number} seed - the seed.
 * @returns {boolean} true.
 */
export function seedLatency(seed) {
  rng = createSeededRng(seed)
  return true
}
