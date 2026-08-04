import { appState, setValue } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { defineStrategy } from './contract.js'
import { DIR, isExpired, normalizeSignal } from './signal.js'

/**
 * Many opinions, one position.
 *
 * Running four strategies on one instrument does not give a trader four edges — it gives
 * them four buttons and a decision to make in the half second they do not have. The
 * composite makes that decision the same way every time: a weighted sum of direction ×
 * conviction, with a dead zone in the middle.
 *
 * The dead zone is the whole point. Without it a blend that lands at 0.02 one tick and
 * -0.02 the next produces a long, then a short, then a long, off noise — which costs two
 * spreads and a fee each time and is how a "consensus" system loses money faster than any
 * of its members would alone.
 *
 * **Expired members do not vote.** A strategy that has gone quiet is not abstaining in
 * favour of the others; its last opinion simply is not evidence any more, and counting it
 * would let a stalled strategy carry the blend.
 */

/** Below this the composite stays flat. */
export const DEFAULT_DEAD_ZONE = 0.2

/**
 * Scale a weight map so it sums to one.
 *
 * @param {object} weights - member key → weight.
 * @returns {object} the normalised weights.
 */
export function normalizeWeights(weights) {
  const entries = Object.entries(weights ?? {}).map(([key, value]) => [
    key,
    Math.max(0, Number(value) || 0),
  ])
  if (entries.length === 0) return {}

  const total = entries.reduce((sum, [, value]) => sum + value, 0)
  // All-zero is "no preference", not "nobody votes" — an equal split is the only reading
  // that leaves the blend usable while the trader is still dragging sliders.
  if (total <= 0) {
    const share = Number((1 / entries.length).toFixed(6))
    return Object.fromEntries(entries.map(([key]) => [key, share]))
  }

  return Object.fromEntries(entries.map(([key, value]) => [key, Number((value / total).toFixed(6))]))
}

/**
 * Blend member signals into one score.
 *
 * @param {object} signals - member key → signal.
 * @param {object} weights - member key → weight.
 * @param {number} now - the current time.
 * @returns {{score: number, voters: number, contributors: string[]}} the blend.
 */
export function composeSignals(signals, weights, now) {
  const normalized = normalizeWeights(weights)
  let score = 0
  const contributors = []

  for (const [key, weight] of Object.entries(normalized)) {
    const signal = signals?.[key]
    if (!signal) continue
    // A strategy that has gone quiet is not abstaining in favour of the others — its last
    // opinion is simply not evidence any more.
    if (isExpired(signal, now)) continue

    const dir = Number(signal.dir) || DIR.FLAT
    const strength = Number(signal.strength) || 0
    if (dir === DIR.FLAT || strength <= 0) continue

    score += dir * strength * weight
    contributors.push(key)
  }

  return { score: Number(score.toFixed(6)), voters: contributors.length, contributors }
}

/**
 * Turn a blended score into a direction.
 *
 * @param {number} score - the composite score.
 * @param {number} [deadZone] - the band that reads as no consensus.
 * @returns {number} 1, -1 or 0.
 */
export function voteThreshold(score, deadZone = DEFAULT_DEAD_ZONE) {
  const value = Number(score)
  const band = Number.isFinite(Number(deadZone)) ? Math.abs(Number(deadZone)) : DEFAULT_DEAD_ZONE
  if (!Number.isFinite(value)) return DIR.FLAT

  // A blend landing at 0.02 one tick and -0.02 the next would otherwise flip long, short,
  // long off noise — two spreads and a fee each time.
  if (value > band) return DIR.LONG
  return value < -band ? DIR.SHORT : DIR.FLAT
}

/**
 * How long the blend is good for.
 *
 * @param {object} signals - member key → signal.
 * @param {string[]} contributors - the members that voted.
 * @param {number} now - the current time.
 * @returns {number} the ttl in ms.
 */
export function compositeTtl(signals, contributors, now) {
  const keys = Array.isArray(contributors) ? contributors : []
  let shortest = Infinity

  for (const key of keys) {
    const signal = signals?.[key]
    const ttl = Number(signal?.ttl)
    // A member with no expiry does not extend the blend's life; it simply does not shorten
    // it either.
    if (!Number.isFinite(ttl) || ttl <= 0) continue

    const remaining = Number(signal.ts) + ttl - Number(now)
    if (remaining < shortest) shortest = remaining
  }

  // The blend expires when its shakiest member does: a consensus is only as current as the
  // oldest opinion inside it.
  return Number.isFinite(shortest) ? Math.max(0, Math.round(shortest)) : 0
}

