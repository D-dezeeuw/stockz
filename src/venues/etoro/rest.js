import { getKey } from '../vault.js'
import { mapError, mapQuote, mapPosition, learnInstruments } from './map.js'
import { reportRtt } from '../../hud/rtt.js'
import { createLogger } from '../../utils/log.js'

/**
 * EToro REST client and adaptive poller.
 *
 * EToro offers no public stream, so quotes are polled. Polling everything at the same
 * rate is the obvious mistake: the focused instrument needs sub-second updates while a
 * watchlist row is fine at a few seconds, and a hidden tab needs nothing at all. Burning
 * the rate budget on rows nobody is looking at is what makes the *focused* quote stale.
 */

const log = createLogger('etoro')

// The backend's same-origin prefix; server/main.js forwards it to https://api.etoro.com.
// Same reason as OKX: venue REST from the browser is at the mercy of the venue's CORS
// policy, and the desk's own origin is the one host that always answers it.
export const ETORO_BASE = '/etoro'

/** Poll intervals, in ms, by how much the trader is looking at something. */
export const POLL_MS = Object.freeze({
  focused: 1000,
  watchlist: 5000,
  background: 15000,
  hidden: 0, // paused entirely
})

/**
 * Headers for an EToro call.
 *
 * Unlike OKX there is no signing — the keys are sent directly, which is exactly why they
 * must never be logged.
 *
 * @returns {Record<string, string>} headers, or {} when credentials are missing.
 */
export function etoroHeaders() {
  const apiKey = getKey('etoro', 'apiKey')
  const userKey = getKey('etoro', 'userKey')

  if (!apiKey || !userKey) return {}
  return {
    'X-REQUEST-ID': 'stockz',
    'X-API-KEY': apiKey,
    'X-USER-KEY': userKey,
    'Content-Type': 'application/json',
  }
}

/**
 * How often an instrument should be polled.
 *
 * @param {{focus?: string, visible?: boolean, watchlist?: string[]}} context - what the
 *   trader is looking at.
 * @param {string} symbol - the instrument in question.
 * @returns {number} interval in ms; 0 means do not poll.
 */
export function pollIntervalFor(context, symbol) {
  if (context?.visible === false) return POLL_MS.hidden
  if (symbol && symbol === context?.focus) return POLL_MS.focused

  const watchlist = Array.isArray(context?.watchlist) ? context.watchlist : []
  return watchlist.includes(symbol) ? POLL_MS.watchlist : POLL_MS.background
}

/**
 * Make an EToro request.
 *
 * @param {{path: string, method?: string, body?: object, fetch?: Function}} req - request.
 * @returns {Promise<{ok: boolean, data?: unknown, error?: string}>} the outcome.
 */
