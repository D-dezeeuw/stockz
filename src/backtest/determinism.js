/**
 * Same recording, same params, same seed, same result — to the tick.
 *
 * A backtest that cannot be reproduced is an anecdote. Two runs of the same configuration
 * that disagree mean one of three things, and the trader cannot tell which: the sim has
 * unseeded randomness, the money maths drifts by float error, or the fill model reads
 * something outside the recording. All three are bugs, and all three hide behind "close
 * enough" until somebody sizes up on a number that was never real.
 *
 * So the sim has exactly one source of randomness, it is seeded, and a run's outcome
 * reduces to a **hash** — one string equality that either matches or does not, with no
 * tolerance to argue about.
 *
 * Everything here is pure and imports nothing: the RNG runs inside the backtest worker,
 * where a bare specifier would fail to resolve.
 */

/**
 * The seed a run uses when nobody chose one.
 *
 * A fixed number rather than a timestamp: an unseeded run must still be reproducible, and
 * `Date.now()` as a default would make "I did not pick a seed" mean "this can never be
 * repeated" — which is the failure this module exists to remove.
 */
export const DEFAULT_SEED = 0x57c2c1

/**
 * A seeded PRNG — mulberry32.
 *
 * Thirty-two bits of state, one multiply and three shifts per draw, and the same sequence
 * on every engine. `Math.random` is none of those things: it is seeded by the host, and a
 * sim that reaches it can never be replayed, which makes every number it produced
 * unfalsifiable.
 *
 * @param {number} seed - the run's seed.
 * @returns {() => number} a generator returning 0 ≤ x < 1.
 */
export function createSeededRng(seed = DEFAULT_SEED) {
  // Coerced into a uint32 rather than trusted: a float or a negative seed would shift the
  // state into a different sequence on different engines, which is the exact thing this
  // exists to prevent.
  let state = (Math.floor(Number(seed) || 0) >>> 0) || 1

  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Round a price to the venue's tick.
 *
 * @param {number} price - the raw price.
 * @param {number} tick - the instrument's tick size.
 * @returns {number} the price on the grid.
 */
export function roundToTick(price, tick) {
  const value = Number(price)
  const size = Number(tick)
  if (!Number.isFinite(value)) return 0
  if (!Number.isFinite(size) || size <= 0) return Number(value.toFixed(8))

  // Divided, rounded, multiplied, then fixed — the `toFixed` is not cosmetic. `0.1 * 3` is
  // 0.30000000000000004, and two runs that accumulate that difference in a different order
  // produce different hashes for identical trades.
  const decimals = String(size).split('.')[1]?.length ?? 8
  return Number((Math.round(value / size) * size).toFixed(Math.min(12, decimals + 2)))
}

/**
 * Add money without accumulating float error.
 *
 * @param {number[]} values - the amounts.
 * @param {number} [decimals] - the precision to settle at.
 * @returns {number} the sum.
 */
export function sumMoney(values, decimals = 8) {
  const places = Math.max(0, Math.min(12, Math.floor(Number(decimals) || 8)))
  const scale = 10 ** places

  // Summed as integers and divided once at the end. Rounding per addition would make the
  // total depend on the order the trades happened to arrive in, and a hash over a
  // reordered-but-identical run must match.
  const total = (Array.isArray(values) ? values : []).reduce((sum, value) => {
    const n = Number(value)
    return sum + (Number.isFinite(n) ? Math.round(n * scale) : 0)
  }, 0)

  return Number((total / scale).toFixed(places))
}

/**
 * Canonical JSON: object keys sorted, everywhere, at every depth.
 *
 * @param {any} value - anything serialisable.
 * @returns {string} the canonical form.
 */
export function canonicalJson(value) {
  const walk = (node) => {
    if (Array.isArray(node)) return node.map(walk)
    if (node && typeof node === 'object') {
      // Sorted, because `JSON.stringify` preserves insertion order and two runs that built
      // the same object by different routes would hash differently while being identical.
      return Object.fromEntries(
        Object.keys(node)
          .sort()
          .map((key) => [key, walk(node[key])]),
      )
    }
    // A non-finite number has no JSON form — `stringify` turns it into `null`, silently
    // making Infinity and NaN hash the same. Named instead.
    if (typeof node === 'number' && !Number.isFinite(node)) return `#${String(node)}`
    return node
  }

  return JSON.stringify(walk(value))
}

/**
 * Hash a run's outcome to one comparable string.
 *
 * FNV-1a: forty lines less than anything cryptographic, and this is not a security
 * boundary — it answers "are these two runs the same", where a collision costs a false
 * green on a check somebody runs deliberately.
 *
 * @param {object} result - a backtest result or its fill log.
 * @returns {string} an 8-character hex digest.
 */
export function hashRunResult(result) {
  // The *fills* are the outcome. Hashing the whole result would fold in `elapsedMs`, which
  // differs every run by construction, and the check would never pass.
  const subject = {
    fills: Array.isArray(result?.fills) ? result.fills : [],
    signals: Array.isArray(result?.signals) ? result.signals : [],
    played: Number(result?.played) || 0,
    unfilled: Number(result?.unfilled) || 0,
  }

  const text = canonicalJson(subject)
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }

  return hash.toString(16).padStart(8, '0')
}

/**
 * Run the same backtest twice and prove the two agree.
 *
 * @param {object} config - the run to repeat.
 * @param {{run?: Function}} deps - the runner.
 * @returns {Promise<object>} the verdict.
 */
export async function verifyDeterminism(config = {}, deps = {}) {
  const run = typeof deps.run === 'function' ? deps.run : null
  if (!run) return { ok: false, deterministic: false, reason: 'no runner', hashes: [] }

  const first = await run(config)
  const second = await run(config)
  if (!first || !second) {
    return { ok: false, deterministic: false, reason: 'a run failed', hashes: [] }
  }

  const hashes = [hashRunResult(first), hashRunResult(second)]
  const deterministic = hashes[0] === hashes[1]

  return {
    ok: true,
    deterministic,
    hashes,
    seed: Number(config?.seed) || DEFAULT_SEED,
    // Said in the verdict rather than inferred from a badge colour: a run that differs is
    // the interesting case, and "which run" is the first question after it.
    reason: deterministic ? '' : `hashes differ: ${hashes[0]} vs ${hashes[1]}`,
  }
}

/**
 * Publish the verdict, and run it.
 *
 * @param {object} _state - engine state (unused).
 * @param {object} [payload] - injectable runner and config.
 * @returns {Promise<object>} the verdict.
 */
export async function checkDeterminism(_state, payload = {}) {
  const publish = typeof payload.publish === 'function' ? payload.publish : () => {}
  const verdict = await verifyDeterminism(payload?.config ?? payload, payload)
  publish(verdict)

  return verdict
}
