import { setValue, appState } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { coerceParams, paramsFor, publishParamForm } from './params.js'

/**
 * Tuned preset packs.
 *
 * Eight strategies with five or six params each is forty numbers, and a trader who has to
 * pick all of them before their first trade will pick none of them and use the defaults
 * forever. A pack is one decision instead of forty.
 *
 * The three names mean the same thing across every strategy, which is the only reason
 * having three is useful:
 *
 * - **conservative** — fires less, waits for more confirmation, stops out sooner. Fewer
 *   trades, higher hit rate, and it will sit out moves that paid.
 * - **standard** — the strategy as designed.
 * - **aggressive** — fires more, on thinner evidence, and holds longer. More trades, lower
 *   hit rate, bigger tails in both directions.
 *
 * Presets are **applied through the same coercion as any manual edit**. A pack authored
 * against an older schema is exactly as untrusted as a value typed into a box, and letting
 * one bypass the clamp would be the one path by which an out-of-range param reaches a
 * strategy.
 */

/** The preset names every strategy speaks. */
export const PRESET_NAMES = Object.freeze(['conservative', 'standard', 'aggressive'])

/**
 * The packs, by strategy id.
 *
 * Values are tuned for **one-second scalping**, not for the daily-bar settings these
 * indicators are usually quoted with — a 14-period RSI on daily bars and on one-second
 * buckets are different instruments entirely.
 */
export const PRESETS = Object.freeze({
  'momentum-burst': Object.freeze({
    // Slower window, higher bar, quicker exit: fewer bursts, and only the obvious ones.
    conservative: Object.freeze({ windowMs: 2000, multiple: 4.5, timeStopMs: 5000, alpha: 0.03 }),
    standard: Object.freeze({ windowMs: 1000, multiple: 3, timeStopMs: 8000, alpha: 0.05 }),
    // A short window makes the velocity reading twitchier, which is the point.
    aggressive: Object.freeze({ windowMs: 500, multiple: 2, timeStopMs: 12000, alpha: 0.1 }),
  }),
  'vwap-revert': Object.freeze({
    // Wider band, tighter stop: only the genuinely stretched, and cut fast when wrong.
    conservative: Object.freeze({ sigmaK: 3, stopSigma: 3.5, window: 200 }),
    standard: Object.freeze({ sigmaK: 2, stopSigma: 4, window: 100 }),
    aggressive: Object.freeze({ sigmaK: 1.5, stopSigma: 6, window: 60 }),
  }),
  'spread-capture': Object.freeze({
    // A wider minimum and a bigger requote tolerance means fewer, better-paid quotes.
    conservative: Object.freeze({ offsetTicks: 1, minTicks: 4, toleranceTicks: 2, skewTicks: 4 }),
    standard: Object.freeze({ offsetTicks: 0, minTicks: 2, toleranceTicks: 1, skewTicks: 2 }),
    // At the touch with a one-tick floor: maximum fills, maximum inventory risk.
    aggressive: Object.freeze({ offsetTicks: 0, minTicks: 1, toleranceTicks: 1, skewTicks: 1 }),
  }),
  'book-imbalance': Object.freeze({
    conservative: Object.freeze({ levels: 10, threshold: 0.5, persistM: 6, targetTicks: 5 }),
    standard: Object.freeze({ levels: 5, threshold: 0.3, persistM: 3, targetTicks: 3 }),
    aggressive: Object.freeze({ levels: 3, threshold: 0.2, persistM: 2, targetTicks: 2 }),
  }),
  'tape-pressure': Object.freeze({
    conservative: Object.freeze({ windowMs: 20000, threshold: 0.25, minPrints: 50, timeStopMs: 15000 }),
    standard: Object.freeze({ windowMs: 10000, threshold: 0.15, minPrints: 20, timeStopMs: 20000 }),
    aggressive: Object.freeze({ windowMs: 5000, threshold: 0.1, minPrints: 10, timeStopMs: 30000 }),
  }),
  'range-fade': Object.freeze({
    // A wider swing width finds fewer, better-tested levels.
    conservative: Object.freeze({ fractal: 5, mergeTicks: 3, rejectTicks: 1, breakTicks: 2 }),
    standard: Object.freeze({ fractal: 3, mergeTicks: 2, rejectTicks: 2, breakTicks: 3 }),
    aggressive: Object.freeze({ fractal: 2, mergeTicks: 1, rejectTicks: 3, breakTicks: 5 }),
  }),
  'open-drive': Object.freeze({
    // A longer box and a bigger buffer: only a decisive break counts.
    conservative: Object.freeze({ rangeMs: 600000, bufferTicks: 5, trailTicks: 6, maxEntries: 1 }),
    standard: Object.freeze({ rangeMs: 300000, bufferTicks: 2, trailTicks: 10, maxEntries: 1 }),
    aggressive: Object.freeze({ rangeMs: 120000, bufferTicks: 1, trailTicks: 20, maxEntries: 2 }),
  }),
  'vol-squeeze': Object.freeze({
    conservative: Object.freeze({ lookback: 120, pctThreshold: 0.1, k: 4, targetTicks: 15 }),
    standard: Object.freeze({ lookback: 60, pctThreshold: 0.2, k: 3, targetTicks: 10 }),
    aggressive: Object.freeze({ lookback: 30, pctThreshold: 0.35, k: 2, targetTicks: 8 }),
  }),
})

