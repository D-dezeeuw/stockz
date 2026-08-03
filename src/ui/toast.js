import { setValue, appState, onError } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { createLogger } from '../utils/log.js'

/**
 * Toasts — the desk speaking up.
 *
 * A scalper is watching prices, not the console. Anything that changes what they can do
 * — a rejected order, a dead feed, an engine fault — has to appear on the page, briefly,
 * without stealing focus or requiring a dismissal click. Nothing here blocks: a toast is
 * a state write, and the render is a normal binding.
 */

const log = createLogger('toast')

/** Severity levels, ordered by how much they should interrupt. */
export const TOAST_LEVELS = Object.freeze(['info', 'success', 'warn', 'error'])

/** How long each level stays on screen (ms). Errors linger; successes blink. */
export const TOAST_TTL = Object.freeze({
  info: 4000,
  success: 2500,
  warn: 6000,
  error: 10000,
})

/** Most toasts kept at once — a burst of venue errors must not fill the screen. */
export const TOAST_LIMIT = 4

let nextId = 1

/**
 * Build a toast record.
 *
 * @param {string} message - what happened, in the trader's language.
 * @param {string} [level] - one of TOAST_LEVELS.
 * @param {number} [now] - epoch ms; drives expiry.
 * @returns {{id: number, message: string, level: string, at: number, until: number}} toast.
 */
export function makeToast(message, level = 'info', now = 0) {
  const safeLevel = TOAST_LEVELS.includes(level) ? level : 'info'
  const text = String(message ?? '').trim() || 'something happened'

  return {
    id: nextId++,
    message: text,
    level: safeLevel,
    at: now,
    until: now + TOAST_TTL[safeLevel],
  }
}

/**
 * Show a toast.
 *
 * Newest first, capped at TOAST_LIMIT: during a venue outage the same error can arrive
 * dozens of times a second, and a stack that grows without bound would cover the prices
 * the trader is trying to read.
 *
 * @param {string} message - what happened.
 * @param {string} [level] - one of TOAST_LEVELS.
 * @param {number} [now] - epoch ms.
 * @returns {object} the toast that was pushed.
 */
export function pushToast(message, level = 'info', now = 0) {
  const toast = makeToast(message, level, now)
  const current = Array.isArray(appState?.ui?.toasts) ? appState.ui.toasts : []

  setValue(PATHS.ui.toasts, [toast, ...current].slice(0, TOAST_LIMIT))
  return toast
}

/**
 * Drop a toast by id — the manual dismiss.
 *
 * @param {number} id - toast id.
 * @returns {boolean} true when a toast was removed.
 */
export function dismissToast(id) {
  const current = Array.isArray(appState?.ui?.toasts) ? appState.ui.toasts : []
  const remaining = current.filter((t) => t?.id !== id)

  if (remaining.length === current.length) return false

  setValue(PATHS.ui.toasts, remaining)
  return true
}

/**
 * Remove toasts whose time is up.
 *
 * Expiry is computed from a timestamp rather than per-toast timers: one pass on the
 * clock tick beats N pending timeouts, and it stays correct if the tab was backgrounded.
 *
 * @param {number} now - epoch ms.
 * @returns {number} how many toasts expired.
 */
export function expireToasts(now) {
  const current = Array.isArray(appState?.ui?.toasts) ? appState.ui.toasts : []
  if (current.length === 0) return 0

  const alive = current.filter((t) => Number(t?.until) > now)
  const expired = current.length - alive.length

  if (expired > 0) setValue(PATHS.ui.toasts, alive)
  return expired
}

/**
 * Turn an engine error into something a trader can act on.
 *
 * Engine codes are precise but useless mid-session; this maps the ones that matter to
 * plain language and leaves anything unknown readable rather than swallowed.
 *
 * @param {{code?: string, message?: string}} err - engine error.
 * @returns {string} human-facing message.
 */
export function describeEngineError(err) {
  const code = err?.code ?? ''
  const message = err?.message ?? String(err ?? 'unknown error')

  if (code === 'E_TICK_OVERFLOW') return 'Display is falling behind the feed — reduce open blocks'
  if (code === 'E_COMPUTED_SELF_DEP') return 'Internal wiring fault in a derived value'
  return message
}

/**
 * Route engine faults into the toast stack and the log.
 *
 * @param {{now?: () => number}} [options] - injected clock.
 * @returns {(err: object) => object} the handler that was registered.
 */
export function wireEngineErrors(options = {}) {
  const { now = () => Date.now() } = options

  const handler = (err) => {
    const message = describeEngineError(err)
    log.error(message)
    return pushToast(message, 'error', now())
  }

  onError(handler)
  return handler
}
