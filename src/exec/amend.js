import { capabilityFor } from './capabilities.js'

/**
 * Amending a working order.
 *
 * Cancel-and-retype is the obvious way and the wrong one: it loses queue position, and
 * on a maker order the queue *is* the edge. Where the venue can move an order in place,
 * moving it in place is worth real money; where it cannot, the desk emulates the
 * semantics and says which it did.
 *
 * The inflight lock matters more than it looks. Two amends racing produce a venue state
 * nobody predicted — the second may land before the first, leaving the order at a price
 * the trader has already moved away from.
 */

/** orderId -> {inflight, queued}. */
const locks = new Map()

/**
 * Whether an amend actually changes anything.
 *
 * @param {object} order - the working order.
 * @param {{price?: number, size?: number}} request - the requested change.
 * @returns {{changed: boolean, price: number, size: number}} the effective change.
 */
export function amendDiff(order, request = {}) {
  const price = Number(request.price)
  const size = Number(request.size)

  const nextPrice = Number.isFinite(price) && price > 0 ? price : Number(order?.price) || 0
  const nextSize = Number.isFinite(size) && size > 0 ? size : Number(order?.size) || 0

  // A no-op amend is a wasted round trip and, on some venues, a wasted rate-limit token.
  const changed = nextPrice !== (Number(order?.price) || 0) || nextSize !== (Number(order?.size) || 0)

  return { changed, price: nextPrice, size: nextSize }
}

/**
 * How a venue must run an amend.
 *
 * @param {object} order - the working order.
 * @returns {{method: string, keepsQueue: boolean}} the route.
 */
export function amendRoute(order) {
  const caps = capabilityFor(order?.venue, order?.instrument)

  // Queue position is the whole reason to care which route is taken: a cancel/replace
  // goes to the back of the book, and on a maker order that is the edge.
  return caps.amend
    ? { method: 'native', keepsQueue: true }
    : { method: 'cancel-replace', keepsQueue: false }
}

/**
 * Take the inflight lock for an order.
 *
 * @param {string} orderId - the order.
 * @param {object} [request] - the amend to queue if one is already in flight.
 * @returns {{ok: boolean, queued: boolean}} whether to proceed now.
 */
export function takeLock(orderId, request = null) {
  const id = String(orderId ?? '')
  if (!id) return { ok: false, queued: false }

  const lock = locks.get(id)
  if (lock?.inflight) {
    // At most one follow-up is kept: a trader nudging a price six times wants the sixth
    // price, not all six sent in order.
    locks.set(id, { inflight: true, queued: request })
    return { ok: false, queued: true }
  }

  locks.set(id, { inflight: true, queued: null })
  return { ok: true, queued: false }
}

/**
 * Release the lock, returning whatever was queued behind it.
 *
 * @param {string} orderId - the order.
 * @returns {object|null} the queued amend, if any.
 */
export function releaseLock(orderId) {
  const id = String(orderId ?? '')
  const lock = locks.get(id)
  locks.delete(id)

  return lock?.queued ?? null
}

/**
 * Amend a working order.
 *
 * @param {object} order - the working order.
 * @param {{price?: number, size?: number}} request - the change.
 * @param {{amend?: Function, cancel?: Function, submit?: Function}} deps - venue calls.
 * @returns {Promise<{ok: boolean, reason: string, method: string,
 *   order: object|null}>} the outcome.
 */
export async function amendOrder(order, request, deps = {}) {
  const { amend = null, cancel = null, submit = null } = deps
  if (!order?.clientId) return { ok: false, reason: 'no order', method: '', order: null }

  const diff = amendDiff(order, request)
  if (!diff.changed) return { ok: false, reason: 'no change', method: '', order }

  const lock = takeLock(order.clientId, request)
  if (!lock.ok) return { ok: false, reason: 'amend in flight', method: '', order }

  const route = amendRoute(order)
  try {
    if (route.method === 'native') {
      const result = await amend?.({
        clientId: order.clientId,
        instrument: order.instrument,
        price: diff.price,
        size: diff.size,
      })
      if (!result?.ok) return { ok: false, reason: result?.reason ?? 'rejected', method: 'native', order }

      return { ok: true, reason: '', method: 'native', order: { ...order, ...diff } }
    }

    return await cancelReplace(order, diff, { cancel, submit })
  } finally {
    releaseLock(order.clientId)
  }
}

/**
 * Emulate an amend by cancelling and resubmitting.
 *
 * @param {object} order - the working order.
 * @param {{price: number, size: number}} diff - the new values.
 * @param {{cancel?: Function, submit?: Function}} deps - venue calls.
 * @returns {Promise<{ok: boolean, reason: string, method: string, order: object|null}>}
 */
export async function cancelReplace(order, diff, deps = {}) {
  const { cancel = null, submit = null } = deps

  const killed = await cancel?.(order)
  // The replacement only goes out *after* the cancel is acknowledged. Sending both at
  // once risks a moment where the trader holds double the size they asked for.
  if (!killed?.ok) return { ok: false, reason: killed?.reason ?? 'cancel failed', method: 'cancel-replace', order }

  const replacement = {
    ...order,
    ...diff,
    // The lineage is carried so the journal can follow one intent across two venue
    // orders rather than reading them as unrelated.
    clientId: `${order.clientId}-r`,
    replaces: order.clientId,
  }

  const placed = await submit?.(replacement)
  if (!placed?.ok) return { ok: false, reason: placed?.reason ?? 'replace failed', method: 'cancel-replace', order }

  return { ok: true, reason: '', method: 'cancel-replace', order: replacement }
}

/** Forget every lock. */
export function resetAmend() {
  locks.clear()
  return true
}
