import { setValue, appState } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { registerAction } from '../actions/registry.js'
import { ACTIONS } from '../actions/names.js'
import { splitSymbol } from '../lists/ops.js'
import { readTicket } from './actions.js'
import { queueOrder, drainQueue, takeQueue } from './queue.js'

/**
 * The submit fast path.
 *
 * The click is not where the work should be. By the time a finger comes down the payload
 * is already assembled and sitting in a variable — the click reads it, sends it, and
 * paints an optimistic row. Everything expensive (symbol splitting, precision handling,
 * id generation) happens on the state changes that precede the click, which are idle
 * moments by definition.
 *
 * The client order id is the other half of "fast": with one, a retry after a timeout is
 * safe, so the path never has to choose between waiting for an ack and risking a double
 * fill.
 */

/** Counter behind the client order id, so two orders in one millisecond stay distinct. */
let sequence = 0

/**
 * A monotonic client order id.
 *
 * @param {number} now - epoch milliseconds.
 * @param {string} [prefix] - venue-safe prefix.
 * @returns {string} the id.
 */
export function makeClientOrderId(now, prefix = 'stkz') {
  sequence = (sequence + 1) % 1e4
  const stamp = Math.max(0, Math.floor(Number(now) || 0)).toString(36)

  // Time-ordered and unique within a millisecond. OKX allows letters and digits up to 32
  // characters, so this stays well inside the limit for the life of a session.
  return `${prefix}${stamp}${String(sequence).padStart(4, '0')}`
}

/**
 * Build the venue payload for a ticket.
 *
 * @param {{symbol: string, side: string, size: number, mode: string}} ticket - the ticket.
 * @param {{price?: number, source?: string}} resolved - the resolved price.
 * @param {{mode?: string, clOrdId?: string, now?: number}} [context] - trade mode and id.
 * @returns {object|null} the OKX v5 order payload, or null when the ticket is not sendable.
 */
export function buildOrderPayload(ticket, resolved, context = {}) {
  const instId = splitSymbol(ticket?.symbol).symbol || String(ticket?.symbol ?? '')
  const size = Number(ticket?.size)
  if (!instId || !Number.isFinite(size) || size <= 0) return null

  // A resolved source of 'market' means the price was crossed to, not chosen — sending
  // it as a limit would rest an order at a price the trader meant to take.
  const limit = resolved?.source !== 'market' && Number(resolved?.price) > 0

  return {
    instId,
    tdMode: String(context.mode ?? 'cash'),
    side: ticket?.side === 'sell' ? 'sell' : 'buy',
    ordType: limit ? 'limit' : 'market',
    sz: String(size),
    ...(limit ? { px: String(resolved.price) } : {}),
    clOrdId: String(context.clOrdId ?? makeClientOrderId(context.now ?? 0)),
  }
}

/** The payload kept warm between clicks. */
let cached = null

/**
 * Rebuild the cached payload. Called on ticket and quote changes, never on the click.
 *
 * @param {{now?: number, mode?: string}} [context] - the clock and trade mode.
 * @returns {object|null} the payload now cached.
 */
export function primePayload(context = {}) {
  const { ticket, resolved, verdict } = readTicket(context)
  // Cached even when the verdict is no: the payload's job is to be ready, and the gate
  // is checked again at submit time against fresher state.
  cached = buildOrderPayload(ticket, resolved, { mode: context.mode, now: context.now })

  return cached ? { ...cached, _ok: verdict.ok } : null
}

/** @returns {object|null} the payload currently cached. */
export function cachedPayload() {
  return cached
}

/**
 * Register the submit action.
 *
 * @param {{send?: (payload: object) => unknown, now?: () => number}} [deps] - the venue
 *   send call and clock, injected so the fast path is testable without a socket.
 * @returns {string} the registered action name.
 */
export function registerSubmitAction(deps = {}) {
  const { send = null, now = () => Date.now() } = deps

  registerAction(ACTIONS.ticket.submit, (_state, payload) => {
    const at = now()
    const { ticket, resolved, verdict } = readTicket({ now: at })

    if (!verdict.ok) {
      setValue(PATHS.trade.lastReject, verdict.reason)
      return false
    }

    // Reuse the warm payload when it still matches the ticket; rebuild only if the two
    // have drifted. A stale payload is worse than a slow one.
    const fresh =
      cached && cached.sz === String(ticket.size) && cached.side === ticket.side
        ? cached
        : buildOrderPayload(ticket, resolved, { now: at })
    if (!fresh) return false

    const order = {
      ...fresh,
      // Side can be overridden by the click itself (the BUY and SELL buttons), so the
      // button pressed always wins over whatever the ticket last held.
      side: payload?.side === 'sell' || payload?.side === 'buy' ? payload.side : fresh.side,
    }

    // Optimistic first, send second. The row appears in the same frame as the click; the
    // venue's ack updates it later. Waiting for the ack to paint would put a network
    // round trip inside the one interaction that must feel instant.
    setValue(PATHS.trade.orders, [
      ...(Array.isArray(appState.trade?.orders) ? appState.trade.orders : []),
      {
        clOrdId: order.clOrdId,
        instId: order.instId,
        side: order.side,
        sz: order.sz,
        px: order.px ?? '',
        state: 'pending',
        ts: at,
      },
    ])
    setValue(PATHS.trade.lastReject, '')

    // Through the queue, not straight to the wire: four clicks in 300ms must become four
    // orders in click order, each at the price its own click saw.
    if (!queueOrder(order, { now: at })) {
      setValue(PATHS.trade.lastReject, 'burst limit')
      return false
    }
    cached = null

    // Drained on the next microtask so the click returns immediately — the optimistic
    // row is already painted, and the send has no business blocking the handler.
    Promise.resolve().then(() => flushQueue(send))
    return true
  })

  return ACTIONS.ticket.submit
}

/**
 * Drain whatever is queued through the venue send.
 *
 * @param {(payload: object) => unknown} send - the venue call.
 * @returns {Promise<object>} the drain result.
 */
export async function flushQueue(send) {
  // Taken, not read: the queue lives outside the reactive tree precisely so a second
  // click in the same frame cannot drain the first one again.
  const queued = takeQueue()
  if (queued.length === 0) return { sent: 0, failed: 0, remaining: [] }

  return drainQueue(queued, async (payload) => {
    const result = await send?.(payload)
    return result ?? true
  })
}

/** Forget the cached payload — on a symbol change, where it would be wrong. */
export function resetSubmit() {
  cached = null
  sequence = 0
  return true
}