/**
 * The weights currently in force.
 *
 * @param {object} [state] - the settings slice.
 * @returns {object} member key → weight.
 */
export function compositeWeights(state = appState?.settings) {
  return normalizeWeights(state?.strategyParams?.composite?.weights ?? {})
}

/**
 * Store a member's weight and republish the editor.
 *
 * @param {string} member - the member run key.
 * @param {number} weight - the raw weight.
 * @returns {object} the normalised weights.
 */
export function setWeight(member, weight) {
  const key = String(member ?? '')
  if (!key) return compositeWeights()

  // Stored **raw** and normalised only on read. Storing the normalised value would destroy
  // the ratio the trader typed: drag one slider to 75 and the rest are rewritten, so the
  // next drag renormalises against numbers nobody chose and the sliders fight the hand.
  const raw = { ...(appState.settings?.strategyParams?.composite?.weights ?? {}) }
  raw[key] = Math.max(0, Number(weight) || 0)

  setValue(PATHS.settings.strategyParams, {
    ...(appState.settings?.strategyParams ?? {}),
    composite: { ...(appState.settings?.strategyParams?.composite ?? {}), weights: raw },
  })

  return normalizeWeights(raw)
}

/**
 * Publish the weights editor.
 *
 * @param {object[]} members - the runs that can be blended.
 * @param {object} [weights] - the normalised weights; defaults to what is stored.
 * @returns {object[]} the editor rows.
 */
export function publishWeights(members, weights = compositeWeights()) {
  // The blend never votes on itself: a composite whose own last signal fed back into the
  // next one would ratchet, agreeing with itself more strongly every tick.
  const rows = (Array.isArray(members) ? members : [])
    .filter((run) => String(run?.strategyId ?? '') !== 'composite')
    .map((run) => ({
      key: String(run?.key ?? ''),
      name: String(run?.name ?? run?.strategyId ?? ''),
      instrument: String(run?.instrument ?? ''),
      weight: Number(weights?.[String(run?.key ?? '')] ?? 0),
      // Precomputed for the slider's fill, so the template does no arithmetic.
      pct: Math.round(Number(weights?.[String(run?.key ?? '')] ?? 0) * 100),
    }))

  setValue(PATHS.ui.compositeWeights, rows)
  return rows
}

/**
 * Blend the live runs and publish the result as a signal of its own.
 *
 * @param {{now?: number}} [options] - the blend.
 * @returns {object} the composite signal.
 */
export function refreshComposite(options = {}) {
  const now = Number(options.now) || 0
  const signals = appState.strategy?.signals ?? {}
  const weights = compositeWeights()

  const blend = composeSignals(signals, weights, now)
  const dead = Number(appState.settings?.strategyParams?.composite?.deadZone)
  const dir = voteThreshold(blend.score, Number.isFinite(dead) ? dead : DEFAULT_DEAD_ZONE)

  const signal = normalizeSignal(
    {
      action: dir === DIR.LONG ? 'buy' : dir === DIR.SHORT ? 'sell' : 'flat',
      strength: Math.min(1, Math.abs(blend.score)),
      reason: `${blend.voters} of ${Object.keys(weights).length} agree (${blend.score})`,
      ttl: compositeTtl(signals, blend.contributors, now),
    },
    { now, source: 'composite' },
  )

  // Returned, not published: the composite runs as an ordinary strategy, so the registry
  // publishes its return exactly as it does for every member. Publishing here as well
  // would be a second write path to the same key.
  return signal
}

/**
 * The composite as a strategy like any other.
 *
 * Registered through `defineStrategy` rather than special-cased, so the runs list, the
 * quarantine, the tick budget and the history all treat it exactly like a member. A blend
 * that needed its own plumbing everywhere would be a blend nobody could debug.
 */
export const compositeStrategy = defineStrategy({
  id: 'composite',
  name: 'Weighted vote',
  params: {
    deadZone: {
      kind: 'number',
      label: 'dead zone',
      default: DEFAULT_DEAD_ZONE,
      min: 0,
      max: 1,
      step: 0.05,
    },
  },
  init: () => ({ blended: 0 }),
  onTick: (ctx, tick) => refreshComposite({ now: Number(tick?.ts) || ctx.now }),
  onCandle: () => null,
})
