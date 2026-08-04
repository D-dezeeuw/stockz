import { makeIntent, advanceOrderState, isSettled, roundToLotTick } from './types.js'
import { isAdapter, supportsIntent } from './adapters/contract.js'
import { createOkxAdapter } from './adapters/okx.js'
import { createEtoroAdapter } from './adapters/etoro.js'
import { checkSlippage, checkSize } from './guard.js'
import { appState } from '../app/engine.js'
import { ingestOrderEvents } from '../ticket/lifecycle.js'
import { issueId, claimId, resetIds } from './ids.js'
import { stampLatency, resetLatency } from './latency.js'
import { ingestFill } from '../positions/store.js'
import { captureIntent, scoreFill } from '../hud/quality.js'
import { recordFee } from '../hud/fees.js'
import { routeExecAlert } from '../alerts/exec.js'
import { dailyLossCheck, orderChecks, breakerRejection, isExit, TRIP } from '../breakers/index.js'
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

/**
 * The monotonic clock the latency stamps use.
 *
 * @returns {number} milliseconds since an arbitrary origin.
 */
export function monotonic() {
  return globalThis.performance?.now?.() ?? 0
}

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
export function prepare(input, market = deskMarket()) {
  const built = makeIntent(input)
  if (!built.ok) return built

  const adapter = adapterFor(built.intent.venue)
  if (!adapter) return { ok: false, intent: null, reason: `no adapter for ${built.intent.venue}` }

  const supported = supportsIntent(built.intent, adapter.capabilities())
  if (!supported.ok) return { ok: false, intent: null, reason: supported.reason }

  // The guards run here, in the one place every order passes, rather than in each caller
  // — a check the ticket does and a hotkey forgets is not a check.
  // Snapped to the venue's grid before the guards run, so a size that rounds down under
  // a limit is judged as what will actually be sent rather than as what was typed.
  const snapped = roundToLotTick(built.intent, market)
  built.intent.size = snapped.size || built.intent.size
  if (built.intent.type === 'limit') built.intent.price = snapped.price || built.intent.price

  const sized = checkSize(built.intent.size, market.maxSize)
  if (!sized.ok) return { ok: false, intent: null, reason: sized.reason }

  const slip = checkSlippage(built.intent, market)
  if (!slip.ok) return { ok: false, intent: null, reason: slip.reason }

  return built
}

/**
 * The market context the guards check against.
 *
 * @returns {{mid: number, maxBps: number, maxSize: number, bookStatus: string}} the context.
 */
export function deskMarket() {
  return {
    mid: Number(appState.market?.mid) || 0,
    maxBps: Number(appState.settings?.maxDeviationBps) || 0,
    maxSize: Number(appState.settings?.maxPosition) || 0,
    bookStatus: String(appState.market?.bookStatus ?? ''),
    lotSize: Number(appState.market?.lotSize) || 0,
    tickSize: Number(appState.market?.tickSize) || 0,
  }
}

/**
 * Submit an order.
 *
 * @param {object} input - the order request.
 * @param {{now?: () => number}} [deps] - injectable clock.
 * @returns {Promise<{ok: boolean, clientId: string, reason: string}>} the outcome.
 */
