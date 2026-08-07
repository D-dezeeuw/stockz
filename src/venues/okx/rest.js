import { signRequest } from './sign.js'
import { mapError, mapOrder, mapPosition } from './map.js'
import { okxNow } from './clock.js'
import { okxRestBase } from './region.js'
import { OKX_ENDPOINTS } from './endpoints.js'
import { createLogger } from '../../utils/log.js'

/**
 * OKX REST.
 *
 * Orders normally go over the private WebSocket, but REST is the fallback the desk needs
 * when the socket is reconnecting — a trader who wants out of a position does not care
 * which transport carries the cancel.
 *
 * Every call returns `{ ok, data, error }` rather than throwing. On the order path an
 * exception is the worst possible outcome: it unwinds the caller and leaves the trader
 * unsure whether the order went. A result object forces the question to be answered.
 */

const log = createLogger('okx-rest')

// The *global* platform's base, kept as a named constant for callers and tests. Requests
// themselves resolve the base per call through `okxRestBase()`, because EEA accounts live
// on a different platform entirely and their keys do not exist on this one.
export const OKX_REST_BASE = 'https://www.okx.com'

/** Requests allowed per endpoint per two seconds, per OKX's published limits. Keys come
 *  from the endpoint map so a budget entry can never drift out of step with the path the
 *  requests actually use. */
export const RATE_LIMITS = Object.freeze({
  [OKX_ENDPOINTS.order]: 60,
  [OKX_ENDPOINTS.cancelOrder]: 60,
  [OKX_ENDPOINTS.ordersPending]: 60,
  [OKX_ENDPOINTS.balance]: 10,
  [OKX_ENDPOINTS.positions]: 10,
  [OKX_ENDPOINTS.instruments]: 20,
})

/** path -> timestamps of recent calls, for the budget tracker. */
const recentCalls = new Map()

/**
 * Whether a call would exceed the endpoint's published rate limit.
 *
 * Tracked client-side because being rate-limited mid-scalp costs a fill: it is better to
 * know a request will be refused before sending it than to discover it from a 429.
 *
 * @param {string} path - endpoint path.
 * @param {number} now - epoch ms.
 * @param {number} [windowMs] - the limit window.
 * @returns {boolean} true when the call is within budget.
 */
export function withinRateLimit(path, now, windowMs = 2000) {
  const limit = RATE_LIMITS[path]
  if (!limit) return true

  const calls = (recentCalls.get(path) ?? []).filter((ts) => now - ts < windowMs)
  recentCalls.set(path, calls)
  return calls.length < limit
}

/**
 * Record that a call was made, for the budget tracker.
 *
 * @param {string} path - endpoint path.
 * @param {number} now - epoch ms.
 * @returns {number} calls now counted in the window.
 */
export function recordCall(path, now) {
  const calls = recentCalls.get(path) ?? []
  calls.push(now)
  recentCalls.set(path, calls)
  return calls.length
}

/** Forget all rate-limit history (tests, and a venue reconnect). */
export function resetRateLimits() {
  recentCalls.clear()
}

/**
 * Interpret an OKX REST envelope.
 *
 * OKX returns HTTP 200 with `code: '1'` for business failures, so the HTTP status alone
 * says nothing — an order rejected for insufficient balance arrives as a success.
 *
 * @param {object} body - parsed response body.
 * @returns {{ok: boolean, code: string, data: unknown[], error?: string}} the outcome.
 */
export function readEnvelope(body) {
  const code = String(body?.code ?? '')
  const data = Array.isArray(body?.data) ? body.data : []

  if (code === '0') return { ok: true, code, data }

  // A per-item failure carries its own code; surface that rather than the envelope's.
  const first = data[0]
  const detail = first?.sCode && first.sCode !== '0' ? { code: first.sCode, msg: first.sMsg } : body

  // The raw code travels with the mapped message. A caller that only wants to *say* what
  // went wrong reads `error`; the key preflight has to *branch* on which failure it was,
  // and matching on prose would break the first time a message is reworded.
  return { ok: false, code: String(detail?.code ?? code), data, error: mapError(detail) }
}

