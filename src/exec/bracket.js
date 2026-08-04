import { makeIntent } from './types.js'
import { capabilityFor } from './capabilities.js'
import { roundToTick } from '../utils/math.js'

/**
 * Brackets: entry, take-profit and stop, as one gesture.
 *
 * A scalp is three decisions made at once — where to get in, where to be right, where to
 * be wrong — and the last two are exactly the ones that get skipped when the market is
 * moving. Expressing all three in a single action is what makes the stop actually exist.
 *
 * The legs are *linked*, not merely simultaneous. When one exit fills, the other must
 * die; a take-profit that fills while its stop stays live leaves the trader short a
 * position they closed, which is the worst outcome the desk could produce.
 */

/**
 * Absolute prices for tick offsets, correct for the side being entered.
 *
 * @param {number} entry - the entry price.
 * @param {{tpTicks?: number, slTicks?: number, tickSize?: number, side?: string}} spec -
 *   the offsets.
 * @returns {{tp: number, sl: number}} the exit prices.
 */
export function offsetsFromTicks(entry, spec = {}) {
  const price = Number(entry)
  const tick = Number(spec.tickSize) || 0
  if (!Number.isFinite(price) || price <= 0 || tick <= 0) return { tp: 0, sl: 0 }

  const long = String(spec.side ?? 'buy').toLowerCase() !== 'sell'
  const tp = Number(spec.tpTicks) || 0
  const sl = Number(spec.slTicks) || 0

  // Direction is the whole subtlety: a long takes profit above and stops below, a short
  // does the exact opposite, and getting it backwards builds a bracket that closes the
  // trade immediately at a loss.
  return {
    tp: tp > 0 ? roundToTick(long ? price + tp * tick : price - tp * tick, tick) : 0,
    sl: sl > 0 ? roundToTick(long ? price - sl * tick : price + sl * tick, tick) : 0,
  }
}

/**
 * Expand one intent into an entry and its linked exits.
 *
 * @param {object} input - the entry order request.
 * @param {{tpTicks?: number, slTicks?: number, tickSize?: number,
 *   bracketId?: string}} spec - the bracket shape.
 * @returns {{ok: boolean, bracket: object|null, reason: string}} the expansion.
 */
export function makeBracket(input, spec = {}) {
  const entry = makeIntent(input)
  if (!entry.ok) return { ok: false, bracket: null, reason: entry.reason }

  const reference = entry.intent.type === 'limit' ? entry.intent.price : Number(input?.reference)
  if (!Number.isFinite(reference) || reference <= 0) {
    // A market entry has no price yet, so the exits cannot be priced either. The caller
    // must say what to bracket around rather than have one invented.
    return { ok: false, bracket: null, reason: 'no reference price' }
  }

  const { tp, sl } = offsetsFromTicks(reference, { ...spec, side: entry.intent.side })
  if (!tp && !sl) return { ok: false, bracket: null, reason: 'no exits' }

  const exitSide = entry.intent.side === 'buy' ? 'sell' : 'buy'
  const bracketId = String(spec.bracketId ?? `br-${entry.intent.instrument}-${reference}`)
  const leg = (price, kind) =>
    makeIntent({
      ...input,
      side: exitSide,
      price,
      type: 'limit',
      reduceOnly: true,
      clientId: `${bracketId}-${kind}`,
    }).intent

  return {
    ok: true,
    reason: '',
    bracket: {
      id: bracketId,
      entry: { ...entry.intent, bracketId },
      // Exits are reduce-only by construction: a bracket leg must never be able to open
      // a *new* position in the other direction if it fires without its parent.
      tp: tp ? { ...leg(tp, 'tp'), bracketId, kind: 'tp' } : null,
      sl: sl ? { ...leg(sl, 'sl'), bracketId, kind: 'sl' } : null,
    },
  }
}

/**
 * How a venue should run a bracket.
 *
 * @param {object} bracket - the expanded bracket.
 * @param {string} venue - the venue.
 * @returns {{native: boolean, emulated: boolean, legs: object[]}} the plan.
 */
export function bracketPlan(bracket, venue) {
  const caps = capabilityFor(venue, bracket?.entry?.instrument)
  const legs = [bracket?.tp, bracket?.sl].filter(Boolean)

  if (!caps.brackets?.supported) return { native: false, emulated: false, legs: [] }

  // Native brackets ride along with the entry as attached orders; emulated ones are real
  // orders the engine must place after the entry fills and cancel when one of them does.
  return { native: !caps.brackets.emulated, emulated: caps.brackets.emulated === true, legs }
}

/**
 * The sibling to cancel when a bracket leg fills.
 *
 * @param {object} bracket - the bracket.
 * @param {string} filledKind - 'tp' or 'sl'.
 * @returns {object|null} the leg that must now be cancelled.
 */
export function oppositeLeg(bracket, filledKind) {
  const kind = String(filledKind ?? '')
  // This is the OCO half of the bracket, and the reason it cannot be left to the trader:
  // a take-profit that fills while its stop stays live leaves them short a position they
  // already closed.
  if (kind === 'tp') return bracket?.sl ?? null
  if (kind === 'sl') return bracket?.tp ?? null

  return null
}
