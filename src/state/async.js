import { setValue } from '../app/engine.js'
import { PATHS } from './paths.js'
import { createLogger } from '../utils/log.js'

/**
 * Remote data, with its status visible in state.
 *
 * Every async source on the desk follows the same three-path convention — value, status
 * and error — so a block can render "loading", "stale" or "dead" without each feature
 * inventing its own flags. The venue phases (9–11) plug straight into this.
 *
 * The desk never blocks on a fetch: a failed request degrades the affected block and
 * leaves the rest of the desk trading.
 */

const log = createLogger('async')

/** The status a source can be in. */
export const ASYNC_STATUS = Object.freeze({
  idle: 'idle',
  loading: 'loading',
  ready: 'ready',
  error: 'error',
})

/** In-flight abort controllers, keyed by source name. */
const inflight = new Map()

/**
 * Exponential backoff with a ceiling, for retrying a failed source.
 *
 * Capped because a scalper reloads the page long before a doubling delay would recover
 * on its own, and an uncapped backoff means a venue that blips at open is still silent
 * an hour later.
 *
 * @param {number} attempt - 0-based retry attempt.
 * @param {{baseMs?: number, capMs?: number}} [options] - tuning.
 * @returns {number} delay in ms.
 */
export function retryDelay(attempt, options = {}) {
  const { baseMs = 250, capMs = 8000 } = options
  if (!Number.isFinite(attempt) || attempt < 0) return baseMs

  return Math.min(capMs, baseMs * 2 ** Math.floor(attempt))
}

/**
 * Write one source's status trio into state.
 *
 * @param {{value: string, status: string, error: string}} paths - the source's paths.
 * @param {string} status - one of ASYNC_STATUS.
 * @param {{value?: unknown, error?: string}} [payload] - value on success, message on error.
 * @returns {string} the status written.
 */
export function setAsyncStatus(paths, status, payload = {}) {
  const next = Object.values(ASYNC_STATUS).includes(status) ? status : ASYNC_STATUS.idle

  setValue(paths.status, next)
  if (payload.value !== undefined) setValue(paths.value, payload.value)
  setValue(paths.error, next === ASYNC_STATUS.error ? String(payload.error ?? 'failed') : '')

  return next
}

/**
 * Fetch a source once, recording loading → ready | error in state.
 *
 * Aborts any request already in flight for the same name: on a fast desk the user can
 * out-click a slow response, and a late reply overwriting a newer one is a stale-data
 * bug that is very hard to see.
 *
 * @param {string} name - source name, used to dedupe in-flight requests.
 * @param {{value: string, status: string, error: string}} paths - state paths to write.
 * @param {(signal: AbortSignal) => Promise<unknown>} loader - performs the fetch.
 * @returns {Promise<{status: string, value?: unknown, error?: string}>} the outcome.
 */
export async function loadAsync(name, paths, loader) {
  abortAsync(name)

  const controller = new AbortController()
  inflight.set(name, controller)
  setAsyncStatus(paths, ASYNC_STATUS.loading)

  try {
    const value = await loader(controller.signal)
    if (controller.signal.aborted) return { status: ASYNC_STATUS.idle }

    setAsyncStatus(paths, ASYNC_STATUS.ready, { value })
    return { status: ASYNC_STATUS.ready, value }
  } catch (err) {
    const message = err?.message ?? String(err)
    if (controller.signal.aborted) return { status: ASYNC_STATUS.idle }

    log.warn(`${name}: ${message}`)
    setAsyncStatus(paths, ASYNC_STATUS.error, { error: message })
    return { status: ASYNC_STATUS.error, error: message }
  } finally {
    if (inflight.get(name) === controller) inflight.delete(name)
  }
}

/**
 * Abort a source's in-flight request, if any.
 *
 * @param {string} name - source name.
 * @returns {boolean} true when a request was actually aborted.
 */
export function abortAsync(name) {
  const controller = inflight.get(name)
  if (!controller) return false

  controller.abort()
  inflight.delete(name)
  return true
}

/**
 * Refresh the venue clock offset source.
 *
 * Server time matters on a scalping desk: venue rate limits and order timestamps are
 * judged against the venue's clock, not the browser's.
 *
 * @param {(signal: AbortSignal) => Promise<number>} [loader] - returns epoch ms.
 * @returns {Promise<{status: string, value?: unknown, error?: string}>} the outcome.
 */
export function refreshServerTime(loader = defaultServerTimeLoader) {
  return loadAsync(
    'serverTime',
    {
      value: PATHS.app.serverTime,
      status: PATHS.app.serverTimeStatus,
      error: PATHS.app.serverTimeError,
    },
    loader,
  )
}

/**
 * Default server-time loader — the browser clock until phase 9 wires OKX's endpoint.
 *
 * @returns {Promise<number>} epoch ms.
 */
export function defaultServerTimeLoader() {
  return Promise.resolve(Date.now())
}

/** Abort every in-flight source (teardown, reload, lock). */
export function abortAllAsync() {
  const names = [...inflight.keys()]
  for (const name of names) abortAsync(name)
  return names.length
}