/**
 * Make a signed REST call.
 *
 * `base` and `demo` aim one call explicitly, overriding the settings the desk normally
 * reads. Only the key probe uses them: working out which of OKX's four key universes a key
 * belongs to means asking all four, and it cannot ask by flipping the settings it is trying
 * to determine.
 *
 * @param {{method?: string, path: string, body?: object, ts?: number, fetch?: Function,
 *   subtle?: object, base?: string, demo?: boolean}} req - the request.
 * @returns {Promise<{ok: boolean, data?: unknown[], error?: string}>} the outcome.
 */
export async function okxRequest(req) {
  // `ts` defaults to the *venue's* now, not to zero and not to the raw browser clock. OKX
  // rejects any request whose timestamp is more than 30 seconds from its own clock, so a
  // default of 0 signs every unparameterised call as 1970 and gets a flat 401 that reads
  // exactly like a bad API key. `okxNow()` rather than `Date.now()` for the same reason
  // one step further out: the desk measures its drift against OKX at boot precisely so it
  // can sign against the venue, and defaulting to `Date.now()` here handed `signRequest` a
  // timestamp it would never correct — the measurement was taken and then thrown away on
  // every single REST call.
  const {
    method = 'GET',
    path,
    body,
    ts = okxNow(),
    fetch: fetchImpl = globalThis.fetch,
    subtle,
    base,
    demo,
  } = req

  if (!withinRateLimit(path, ts)) {
    return { ok: false, code: '', error: 'Rate limit reached for this endpoint — slow down' }
  }

  // Serialised exactly once, and the same string is signed and sent. Serialising in two
  // places invites the one divergence a venue cannot forgive: a signature over a body the
  // request does not carry, rejected as a 401 that reads like a bad key.
  const payload = typeof body === 'string' ? body : body ? JSON.stringify(body) : ''

  const headers = await signRequest({ ts, method, path, body: payload, subtle, demo })
  if (Object.keys(headers).length === 0) {
    return { ok: false, code: '', error: 'No OKX credentials — add keys to trade' }
  }

  recordCall(path, ts)

  try {
    // The base is resolved per call: an EEA account's keys exist only on the EU platform,
    // and flipping that setting must redirect the very next request.
    const response = await fetchImpl(`${base ?? okxRestBase()}${path}`, {
      method,
      headers,
      body: payload || undefined,
    })
    const parsed = await response.json()
    return readEnvelope(parsed)
  } catch (err) {
    // Never throw on the order path: an exception leaves the trader unsure whether the
    // order went.
    const message = err?.message ?? String(err)
    log.warn(`request failed: ${message}`)
    return { ok: false, code: '', error: `OKX unreachable: ${message}` }
  }
}

/**
 * Place an order.
 *
 * @param {object} order - internal order intent.
 * @param {object} [options] - injected fetch/clock/crypto.
 * @returns {Promise<{ok: boolean, order?: object, error?: string}>} the outcome.
 */
export async function placeOrder(order, options = {}) {
  const result = await okxRequest({
    method: 'POST',
    path: OKX_ENDPOINTS.order,
    body: {
      instId: order?.symbol,
      tdMode: order?.tdMode ?? 'cash',
      side: order?.side,
      ordType: order?.type ?? 'limit',
      px: order?.px !== undefined ? String(order.px) : undefined,
      sz: String(order?.sz ?? ''),
      clOrdId: order?.clientId,
    },
    ...options,
  })

  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true, order: mapOrder({ ...result.data[0], instId: order?.symbol }) }
}

/**
 * Cancel an order.
 *
 * @param {{symbol: string, id?: string, clientId?: string}} order - what to cancel.
 * @param {object} [options] - injected fetch/clock/crypto.
 * @returns {Promise<{ok: boolean, error?: string}>} the outcome.
 */
export async function cancelOrder(order, options = {}) {
  const result = await okxRequest({
    method: 'POST',
    path: OKX_ENDPOINTS.cancelOrder,
    body: { instId: order?.symbol, ordId: order?.id, clOrdId: order?.clientId },
    ...options,
  })

  return result.ok ? { ok: true } : { ok: false, error: result.error }
}

/**
 * Fetch open positions.
 *
 * @param {object} [options] - injected fetch/clock/crypto.
 * @returns {Promise<{ok: boolean, positions?: object[], error?: string}>} the outcome.
 */
export async function fetchPositions(options = {}) {
  const result = await okxRequest({ path: OKX_ENDPOINTS.positions, ...options })

  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true, positions: result.data.map(mapPosition).filter(Boolean) }
}
