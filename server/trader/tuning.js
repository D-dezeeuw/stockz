/**
 * One dial for trades-per-hour.
 *
 * The four shipped strategies were tuned to *disagree with each other*, not to fire often.
 * That is the right default for a set whose whole value is that a momentum burst and a
 * VWAP fade take opposite sides of the same stretch — but it means a quiet book can leave
 * the loop silent for long stretches, which is indistinguishable from a broken loop.
 *
 * So: one number, 0..1. Zero is each strategy exactly as its author shipped it. One is
 * every threshold at its floor below.
 *
 * Each floor is **within** the range that param's own schema declares legal — usually the
 * schema's `min` exactly, so the most aggressive setting is still a tuning the author
 * called valid, and `resolveParams` clamps anything that slips through besides. One floor
 * is deliberately stricter than the schema allows: `tape-pressure.minPrints` bottoms out
 * at 5 rather than the schema's 1, because a buy/sell "pressure" reading taken from a
 * single print is not an aggressive tuning, it is a coin flip with a reason string.
 *
 * Only threshold-shaped params move. Windows, tick sizes and time stops are left alone:
 * they change what a strategy *measures*, not how readily it acts, and scaling them would
 * silently turn one strategy into a different one.
 */

/**
 * Params where lowering the number means acting sooner, with the floor to slide toward.
 *
 * Each floor is the `min` from that strategy's own schema. Kept as a literal map rather
 * than read off the schema at runtime, because "which params are thresholds" is a
 * judgement about meaning that a schema cannot express — `windowMs` also has a `min`.
 */
export const SENSITIVE_PARAMS = Object.freeze({
  'momentum-burst': Object.freeze({
    // How many times the baseline velocity counts as a burst. 3 -> 1.5.
    multiple: 1.5,
  }),
  'vwap-revert': Object.freeze({
    // How far from VWAP before the fade is worth taking. 2σ -> 0.5σ.
    sigmaK: 0.5,
  }),
  'book-imbalance': Object.freeze({
    // How lopsided the book must be. 0.3 -> 0.05.
    threshold: 0.05,
    // How many updates it must stay that way. 3 -> 1.
    persistM: 1,
  }),
  'tape-pressure': Object.freeze({
    // How big a shift in buy/sell pressure counts. 0.15 -> 0.02.
    threshold: 0.02,
    // How much tape is needed before the reading is trusted. 20 prints -> 5.
    minPrints: 5,
    // The dead zone around neutral. 0.05 -> 0.01.
    neutralBand: 0.01,
  }),
})

/**
 * Where a param lands at a given sensitivity.
 *
 * Linear between the author's default and the schema floor. Linear rather than curved on
 * purpose: this is a dial somebody turns while watching a counter, and it should behave
 * the way a dial looks like it behaves.
 *
 * @param {number} base - the strategy's default.
 * @param {number} floor - the schema minimum.
 * @param {number} sensitivity - 0 (as shipped) .. 1 (floor).
 * @returns {number} the tuned value.
 */
export function slide(base, floor, sensitivity) {
  const from = Number(base)
  const to = Number(floor)
  const k = Math.min(1, Math.max(0, Number(sensitivity) || 0))
  if (!Number.isFinite(from) || !Number.isFinite(to)) return from

  return from + (to - from) * k
}

/**
 * The param overrides for one strategy at a given sensitivity.
 *
 * @param {object} strategy - the strategy (for its id and param schema).
 * @param {number} sensitivity - 0..1.
 * @returns {object} overrides to hand `createStrategyContext`; empty at zero.
 */
export function tunedParams(strategy, sensitivity) {
  const k = Math.min(1, Math.max(0, Number(sensitivity) || 0))
  // Zero means "exactly as shipped" — and that must mean *no overrides at all*, not
  // overrides that happen to equal the defaults. A caller comparing the two should see
  // the difference.
  if (k === 0) return {}

  const floors = SENSITIVE_PARAMS[String(strategy?.id ?? '')]
  if (!floors) return {}

  const out = {}
  for (const [key, floor] of Object.entries(floors)) {
    const base = strategy?.params?.[key]?.default
    if (base === undefined) continue

    const value = slide(base, floor, k)
    // Counts stay whole: `persistM: 2.4` updates is not a thing, and the strategies
    // compare it against a counter. Decided by the schema's `step`, not by whether the
    // default happens to be a round number — momentum's `multiple` defaults to 3 and is a
    // scale factor with a step of 0.5, so rounding it would land on 2 instead of 1.5 and
    // quietly refuse the most aggressive setting the author allowed.
    const step = Number(strategy?.params?.[key]?.step)
    const isCount = Number.isFinite(step) && step >= 1
    out[key] = isCount ? Math.max(1, Math.round(value)) : value
  }

  return out
}

/**
 * The conviction floor a given sensitivity implies.
 *
 * The gate chain's own threshold moves with the dial, or the strategies would be made
 * chattier only for `signalGate` to throw the extra signals away — the most confusing
 * possible outcome, because the decision feed would fill with "weak" and look broken.
 *
 * @param {number} sensitivity - 0..1.
 * @param {number} base - the shipped floor.
 * @returns {number} the floor in force, never below 0.1.
 */
export function tunedMinStrength(sensitivity, base = 0.5) {
  // Never zero: a signal with no conviction at all is noise whatever the dial says, and a
  // floor of zero would turn every neutral tick into an order.
  return Math.max(0.1, slide(base, 0.15, sensitivity))
}