export async function etoroRequest(req) {
  const {
    path,
    method = 'GET',
    body,
    fetch: fetchImpl = globalThis.fetch,
    clock = () => globalThis.performance?.now?.() ?? 0,
    report = reportRtt,
  } = req
  const headers = etoroHeaders()

  if (Object.keys(headers).length === 0) {
    return { ok: false, error: 'No EToro credentials — add keys to trade' }
  }

  // Latency is taken from the calls the desk already makes, rather than a synthetic health
  // check on a timer. EToro publishes no health endpoint — the probe this replaces asked
  // for `/status`, which does not exist, so it 404ed every few seconds forever and reported
  // the venue as unreachable no matter how it was actually behaving. Timing the real
  // requests costs nothing on the rate budget and measures the latency that matters.
  const started = clock()

  try {
    const response = await fetchImpl(`${ETORO_BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })

    const parsed = await response.json()
    if (response.ok === false) {
      // A failed call reports -1, never a large number: recording a timeout as "3000ms"
      // would drag the smoothed average around long after the venue came back.
      report?.('etoro', -1)
      return { ok: false, error: mapError({ status: response.status, ...parsed }) }
    }

    report?.('etoro', Number((clock() - started).toFixed(3)))
    return { ok: true, data: parsed }
  } catch (err) {
    report?.('etoro', -1)
    const message = err?.message ?? String(err)
    log.warn(`request failed: ${message}`)
    return { ok: false, error: `EToro unreachable: ${message}` }
  }
}

/**
 * Fetch the instrument catalogue and teach the mappers its ids.
 *
 * @param {object} [options] - injected fetch.
 * @returns {Promise<{ok: boolean, count?: number, error?: string}>} the outcome.
 */
export async function fetchInstruments(options = {}) {
  const result = await etoroRequest({ path: '/Metadata/V1/instruments', ...options })
  if (!result.ok) return { ok: false, error: result.error }

  const list = Array.isArray(result.data?.instrumentDisplayDatas)
    ? result.data.instrumentDisplayDatas
    : result.data
  return { ok: true, count: learnInstruments(list) }
}

/**
 * Fetch quotes for a set of instruments.
 *
 * @param {string[]} instrumentIds - EToro instrument ids.
 * @param {object} [options] - injected fetch.
 * @returns {Promise<{ok: boolean, ticks?: object[], error?: string}>} the outcome.
 */
export async function fetchQuotes(instrumentIds, options = {}) {
  const ids = (Array.isArray(instrumentIds) ? instrumentIds : []).join(',')
  if (!ids) return { ok: true, ticks: [] }

  const result = await etoroRequest({ path: `/Market/V1/quotes?instrumentIds=${ids}`, ...options })
  if (!result.ok) return { ok: false, error: result.error }

  const rows = Array.isArray(result.data?.rates) ? result.data.rates : result.data
  return { ok: true, ticks: (Array.isArray(rows) ? rows : []).map(mapQuote).filter(Boolean) }
}

/**
 * Fetch open positions.
 *
 * @param {object} [options] - injected fetch.
 * @returns {Promise<{ok: boolean, positions?: object[], error?: string}>} the outcome.
 */
export async function fetchPortfolio(options = {}) {
  const result = await etoroRequest({ path: '/API/User/V1/portfolio/positions', ...options })
  if (!result.ok) return { ok: false, error: result.error }

  const rows = Array.isArray(result.data?.positions) ? result.data.positions : result.data
  return {
    ok: true,
    positions: (Array.isArray(rows) ? rows : []).map(mapPosition).filter(Boolean),
  }
}

/**
 * Create the adaptive quote poller.
 *
 * @param {{fetchQuotes?: Function, timer?: object, onTicks?: Function,
 *   context?: () => object}} [options] - injected environment.
 * @returns {{start: Function, stop: Function, running: () => boolean}} the poller.
 */
export function createQuotePoller(options = {}) {
  const {
    fetchQuotes: fetchImpl = fetchQuotes,
    timer = globalThis,
    onTicks = () => {},
    context = () => ({}),
  } = options

  let handle = null
  let running = false

  const tickOnce = async () => {
    const ctx = context()
    const ids = Array.isArray(ctx.instrumentIds) ? ctx.instrumentIds : []
    if (ids.length === 0) return schedule()

    const result = await fetchImpl(ids)
    if (result?.ok) onTicks(result.ticks ?? [])
    return schedule()
  }

  const schedule = () => {
    if (!running) return null

    const ctx = context()
    const interval = pollIntervalFor(ctx, ctx.focus)
    // A hidden tab polls nothing: the quotes would be stale by the time it is looked at,
    // and the rate budget is better spent when the trader comes back.
    if (interval === 0) {
      handle = timer.setTimeout?.(schedule, POLL_MS.background)
      return handle
    }

    handle = timer.setTimeout?.(tickOnce, interval)
    return handle
  }

  return {
    start: () => {
      running = true
      return tickOnce()
    },
    stop: () => {
      running = false
      timer.clearTimeout?.(handle)
      handle = null
    },
    running: () => running,
  }
}
