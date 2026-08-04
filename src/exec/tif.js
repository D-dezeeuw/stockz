import { TIF, makeIntent } from './types.js'
import { capabilityFor } from './capabilities.js'

/**
 * Time-in-force.
 *
 * The three that matter to a scalper are IOC (take what is there, bin the rest), FOK
 * (all of it or none) and post-only (maker or nothing). Each expresses a different
 * intolerance — of leftovers, of partial size, and of paying the spread — and picking
 * the wrong one costs money in a way that is hard to see afterwards.
 *
 * Where a venue lacks one, the engine can emulate it, but an emulation is never sold as
 * the real thing: emulated IOC is a limit plus a cancel, which is a *slower* guarantee
 * and can leave a fill the venue's own IOC would not have.
 */

/**
 * Apply a time-in-force to an intent.
 *
 * @param {object} intent - the order intent.
 * @param {string} tif - the desired time-in-force.
 * @returns {{ok: boolean, intent: object|null, reason: string}} the new intent.
 */
export function applyTif(intent, tif) {
  if (!intent) return { ok: false, intent: null, reason: 'no intent' }

  const wanted = String(tif ?? '').toLowerCase()
  if (!TIF.includes(wanted)) return { ok: false, intent: null, reason: 'unknown tif' }

  // Post-only is a promise to rest: without a price there is nothing to rest at, and a
  // market order can only ever take.
  if (wanted === 'post_only' && (intent.type !== 'limit' || !(Number(intent.price) > 0))) {
    return { ok: false, intent: null, reason: 'post-only needs a limit price' }
  }

  return { ok: true, intent: { ...intent, tif: wanted }, reason: '' }
}

/**
 * How a venue must run a time-in-force it lacks.
 *
 * @param {string} tif - the desired time-in-force.
 * @param {string} venue - the venue.
 * @param {string} [instrument] - the instrument.
 * @returns {{tif: string, emulated: boolean, cancelAfterMs: number}} the plan.
 */
export function downgradeTif(tif, venue, instrument = '') {
  const wanted = String(tif ?? 'gtc').toLowerCase()
  const caps = capabilityFor(venue, instrument)

  if (caps.tifs.includes(wanted)) return { tif: wanted, emulated: false, cancelAfterMs: 0 }

  // Emulated IOC is a resting limit plus an immediate cancel. It is not the same
  // guarantee — the order is live for the round trip, and can fill in that window — so
  // it is marked emulated wherever it surfaces.
  if (wanted === 'ioc' || wanted === 'fok') {
    return { tif: 'gtc', emulated: true, cancelAfterMs: wanted === 'fok' ? 0 : 250 }
  }

  // Post-only cannot be emulated at all: there is no way to ask a venue to refuse a
  // crossing order after the fact. Falling back silently would pay the taker fee the
  // trader was explicitly avoiding.
  return { tif: 'gtc', emulated: false, cancelAfterMs: 0 }
}

/**
 * Split an IOC acknowledgement into the transitions it implies.
 *
 * @param {{filled?: number, size?: number}} ack - the venue acknowledgement.
 * @returns {string[]} the states to apply, in order.
 */
export function iocTransitions(ack) {
  const filled = Number(ack?.filled) || 0
  const size = Number(ack?.size) || 0

  if (filled <= 0) return ['cancelled']
  if (size > 0 && filled >= size) return ['filled']

  // A partially filled IOC is two events, not one: the fill happened, and then the
  // remainder was killed. Collapsing them to 'cancelled' would lose the fill.
  return ['partial', 'cancelled']
}

/**
 * Build an intent with a time-in-force, ready for a venue.
 *
 * @param {object} input - the order request.
 * @param {string} tif - the desired time-in-force.
 * @returns {{ok: boolean, intent: object|null, reason: string, emulated: boolean}} the result.
 */
export function intentWithTif(input, tif) {
  const built = makeIntent(input)
  if (!built.ok) return { ...built, emulated: false }

  const plan = downgradeTif(tif, built.intent.venue, built.intent.instrument)
  const applied = applyTif(built.intent, plan.tif)
  if (!applied.ok) return { ...applied, emulated: false }

  return {
    ok: true,
    reason: '',
    emulated: plan.emulated,
    intent: { ...applied.intent, cancelAfterMs: plan.cancelAfterMs, emulated: plan.emulated },
  }
}
