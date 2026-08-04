import { setValue, appState } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { registerAction } from '../actions/registry.js'
import { ACTIONS } from '../actions/names.js'
import { cancelOrder } from '../venues/okx/rest.js'
import { ingestOrderEvents, isTerminal } from './lifecycle.js'
import { makeClientOrderId } from './submit.js'
import { pushToast } from '../ui/toast.js'

/**
 * Cancel-all and repeat-last.
 *
 * The two things a scalper reaches for when there is no time to think: get me out of
 * everything, and do that again.
 *
 * Cancel-all stays enabled while the desk is disarmed. Arming gates *entering* risk;
 * leaving it must never be gated by anything, and a trader who disarmed in a panic must
 * not then find the exit greyed out.
 */

/**
 * The working orders a cancel-all would target.
 *
 * @param {object[]} orders - the desk's order list.
 * @returns {object[]} orders that are still live.
 */
export function workingOrders(orders) {
  return (Array.isArray(orders) ? orders : []).filter(
    (order) => order?.clOrdId && !isTerminal(order),
  )
}

/**
 * A one-line summary of an order, for the repeat button's label.
 *
 * @param {object} order - the order payload.
 * @returns {string} the summary, empty when there is nothing to repeat.
 */
export function orderSummary(order) {
  if (!order?.instId) return ''

  const side = String(order.side ?? 'buy').toUpperCase()
  const price = order.px ? ` @ ${order.px}` : ' @ mkt'

  return `${side} ${order.sz ?? ''} ${order.instId}${price}`
}

/**
 * Cancel every working order.
 *
 * @param {{cancel?: Function, now?: () => number}} [deps] - injectable venue call.
 * @returns {Promise<{cancelled: number, failed: number}>} what happened.
 */
export async function cancelAll(deps = {}) {
  const { cancel = cancelOrder, now = () => Date.now() } = deps
  const working = workingOrders(appState.trade?.orders)
  // Nothing to cancel is a no-op, not a venue round trip — the button is always
  // enabled, so it gets pressed when the desk is already flat.
  if (working.length === 0) return { cancelled: 0, failed: 0 }

  const events = []
  let failed = 0

  for (const order of working) {
    const result = await cancel({ symbol: order.instId, clientId: order.clOrdId }).catch(
      (error) => ({ ok: false, error }),
    )

    if (result?.ok) events.push({ clOrdId: order.clOrdId, state: 'cancelled', ts: now() })
    else failed += 1
  }

  // One write for the whole batch: state lands on the next tick, so ingesting inside the
  // loop would have each iteration overwrite the last one's cancellation.
  if (events.length) ingestOrderEvents(events, { now: now() })
  const cancelled = events.length

  pushToast(
    failed ? `cancelled ${cancelled}, ${failed} failed` : `cancelled ${cancelled}`,
    failed ? 'warn' : 'info',
    now(),
  )
  return { cancelled, failed }
}

/**
 * Rebuild the last order with a fresh id.
 *
 * @param {object} last - the stored payload.
 * @param {number} now - epoch milliseconds.
 * @returns {object|null} a sendable payload, or null when there is nothing to repeat.
 */
export function repeatPayload(last, now) {
  if (!last?.instId || !last?.sz) return null

  // A fresh client id, always: reusing the last one would be rejected as a duplicate by
  // the venue, and worse, could be matched to the wrong fill in the order list.
  return { ...last, clOrdId: makeClientOrderId(now), seq: undefined, queuedAt: undefined }
}

/**
 * Register the shortcut actions.
 *
 * @param {{send?: Function, cancel?: Function, now?: () => number}} [deps] - injectable
 *   venue calls.
 * @returns {string[]} the registered action names.
 */
export function registerShortcutActions(deps = {}) {
  const { send = null, cancel, now = () => Date.now() } = deps

  registerAction(ACTIONS.orders.cancelAll, () => {
    // Fire and forget: the exit must return instantly, and each cancellation lands on
    // its own row as the venue confirms it.
    cancelAll({ cancel, now })
    return true
  })

  registerAction(ACTIONS.ticket.repeatLast, () => {
    const payload = repeatPayload(appState.trade?.lastOrder, now())
    if (!payload) return false

    send?.(payload)
    return true
  })

  return [ACTIONS.orders.cancelAll, ACTIONS.ticket.repeatLast]
}

/**
 * Remember an order so it can be repeated.
 *
 * @param {object} payload - the payload that was sent.
 * @returns {object|null} what was stored.
 */
export function rememberOrder(payload) {
  if (!payload?.instId) return null

  const stored = { ...payload }
  setValue(PATHS.trade.lastOrder, stored)
  setValue(PATHS.trade.lastOrderSummary, orderSummary(stored))

  return stored
}
