import { setValue } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { registerAction } from '../actions/registry.js'
import { ACTIONS } from '../actions/names.js'
import { createLogger } from '../utils/log.js'
import { TRIP_REASONS } from './codes.js'

/**
 * The breaker's own record.
 *
 * Every trip, block, pause and re-arm, with the numbers that caused it attached. The
 * numbers are the point: "the breaker fired at 14:12" is trivia, and "the breaker fired at
 * 14:12 with the day at -412 against a -400 limit" is the answer to the question actually
 * being asked, which is always some version of *was it right to*.
 *
 * Recording never slows a check. The ring lives outside the reactive tree, the state
 * publish is one write, and the persist is deferred to a microtask — the order path must
 * not wait on serialisation, and a log that cost the hot path anything would eventually be
 * the reason somebody turned the breaker off.
 *
 * **Deviation from the plan, recorded deliberately:** this stores to `localStorage` rather
 * than IndexedDB. The plan assumed a shared IDB upgrade helper "used for tick recordings"
 * — no such helper exists in this codebase, and nothing else here uses IndexedDB. A
 * hundred bounded entries pruned at thirty days do not justify a second storage engine and
 * a fake-IDB test dependency; the guarantees asked for (survives reloads, bounded, pruned)
 * are all met by the mechanism the rest of the desk already uses.
 */

const log = createLogger('breaker-log')

/** How many entries stay in front of the trader. */
export const LOG_SIZE = 100

/** How long entries survive on disk. */
export const RETENTION_MS = 30 * 24 * 60 * 60 * 1000

/** Where the record lives. */
export const LOG_KEY = 'stockz.breaker.log.v1'

/** The ring, held outside the reactive tree. */
let entries = []

/** True when a persist is already queued. */
let queued = false

/**
 * What an entry says out loud.
 *
 * @param {{kind?: string, code?: number, reason?: string}} entry - the entry.
 * @returns {string} the label.
 */
export function eventLabel(entry) {
  const kind = String(entry?.kind ?? 'event')
  const reason = String(entry?.reason ?? '') || TRIP_REASONS[Number(entry?.code)] || ''

  return reason ? `${kind} — ${reason}` : kind
}

/**
 * Record one breaker event.
 *
 * @param {{kind?: string, code?: number, reason?: string, ts?: number, values?: object}} evt -
 *   what happened.
 * @param {{storage?: Storage, defer?: Function}} [deps] - injectable plumbing.
 * @returns {object} the stored entry.
 */
export function logBreakerEvent(evt, deps = {}) {
  const entry = {
    ts: Number(evt?.ts) || 0,
    kind: String(evt?.kind ?? 'event'),
    code: Number(evt?.code) || 0,
    reason: String(evt?.reason ?? ''),
    values: { ...(evt?.values ?? {}) },
  }
  entry.label = eventLabel(entry)

  // Newest first, bounded: the list is read by a human scrolling from the top, and the
  // hundredth-oldest trip is not what anybody is looking for.
  entries = [entry, ...entries].slice(0, LOG_SIZE)
  setValue(PATHS.breaker.log, entries.slice(0, 25))

  // Deferred, and coalesced behind one flag: a burst of blocks must serialise once, not
  // once per block, and never inside the order path.
  const defer = deps.defer ?? globalThis.queueMicrotask?.bind(globalThis)
  if (!queued && typeof defer === 'function') {
    queued = true
    defer(() => flushBreakerLog(deps.storage))
  }

  return entry
}

/**
 * The entries in memory.
 *
 * @returns {object[]} newest first.
 */
export function breakerEvents() {
  return entries
}

/**
 * Write the record to disk.
 *
 * @param {Storage} [storage] - storage to write to.
 * @returns {boolean} true when it was written.
 */
export function flushBreakerLog(storage = globalThis.localStorage) {
  queued = false
  try {
    storage?.setItem?.(LOG_KEY, JSON.stringify(entries))
    return true
  } catch (err) {
    // Losing the record is an inconvenience; interrupting trading over it is not
    // acceptable, so a full quota is logged and swallowed like every other write here.
    log.warn(`unwritable breaker log: ${err?.message ?? err}`)
    return false
  }
}

/**
 * Read the record back at boot.
 *
 * @param {Storage} [storage] - storage to read from.
 * @returns {object[]} the entries.
 */
export function loadBreakerLog(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem?.(LOG_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    entries = Array.isArray(parsed) ? parsed.slice(0, LOG_SIZE) : []
  } catch (err) {
    // Corrupt storage degrades to an empty log rather than stopping the desk from booting.
    log.warn(`unreadable breaker log: ${err?.message ?? err}`)
    entries = []
  }

  setValue(PATHS.breaker.log, entries.slice(0, 25))
  return entries
}

/**
 * Drop everything older than the retention window.
 *
 * @param {number} now - the current time.
 * @param {Storage} [storage] - storage to write to.
 * @returns {number} how many were dropped.
 */
export function pruneBreakerEvents(now, storage = globalThis.localStorage) {
  const cutoff = (Number(now) || 0) - RETENTION_MS
  const kept = entries.filter((entry) => Number(entry?.ts) >= cutoff)
  const dropped = entries.length - kept.length
  if (dropped === 0) return 0

  entries = kept
  setValue(PATHS.breaker.log, entries.slice(0, 25))
  flushBreakerLog(storage)

  return dropped
}

/**
 * The record as JSON, on the clipboard.
 *
 * @param {{writeText?: Function}} [clipboard] - injectable clipboard.
 * @returns {string} what was copied.
 */
export function copyBreakerLog(clipboard = globalThis.navigator?.clipboard) {
  const payload = JSON.stringify(entries, null, 2)
  // Fire and forget. The clipboard permission prompt is the browser's business, and a
  // button that waited on it would be a button that hangs.
  clipboard?.writeText?.(payload)?.catch?.(() => {})

  return payload
}

/**
 * Register the log actions.
 *
 * @returns {string} the copy action's name.
 */
export function registerLogActions() {
  registerAction(ACTIONS.breaker.copyLog, () => copyBreakerLog().length)

  return ACTIONS.breaker.copyLog
}

/**
 * Forget the record.
 *
 * @returns {boolean} true.
 */
export function resetBreakerLog() {
  entries = []
  queued = false
  setValue(PATHS.breaker.log, [])

  return true
}
