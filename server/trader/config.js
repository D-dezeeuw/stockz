import process from 'node:process'

/**
 * What the server-side trader is, and whether it runs at all.
 *
 * The desk began as a static page, so the browser tab *was* the desk: the strategies, the
 * gates and the order path all lived in one animation frame. That made sense on GitHub
 * Pages and stopped making sense the day this became one account on one dedicated host —
 * a hyper-scalping desk that pauses whenever its owner locks their phone is not a desk, it
 * is a screensaver. Browsers throttle `requestAnimationFrame` to zero in a background tab,
 * so the old arrangement did not merely slow down out of focus; it stopped.
 *
 * So the loop moves here and the browser becomes what it should always have been on a
 * server-hosted desk: a window onto it.
 *
 * **Off unless switched on, and on paper unless told otherwise.** Two separate env vars,
 * because they are two separate decisions — "run the loop" and "let the loop spend money".
 * A single flag would make the second one an accident of the first.
 */

/** Instruments to trade when nothing is configured — the deepest book on the venue. */
export const DEFAULT_SYMBOLS = Object.freeze(['BTC-USDT'])

/** Fallback clip, deliberately tiny: a misconfigured size should cost lunch, not rent. */
export const DEFAULT_SIZE = 0.001

/** Orders per minute across all instruments, matching the browser desk's own ceiling. */
export const DEFAULT_MAX_PER_MIN = 120

/** Max absolute position per instrument, in base units. */
export const DEFAULT_MAX_PER_INSTRUMENT = 0.01

/**
 * Read a positive number from the environment, or fall back.
 *
 * @param {string|undefined} raw - the env value.
 * @param {number} fallback - what to use when it is absent or unusable.
 * @returns {number} the value in force.
 */
export function positiveNumber(raw, fallback) {
  const value = Number(raw)
  // Not `|| fallback`: a configured 0 is a real instruction ("no exposure") for a cap, and
  // silently replacing it with a default is how a limit somebody set stops applying.
  return Number.isFinite(value) && value >= 0 ? value : fallback
}

/**
 * Parse the instrument list.
 *
 * @param {string|undefined} raw - comma-separated symbols.
 * @returns {string[]} upper-cased instrument ids, defaulted when empty.
 */
export function parseSymbols(raw) {
  const listed = String(raw ?? '')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)

  return listed.length > 0 ? listed : [...DEFAULT_SYMBOLS]
}

/**
 * The trader's configuration, from the same .env that holds the keys.
 *
 * @param {object} [env] - the environment bag.
 * @returns {object} the frozen config.
 */
export function traderConfig(env = process.env) {
  const keys = {
    apiKey: env.STOCKZ_OKX_API_KEY ?? '',
    secretKey: env.STOCKZ_OKX_SECRET_KEY ?? '',
    passphrase: env.STOCKZ_OKX_PASSPHRASE ?? '',
  }

  return Object.freeze({
    // Explicit opt-in. An owner who pulls a new image must not find a trading loop
    // running because a default changed under them.
    enabled: String(env.STOCKZ_TRADER ?? '').toLowerCase() === 'on',
    // 'live' sends signed orders to the venue; anything else simulates against the live
    // book. Defaulting to paper is the whole safety story of this file: the loop is worth
    // watching for a session before it is worth funding.
    live: String(env.STOCKZ_TRADER_MODE ?? 'paper').toLowerCase() === 'live',
    symbols: parseSymbols(env.STOCKZ_TRADER_SYMBOLS),
    size: positiveNumber(env.STOCKZ_TRADER_SIZE, DEFAULT_SIZE),
    maxPerMin: positiveNumber(env.STOCKZ_TRADER_MAX_PER_MIN, DEFAULT_MAX_PER_MIN),
    maxPerInstrument: positiveNumber(
      env.STOCKZ_TRADER_MAX_PER_INSTRUMENT,
      DEFAULT_MAX_PER_INSTRUMENT,
    ),
    // The venue axes, shared with the browser desk's two checkboxes. Defaults match the
    // desk's: EU platform, live environment — the owner's actual account.
    eea: String(env.STOCKZ_OKX_EEA ?? 'true').toLowerCase() !== 'false',
    demo: String(env.STOCKZ_OKX_DEMO ?? '').toLowerCase() === 'true',
    keys: Object.freeze(keys),
    hasKeys: Boolean(keys.apiKey && keys.secretKey && keys.passphrase),
  })
}