/**
 * Check a preset against a strategy's schema.
 *
 * @param {object} preset - the pack.
 * @param {object} schema - the strategy's params schema.
 * @returns {{ok: boolean, unknown: string[], clamped: string[]}} the verdict.
 */
export function validatePreset(preset, schema) {
  if (!preset || typeof preset !== 'object') return { ok: false, unknown: [], clamped: [] }

  const spec = schema ?? {}
  const unknown = []
  const clamped = []

  for (const [key, value] of Object.entries(preset)) {
    // A key the strategy does not have is a pack written against a different version, and
    // silently ignoring it would leave the trader thinking they had tuned something.
    if (!spec[key]) {
      unknown.push(key)
      continue
    }

    const coerced = coerceParams({ [key]: spec[key] }, { [key]: value })[key]
    if (coerced !== value) clamped.push(key)
  }

  return { ok: unknown.length === 0, unknown, clamped }
}

/**
 * The pack for a strategy and name.
 *
 * @param {string} strategyId - the strategy.
 * @param {string} name - the preset name.
 * @returns {object|null} the pack.
 */
export function presetFor(strategyId, name) {
  const packs = PRESETS[String(strategyId ?? '')]
  return packs?.[String(name ?? '')] ?? null
}

/**
 * Apply a preset to a strategy.
 *
 * @param {object} strategy - the strategy descriptor.
 * @param {string} name - the preset name, or a custom pack's name.
 * @returns {object|null} the params now in force.
 */
export function applyPreset(strategy, name) {
  const id = String(strategy?.id ?? '')
  const packName = String(name ?? '')
  if (!id) return null

  const pack = presetFor(id, packName) ?? customPresets()[id]?.[packName]
  if (!pack) return null

  // Merged onto the current values rather than replacing them, so a pack that tunes four of
  // six params leaves the other two alone instead of silently resetting them — and run
  // through the same coercion as a hand edit, because a pack authored against an older
  // schema is exactly as untrusted as a typed value.
  const next = coerceParams(strategy.params, { ...paramsFor(strategy), ...pack })
  publishParamForm(strategy, next)
  setValue(PATHS.settings.activePresets, {
    ...(appState.settings?.activePresets ?? {}),
    [id]: packName,
  })

  return next
}

/**
 * The trader's own saved packs.
 *
 * @param {object} [state] - the settings slice.
 * @returns {object} strategy id → name → pack.
 */
export function customPresets(state = appState?.settings) {
  return state?.customPresets ?? {}
}

/**
 * Save the current tuning as a named pack.
 *
 * @param {object} strategy - the strategy descriptor.
 * @param {string} name - what to call it.
 * @param {object} [values] - the values; defaults to what is in force.
 * @returns {object|null} the saved pack.
 */
export function savePreset(strategy, name, values) {
  const id = String(strategy?.id ?? '')
  const packName = String(name ?? '').trim()
  // A built-in name would shadow the pack it is named after, and the trader would have no
  // way back to the original.
  if (!id || !packName || PRESET_NAMES.includes(packName)) return null

  const pack = coerceParams(strategy.params, values ?? paramsFor(strategy))
  const saved = customPresets()

  setValue(PATHS.settings.customPresets, {
    ...saved,
    [id]: { ...(saved[id] ?? {}), [packName]: pack },
  })

  return pack
}

/**
 * Has the trader drifted from the pack they picked?
 *
 * @param {object} strategy - the strategy descriptor.
 * @param {string} name - the active preset name.
 * @returns {boolean} true when the live params differ.
 */
export function presetDirty(strategy, name) {
  const pack = presetFor(strategy?.id, name) ?? customPresets()[String(strategy?.id ?? '')]?.[name]
  if (!pack) return false

  const live = paramsFor(strategy)
  const wanted = coerceParams(strategy.params, { ...live, ...pack })

  // Compared key by key against the coerced pack, so a value the schema would have clamped
  // anyway does not read as drift the trader cannot resolve.
  return Object.keys(pack).some((key) => live[key] !== wanted[key])
}

/**
 * The picker rows for a strategy.
 *
 * @param {string} strategyId - the strategy.
 * @returns {string[]} every pack name available to it.
 */
export function presetNames(strategyId) {
  const id = String(strategyId ?? '')
  const built = Object.keys(PRESETS[id] ?? {})
  const custom = Object.keys(customPresets()[id] ?? {})

  return [...built, ...custom.filter((name) => !built.includes(name))]
}
