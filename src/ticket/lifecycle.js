import { setValue, appState } from '../app/engine.js'
import { PATHS } from '../state/paths.js'

/**
 * Order lifecycle.
 *
 * An order's status is the one thing on the desk that must never be guessed. A scalper
 * who thinks they are flat when a limit is still live takes the next trade at double
 * size without knowing it — so the transition table is explicit, and a transition that
 * is not in it does not happen.
 *
 * Deliberately *not* throwing on an illegal transition. Venues resend acks, deliver them
 * out of order, and occasionally report a fill before the ack that created the order. An
 * exception on the feed path would take the desk down over a message that is merely
 * redundant; ignoring the transition keeps the last known-good status instead.
 */

/** Terminal states — nothing moves out of these. */
export const TERMINAL = Object.freeze(['filled', 'cancelled', 'rejected'])

/** What each state may become. */
export const TRANSITIONS = Object.freeze({
  pending: Object.freeze(['live', 'partial', 'filled', 'rejected', 'cancelled']),
  live: Object.freeze(['partial', 'filled', 'cancelled', 'rejected']),
  partial: Object.freeze(['partial', 'filled', 'cancelled']),
  filled: Object.freeze([]),
  cancelled: Object.freeze([]),
  rejected: Object.freeze([]),
})

/**
 * Apply an event to an order.
 *
 * @param {object} order - the current order record.
 * @param {{state: string, filled?: number, avgPx?: number, ts?: number,
 *   reason?: string}} event - what the venue reported.
 * @returns {object} the order after the event.
 */
export function orderReducer(order, event) {
  const current = order ?? { state: 'pending', filled: 0 }
  const next = String(event?.state ?? '')
  const allowed = TRANSITIONS[current.state] ?? []

  // Out-of-order and duplicate acks are routine; keeping the last known-good status
  // beats crashing the feed over a message that adds nothing.
  if (!allowed.includes(next)) return current

  const filled = Number.isFinite(Number(event?.filled)) ? Number(event.filled) : current.filled

  return {
    ...current,
    state: next,
    filled,
    avgPx: Number.isFinite(Number(event?.avgPx)) ? Number(event.avgPx) : (current.avgPx ?? 0),
    ts: Number(event?.ts) || current.ts || 0,
    ...(event?.reason ? { reason: String(event.reason) } : {}),
  }
}

/**
 * Whether an order is finished.
 *
 * @param {object} order - the order.
 * @returns {boolean} true when nothing more will happen to it.
 */
export function isTerminal(order) {
  return TERMINAL.includes(String(order?.state ?? ''))
}

/**
 * Apply a venue event to the desk's order list.
 *
 * @param {object[]} orders - current orders.
 * @param {object} event - the venue event, carrying a clOrdId.
 * @returns {object[]} a new list.
 */
export function applyOrderEvent(orders, event) {
  const list = Array.isArray(orders) ? orders : []
  const id = String(event?.clOrdId ?? '')
  if (!id) return list

  const index = list.findIndex((order) => order?.clOrdId === id)
  // An event for an order the desk never sent is still worth keeping: it is a fill from
  // another session or a manual order on the venue, and hiding it would misstate risk.
  if (index === -1) return [...list, orderReducer({ state: 'pending', filled: 0, ...event }, event)]

  const next = list.slice()
  next[index] = orderReducer(list[index], event)
  return next
}

/**
 * Route a venue order event into state.
 *
 * @param {object} event - the venue event.
 * @returns {object[]} the order list now in state.
 */
export function ingestOrderEvent(event) {
  const next = applyOrderEvent(appState.trade?.orders, event)
  setValue(PATHS.trade.orders, next)

  return next
}

/**
 * Split orders into working and done.
 *
 * @param {object[]} orders - the order list.
 * @returns {{working: object[], done: object[]}} the two groups, newest first in each.
 */
export function partitionOrders(orders) {
  const list = Array.isArray(orders) ? orders : []
  const working = []
  const done = []

  for (const order of list) {
    if (isTerminal(order)) done.push(order)
    else working.push(order)
  }

  const byTime = (a, b) => (Number(b?.ts) || 0) - (Number(a?.ts) || 0)
  return { working: working.sort(byTime), done: done.sort(byTime) }
}
