import { placeOrder } from '../venues/okx/rest.js'
import { ingestOrderEvent } from './lifecycle.js'
import { hasKeys } from '../venues/vault.js'
import { createLogger } from '../utils/log.js'

const log = createLogger('order')

/**
 * Getting an order to the venue.
 *
 * Separated from the submit action so the fast path stays synchronous: the action paints
 * the optimistic row and returns, and this is what happens afterwards, off the click.
 *
 * Errors resolve rather than throw. A rejected order is normal operating data on a
 * scalping desk — insufficient balance, a price through a band, a stale limit — and each
 * one belongs on the order row as a reason the trader can read, not in a console nobody
 * has open.
 */

/**
 * Turn a venue error into an order event the reducer understands.
 *
 * @param {string} clOrdId - the client order id.
 * @param {object} error - the venue error.
 * @param {number} ts - when it happened.
 * @returns {object} a reducer event.
 */
export function rejectionEvent(clOrdId, error, ts) {
  return {
    clOrdId: String(clOrdId ?? ''),
    state: 'rejected',
    ts: Number(ts) || 0,
    reason: String(error?.msg ?? error?.message ?? error?.code ?? 'rejected'),
  }
}

/**
 * Turn a venue acknowledgement into an order event.
 *
 * @param {string} clOrdId - the client order id.
 * @param {object} order - the venue's order record.
 * @param {number} ts - when it happened.
 * @returns {object} a reducer event.
 */
export function acceptEvent(clOrdId, order, ts) {
  return {
    clOrdId: String(order?.clientId || clOrdId || ''),
    // An accepted order is *live*, not filled. Treating an ack as a fill is how a desk
    // ends up double-sizing the next trade.
    state: String(order?.state ?? 'live') === 'filled' ? 'filled' : 'live',
    filled: Number(order?.filled) || 0,
    avgPx: Number(order?.avgPx) || 0,
    ts: Number(ts) || 0,
  }
}

/**
 * Send an order and fold the outcome back into the order list.
 *
 * @param {object} payload - the venue payload from `buildOrderPayload`.
 * @param {{place?: Function, now?: () => number}} [deps] - injectable venue call.
 * @returns {Promise<object>} the event that was ingested.
 */
export async function sendOrder(payload, deps = {}) {
  const { place = placeOrder, now = () => Date.now() } = deps
  const clOrdId = String(payload?.clOrdId ?? '')

  if (!hasKeys('okx')) {
    // Not an error worth a stack trace: the desk shows public data without keys by
    // design, so this is the expected state until they are entered. The order still gets
    // a rejected row, because a click that produced nothing at all is indistinguishable
    // from a click that did not register.
    ingestOrderEvent(rejectionEvent(clOrdId, { msg: 'no credentials' }, now()))
    return { ok: false, reason: 'no credentials' }
  }

  const result = await place({
    symbol: payload?.instId,
    tdMode: payload?.tdMode,
    side: payload?.side,
    type: payload?.ordType,
    px: payload?.px,
    sz: payload?.sz,
    clientId: clOrdId,
  }).catch((error) => ({ ok: false, error }))

  const at = now()
  if (!result?.ok) {
    log.warn(`order rejected: ${result?.error?.msg ?? result?.error?.message ?? 'unknown'}`)
    ingestOrderEvent(rejectionEvent(clOrdId, result?.error, at))
    return { ok: false, reason: 'rejected' }
  }

  ingestOrderEvent(acceptEvent(clOrdId, result.order, at))
  return { ok: true, order: result.order }
}
