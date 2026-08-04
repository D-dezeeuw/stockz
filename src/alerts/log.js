import { setValue, appState } from '../app/engine.js'
import { publishAmbient } from '../ui/cadence.js'
import { PATHS } from '../state/paths.js'
import { registerAction } from '../actions/registry.js'
import { ACTIONS } from '../actions/names.js'
import { alertLog, resetAlerts, SEVERITIES } from './bus.js'

/**
 * The alert log block.
 *
 * The record of everything the desk said, including everything it was told not to say out
 * loud. This is the half of do-not-disturb that makes muting safe: the switch stops the
 * interruptions, and this keeps the information.
 *
 * It is deliberately a *tail*, not a feed to watch — newest first, filterable, and read
 * after the fact. A trader who is watching the alert log instead of the tape is a trader
 * doing the wrong thing, so the block is built for the ten seconds after coming back
 * rather than for continuous attention.
 */

/** Rows rendered at once. The ring behind it holds more; the eye does not. */
export const LOG_ROWS = 50

/**
 * A timestamp as a terminal reads one.
 *
 * @param {number} ts - epoch milliseconds.
 * @returns {string} HH:MM:SS.mmm in UTC.
 */
export function formatTs(ts) {
  const at = Number(ts)
  if (!Number.isFinite(at) || at <= 0) return '--:--:--'

  const date = new Date(at)
  const pad = (n, width = 2) => String(n).padStart(width, '0')

  // UTC, like every other clock on this desk: a session that spans a timezone change must
  // not have its log jump an hour in the middle.
  return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}.${pad(date.getUTCMilliseconds(), 3)}`
}

/**
 * Narrow the log.
 *
 * @param {object[]} rows - the alerts.
 * @param {{severity?: string, source?: string}} [filter] - the active filter.
 * @returns {object[]} the matching rows.
 */
export function filterLog(rows, filter = {}) {
  const severity = String(filter.severity ?? '')
  const source = String(filter.source ?? '')

  return (Array.isArray(rows) ? rows : []).filter((row) => {
    // An empty filter is "everything", not "nothing" — a filter UI that starts empty and
    // shows an empty list reads as a broken log.
    if (severity && String(row?.severity) !== severity) return false
    return !(source && String(row?.source) !== source)
  })
}

/**
 * The filter chips.
 *
 * @param {object[]} rows - the alerts.
 * @param {{severity?: string, source?: string}} [filter] - the active filter.
 * @returns {object[]} the chips.
 */
export function logChips(rows, filter = {}) {
  const list = Array.isArray(rows) ? rows : []
  const sources = [...new Set(list.map((row) => String(row?.source ?? '')).filter(Boolean))]

  // Counts on the chips, because "which of these fired at all" is most of what somebody
  // wants from a filter bar and it saves clicking each one to find out.
  return [
    ...SEVERITIES.map((severity) => ({
      kind: 'severity',
      value: severity,
      label: severity,
      count: list.filter((row) => row?.severity === severity).length,
      active: filter.severity === severity,
    })),
    ...sources.map((source) => ({
      kind: 'source',
      value: source,
      label: source,
      count: list.filter((row) => row?.source === source).length,
      active: filter.source === source,
    })),
  ]
}

/**
 * How many alerts arrived since the trader last looked.
 *
 * @param {object[]} rows - the alerts.
 * @param {number} seenAt - when the block was last read.
 * @returns {number} the unread count.
 */
export function unreadCount(rows, seenAt) {
  const since = Number(seenAt) || 0

  return (Array.isArray(rows) ? rows : []).filter((row) => (Number(row?.ts) || 0) > since).length
}

/**
 * Publish the log block.
 *
 * @param {number} [now] - the current time, for the unread mark.
 * @returns {object} what was published.
 */
export function refreshLog(now) {
  const filter = appState.ui?.logFilter ?? {}
  const rows = alertLog().slice().reverse()
  const visible = filterLog(rows, filter).slice(0, LOG_ROWS)

  const published = {
    rows: visible.map((row) => ({ ...row, time: formatTs(row.ts) })),
    chips: logChips(rows, filter),
    unread: unreadCount(rows, appState.ui?.logSeenAt),
    total: rows.length,
  }

  // Ambient, and no wall-clock stamp. The stamp used to ride along unread by any binding,
  // which meant the panel object differed on every recompute and could never be skipped as
  // unchanged — 862 writes in fifteen idle seconds, each one re-rendering every row.
  publishAmbient(PATHS.ui.alertPanel, published, { now: () => Number(now) || Date.now() })
  return published
}

/**
 * Toggle a filter chip.
 *
 * @param {string} kind - 'severity' or 'source'.
 * @param {string} value - the chip's value.
 * @returns {object} the filter now in force.
 */
export function toggleFilter(kind, value) {
  const key = kind === 'source' ? 'source' : 'severity'
  const current = appState.ui?.logFilter ?? {}
  // Clicking the active chip clears it. A filter bar where the only way back to
  // "everything" is a separate button is one people leave filtered by accident.
  // Both keys always present, whatever was in state: a filter object missing a key is one
  // the template has to guard, and every template that has to guard eventually forgets.
  const next = {
    severity: '',
    source: '',
    ...current,
    [key]: current[key] === String(value) ? '' : String(value),
  }

  setValue(PATHS.ui.logFilter, next)
  return next
}

/**
 * Mark the log as read.
 *
 * @param {number} now - the current time.
 * @returns {number} the mark.
 */
export function markLogSeen(now) {
  const at = Number(now) || 0
  setValue(PATHS.ui.logSeenAt, at)
  return at
}

/**
 * Register the log block's actions.
 *
 * @returns {string} the filter action's name.
 */
export function registerLogActions() {
  registerAction(ACTIONS.alerts.filterLog, (_state, payload) =>
    toggleFilter(payload?.kind, payload?.value),
  )
  registerAction(ACTIONS.alerts.clearLog, () => {
    resetAlerts()
    return refreshLog(Date.now())
  })
  registerAction(ACTIONS.alerts.jumpTo, (_state, payload) => {
    const instrument = String(payload?.instrument ?? '')
    // Clicking a row goes to the instrument it came from: the log's job is to be the way
    // back to the thing that happened, not a list to read.
    if (instrument) setValue(PATHS.market.focus, instrument)
    return instrument
  })

  return ACTIONS.alerts.filterLog
}
