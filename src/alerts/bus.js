import { setValue, appState } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { createRing } from '../pipeline/ring.js'

/**
 * The alert bus.
 *
 * Everything that wants the trader's attention — a price cross, a strategy fire, a reject,
 * a stale book — arrives here in one shape, and everything that *delivers* attention —
 * toasts, sounds, the browser's notification tray, the log — subscribes here. One shape and
 * one door, or every new alert source has to be wired into every output separately and the
 * fourth one gets forgotten.
 *
 * The severity ladder is not decoration. It decides whether a thing interrupts, and the
 * only way a desk stays usable is if `error` is rare enough that it still means something.
 */

/** Severities, quietest first. */
export const SEVERITIES = Object.freeze(['info', 'success', 'warn', 'error'])

/** Alerts kept for the log. */
export const ALERT_LOG_SIZE = 200

/** How long an identical alert stays suppressed. */
export const DEFAULT_DEBOUNCE_MS = 2000

const log = createRing(ALERT_LOG_SIZE)
const listeners = new Set()

/** The last time each alert key fired, for debouncing. */
let seen = new Map()

/**
 * Normalise anything into an alert.
 *
 * @param {object} raw - the candidate.
 * @returns {object|null} the alert, or null when there is nothing to say.
 */
export function makeAlert(raw) {
  const text = String(raw?.text ?? '').trim()
  // An alert with no text is a notification the trader cannot act on, which is worse than
  // silence because it costs attention and returns nothing.
  if (!text) return null

  const severity = SEVERITIES.includes(String(raw?.severity)) ? String(raw.severity) : 'info'

  return {
    // The dedupe key is what makes two alerts "the same alert". Defaulting it to source +
    // text means a strategy repeating itself is one alert and two strategies agreeing is
    // two, which is the distinction that matters.
    key: String(raw?.key ?? `${raw?.source ?? ''}|${text}`),
    source: String(raw?.source ?? 'desk'),
    severity,
    text,
    instrument: String(raw?.instrument ?? ''),
    ts: Number(raw?.ts) || 0,
  }
}

/**
 * Has this alert just fired?
 *
 * @param {object} alert - the alert.
 * @param {number} debounceMs - the suppression window.
 * @returns {boolean} true when it should be suppressed.
 */
export function isDuplicate(alert, debounceMs = DEFAULT_DEBOUNCE_MS) {
  const key = String(alert?.key ?? '')
  if (!key) return false

  const window = Number(debounceMs) >= 0 ? Number(debounceMs) : DEFAULT_DEBOUNCE_MS
  const last = seen.get(key)
  const at = Number(alert?.ts) || 0
  if (last === undefined) return false

  // A strategy firing the same call thirty times a second is one alert. Without this the
  // toast stack becomes a wall and the trader stops reading any of it.
  return at - last < window
}

/**
 * Publish an alert.
 *
 * @param {object} raw - the alert.
 * @param {{debounceMs?: number}} [options] - the suppression window.
 * @returns {object|null} the alert, or null when it was suppressed.
 */
export function emitAlert(raw, options = {}) {
  const alert = makeAlert(raw)
  if (!alert || isDuplicate(alert, options.debounceMs)) return null

  seen.set(alert.key, alert.ts)
  log.push(alert)
  for (const listener of listeners) listener(alert)

  return alert
}

/**
 * Subscribe to alerts.
 *
 * @param {(alert: object) => unknown} listener - called per alert.
 * @returns {() => void} unsubscribe.
 */
export function onAlert(listener) {
  if (typeof listener !== 'function') return () => {}

  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * The recent alerts.
 *
 * @param {number} [limit] - at most this many, newest-biased.
 * @returns {object[]} oldest first.
 */
export function alertLog(limit) {
  return log.toArray(limit)
}

/**
 * Publish the log and the newest alert.
 *
 * @returns {object[]} the rows published.
 */
export function flushAlerts() {
  // Newest first for the panel: an alert list read top-down is one where the thing that
  // just happened is at the top, which is where the eye already is.
  const rows = alertLog(50).slice().reverse()

  setValue(PATHS.alerts.log, rows)
  setValue(PATHS.alerts.fired, rows[0] ?? null)

  return rows
}

/**
 * Whether a source is switched on.
 *
 * @param {string} group - the toggle group, e.g. 'signals'.
 * @param {string} key - the source key.
 * @param {object} [state] - the settings slice.
 * @returns {boolean} true when enabled.
 */
export function alertEnabled(group, key, state = appState?.settings) {
  const map = state?.alertToggles?.[String(group ?? '')] ?? {}
  const value = map[String(key ?? '')]

  // Default **on**. A trader who has never opened the settings drawer should still be told
  // when their strategy fires; opting out is a decision, opting in should not have to be.
  return value !== false
}

/**
 * Forget every alert.
 *
 * @returns {boolean} true.
 */
export function resetAlerts() {
  log.clear()
  seen = new Map()
  listeners.clear()
  return true
}