export async function submit(input, deps = {}) {
  // A monotonic clock for the latency legs, wall time for the order record: mixing them
  // is how a session that crosses a clock adjustment reports negative latencies.
  const { now = () => Date.now(), clock = monotonic } = deps
  const at = now()

  const market = deskMarket()
  const { ok, intent, reason } = prepare(input, market)
  if (!ok) return { ok: false, clientId: '', reason }

  // The safety net, once, on the one path every order takes — before any venue send and
  // after validation, so the size being checked is the size that would actually go. It is
  // primitive comparisons against a cached threshold: it costs under a microsecond, which
  // is the only reason it can afford to be here at all.
  // Exits are never what a halt is for. A desk that stopped itself and then refused to let
  // the position be closed would trap the exact exposure it halted over — including the
  // flatten the trip itself dispatched, which would make the wipe a no-op.
  if (!isExit(intent)) {
    const trip = dailyLossCheck({ position: intent.size, now: at })
    if (trip !== TRIP.NONE) return breakerRejection(trip)
  }

  // The soft checks: these refuse *this order* and leave the desk running. A cap breach is
  // a typo far more often than an emergency, and flattening the book over one is a cure
  // worse than the mistake.
  const blocked = orderChecks(intent, { now: at })
  if (blocked.code !== TRIP.NONE) return { ok: false, clientId: '', reason: blocked.reason }

  const clientId = intent.clientId || issueId(at)
  // Claimed before the network call: a duplicate id at the venue is either a rejection
  // or, worse, a second order.
  if (intent.clientId && !claimId(intent.clientId).ok) {
    return { ok: false, clientId, reason: 'duplicate id' }
  }
  const order = { ...intent, clientId, state: 'pending', filled: 0, ts: at }
  live.set(clientId, order)

  // Published before the venue answers: the row must exist from the moment the trader
  // acted, or a slow venue looks like a click that did nothing.
  publish([{ clOrdId: clientId, instId: intent.instrument, side: intent.side, sz: String(intent.size), px: intent.price ? String(intent.price) : '', state: 'pending', ts: at }])

  stampLatency(clientId, 'submit', clock())
  // The price aimed at, captured at submit: without it there is nothing to compare the
  // fill against, and slippage becomes unmeasurable after the fact.
  captureIntent(clientId, {
    price: intent.price || Number(market.mid) || 0,
    side: intent.side,
    instrument: intent.instrument,
  })

  const result = await adapterFor(intent.venue).submit({ ...intent, clientId })
  stampLatency(clientId, 'ack', clock())
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

  if (next === 'filled' || next === 'partial') {
    stampLatency(id, 'fill', monotonic())

    // The position book moves on the fill itself, synchronously. An order list a frame
    // behind is cosmetic; a position a frame behind is a risk number someone may size
    // against.
    const justFilled = Number(detail.filled ?? order.size) - Number(order.filled || 0)
    if (justFilled > 0) {
      scoreFill({
        clientId: id,
        px: Number(detail.avgPx) || order.price,
        instrument: order.instrument,
        ts: Number(detail.ts) || order.ts,
      })

      ingestFill({
        venue: order.venue,
        instrument: order.instrument,
        side: order.side,
        qty: justFilled,
        px: Number(detail.avgPx) || order.price,
        ts: Number(detail.ts) || order.ts,
      })

      // Scored off the same fill: the venue's own charge when it reported one, the rate
      // card when it has not billed yet.
      recordFee({
        venue: order.venue,
        instrument: order.instrument,
        qty: justFilled,
        px: Number(detail.avgPx) || order.price,
        fee: detail.fee,
        maker: detail.maker,
      })
    }
  }

  const updated = {
    ...order,
    state: next,
    filled: Number.isFinite(Number(detail.filled)) ? Number(detail.filled) : order.filled,
    avgPx: Number.isFinite(Number(detail.avgPx)) ? Number(detail.avgPx) : (order.avgPx ?? 0),
    ts: Number(detail.ts) || order.ts,
    ...(detail.reason ? { reason: String(detail.reason) } : {}),
  }

  // Announced from the one place every lifecycle transition passes. A scalper clicks and
  // looks away; the worst state on a fast desk is not knowing whether the order went,
  // because the trader who is unsure clicks again and now there are two.
  routeExecAlert({
    type: next,
    clientId: id,
    instrument: order.instrument,
    side: order.side,
    qty: Number(detail.filled ?? updated.filled) || 0,
    px: Number(detail.avgPx) || order.price,
    sCode: detail.sCode,
    sMsg: detail.reason,
    ts: Number(detail.ts) || order.ts,
  })

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
  // A fresh engine is a fresh session: the id registry and latency window belong to the
  // session, and carrying them over would refuse ids from a desk that no longer exists.
  resetIds()
  resetLatency()
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
  registerAdapter(deps.etoro ?? createEtoroAdapter())
  return [...adapters.keys()]
}
