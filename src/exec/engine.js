import { makeIntent, advanceOrderState, isSettled } from './types.js'
import { isAdapter, supportsIntent } from './adapters/contract.js'
import { createOkxAdapter } from './adapters/okx.js'
import { ingestOrderEvents } from '../ticket/lifecycle.js'
import { makeClientOrderId } from '../ticket/submit.js'
import { createLogger } from '../utils/log.js'

const log = createLogger('exec')

/**
 * The execution engine.
 *
 * One door. The ticket, the hotkeys, and later the strategies all submit through here,
 * which is what makes it possible to say something true about *every* order the desk
 * sends — that it was validated, that it had a client id, that its rejection was
 * normalised, that its state only ever moved through legal transitions.
 *
 * The engine holds live orders outside the reactive tree and publishes them in batches,
 * for the reason the rest of this desk does: acks arrive faster than frames, and a
 * per-ack state write would re-render the order list several times to show one change.
 */

/** venue -> adapter. */
const adapters = new Map()

/** clientId -> live order record. */
const live = new Map()

/**
 * Register a venue adapter.
 *
 * @param {object} adapter - an object satisfying the adapter contract.
 * @returns {string} the venue it was registered for, or '' when refused.
 */
export function registerAdapter(adapter) {
  const { ok, missing } = isAdapter(adapter)
  if (!ok || !adapter.venue) {
    log.warn(`adapter refused: missing ${missing.join(', ') || 'venue'}`)
    return ''
  }

  adapters.set(String(adapter.venue), adapter)
  return String(adapter.venue)
}

/**
 * The adapter for a venue.
 *
 * @param {string} venue - the venue name.
 * @returns {object|null} the adapter.
 */
export function adapterFor(venue) {
  return adapters.get(String(venue ?? '')) ?? null
}

/**
 * Validate an intent against the venue that would run it.
 *
 * @param {object} input - the order request.
 * @returns {{ok: boolean, intent: object|null, reason: string}} the verdict.
 */
export function prepare(input) {
  const built = makeIntent(input)
  if (!built.ok) return built

  const adapter = adapterFor(built.intent.venue)
  if (!adapter) return { ok: false, intent: null, reason: `no adapter for ${built.intent.venue}` }

  const supported = supportsIntent(built.intent, adapter.capabilities())
  if (!supported.ok) return { ok: false, intent: null, reason: supported.reason }

  return built
}

/**
 * Submit an order.
 *
 * @param {object} input - the order request.
 * @param {{now?: () => number}} [deps] - injectable clock.
 * @returns {Promise<{ok: boolean, clientId: string, reason: string}>} the outcome.
 */
export async function submit(input, deps = {}) {
  const { now = () => Date.now() } = deps
  const at = now()

  const { ok, intent, reason } = prepare(input)
  if (!ok) return { ok: false, clientId: '', reason }

  const clientId = intent.clientId || makeClientOrderId(at)
  const order = { ...intent, clientId, state: 'pending', filled: 0, ts: at }
  live.set(clientId, order)

  // Published before the venue answers: the row must exist from the moment the trader
  // acted, or a slow venue looks like a click that did nothing.
  publish([{ clOrdId: clientId, instId: intent.instrument, side: intent.side, sz: String(intent.size), px: intent.price ? String(intent.price) : '', state: 'pending', ts: at }])

  const result = await adapterFor(intent.venue).submit({ ...intent, clientId })
  if (!result?.ok) {
    apply(clientId, 'rejected', { reason: result?.message ?? result?.reason, ts: now() })
    return { ok: false, clientId, reason: result?.reason ?? 'unknown' }
  }

  apply(clientId, result.order?.state === 'filled' ? 'filled' : 'live', { ts: now() })
  return { ok: true, clientId, reason: '' }
}

/**
 * Apply a venue event to a live order.
 *
 * @param {string} clientId - the client order id.
 * @param {string} state - the state the venue reports.
 * @param {{filled?: number, avgPx?: number, reason?: string, ts?: number}} [detail] - extras.
 * @returns {object|null} the order after the event.
 */
export function apply(clientId, state, detail = {}) {
  const id = String(clientId ?? '')
  const order = live.get(id)
  if (!order) return null

  const { state: next, changed } = advanceOrderState(order.state, state)
  if (!changed) return order

  const updated = {
    ...order,
    state: next,
    filled: Number.isFinite(Number(detail.filled)) ? Number(detail.filled) : order.filled,
    avgPx: Number.isFinite(Number(detail.avgPx)) ? Number(detail.avgPx) : (order.avgPx ?? 0),
    ts: Number(detail.ts) || order.ts,
    ...(detail.reason ? { reason: String(detail.reason) } : {}),
  }

  // A settled order leaves the live map: it cannot change again, and keeping every order
  // of a session in memory is how a long session slows down.
  if (isSettled(next)) live.delete(id)
  else live.set(id, updated)

  publish([
    {
      clOrdId: id,
      state: next,
      filled: updated.filled,
      avgPx: updated.avgPx,
      ts: updated.ts,
      ...(updated.reason ? { reason: updated.reason } : {}),
    },
  ])

  return updated
}

/**
 * Cancel one order.
 *
 * @param {string} clientId - the client order id.
 * @param {{now?: () => number}} [deps] - injectable clock.
 * @returns {Promise<{ok: boolean, reason: string}>} the outcome.
 */
export async function cancel(clientId, deps = {}) {
  const { now = () => Date.now() } = deps
  const order = live.get(String(clientId ?? ''))
  if (!order) return { ok: false, reason: 'not live' }

  const result = await adapterFor(order.venue).cancel(order)
  if (!result?.ok) return { ok: false, reason: result?.reason ?? 'unknown' }

  apply(order.clientId, 'cancelled', { ts: now() })
  return { ok: true, reason: '' }
}

/**
 * Publish order events into the desk's order list.
 *
 * @param {object[]} events - lifecycle events.
 * @returns {object[]} the order list now in state.
 */
export function publish(events) {
  return ingestOrderEvents(events)
}

/** @returns {object[]} every order still working. */
export function liveOrders() {
  return [...live.values()]
}

/** Forget every adapter and live order. */
export function resetEngine() {
  adapters.clear()
  live.clear()
  return true
}

/**
 * Start the engine with the venues this build supports.
 *
 * @param {{okx?: object}} [deps] - injectable adapters.
 * @returns {string[]} the venues now registered.
 */
export function startEngine(deps = {}) {
  registerAdapter(deps.okx ?? createOkxAdapter())
  return [...adapters.keys()]
}
