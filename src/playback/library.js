import { setValue, appState } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { registerAction } from '../actions/registry.js'
import { ACTIONS } from '../actions/names.js'
import { pushToast } from '../ui/toast.js'
import { formatCompact } from '../utils/format.js'
import {
  openRecordingDb,
  listSessions,
  readChunks,
  deleteSession,
  putRecord,
  SESSION_STORE,
} from './recordings.js'
import { createLogger } from '../utils/log.js'

/**
 * The recording library.
 *
 * Recordings are only useful if the right one can be found, and a session identified by
 * `rec-lz4k9x-3f0a` is a session nobody will ever pick deliberately. So every row carries
 * what a trader actually recognises it by: when, how long, which instruments, how many
 * ticks — and a label they can type themselves, because "CPI spike 14:30" is the only name
 * that will still mean something next week.
 *
 * Size is shown because recordings are the one thing on this desk that grows without
 * bound. A trader who cannot see what a session costs will not prune, and the origin's
 * quota fills silently until a write fails mid-capture.
 */

const log = createLogger('library')

/**
 * Bytes a session occupies, as stored.
 *
 * Measured from the serialised chunks rather than a stored count: a number written at
 * record time would drift the moment anything about the tick shape changed, and the whole
 * point of showing it is to be trusted when deciding what to delete.
 *
 * @param {object[]} chunks - the session's chunks.
 * @returns {number} bytes.
 */
export function recordingSize(chunks) {
  const rows = Array.isArray(chunks) ? chunks : []

  return rows.reduce((total, chunk) => {
    const ticks = Array.isArray(chunk?.ticks) ? chunk.ticks : []
    // JSON length is the honest measure of what IndexedDB stores for a structured-cloned
    // array of plain objects — close enough to guide a delete, and never pretending to a
    // precision the browser does not expose.
    return total + JSON.stringify(ticks).length
  }, 0)
}

/**
 * A duration a person can read at a glance.
 *
 * @param {number} ms - milliseconds.
 * @returns {string} e.g. '2m 05s'.
 */
export function durationLabel(ms) {
  const total = Math.max(0, Math.floor(Number(ms) || 0) / 1000)
  const minutes = Math.floor(total / 60)
  const seconds = Math.floor(total % 60)

  if (minutes >= 60) return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`
}

/**
 * Turn a stored session into a row the library renders.
 *
 * @param {object} session - a sessions-store row.
 * @param {number} bytes - what it occupies.
 * @returns {object} the view row.
 */
export function libraryRow(session, bytes = 0) {
  const started = Number(session?.startedAt) || 0
  const instruments = Array.isArray(session?.instruments) ? session.instruments : []
  const when = new Date(started)

  return {
    id: String(session?.id ?? ''),
    // The typed label wins; the timestamp is the fallback, because `rec-lz4k9x-3f0a` is a
    // name nobody will ever pick deliberately.
    label: String(session?.label ?? '') || when.toISOString().slice(0, 16).replace('T', ' '),
    venue: String(session?.venue ?? ''),
    instruments: instruments.join(', '),
    // The first few, then a count: a recording that saw forty instruments must not push
    // the row's own numbers off the edge.
    instrumentLabel:
      instruments.length > 3 ? `${instruments.slice(0, 3).join(', ')} +${instruments.length - 3}` : instruments.join(', '),
    startedAt: started,
    duration: durationLabel(session?.durationMs),
    ticks: Number(session?.ticks) || 0,
    tickLabel: formatCompact(Number(session?.ticks) || 0),
    bytes: Number(bytes) || 0,
    sizeLabel: `${(Math.max(0, Number(bytes) || 0) / 1048576).toFixed(1)} MB`,
  }
}

/**
 * Every recording, with its size.
 *
 * @param {{db?: object}} [deps] - injectable database.
 * @returns {Promise<object[]>} the library rows, newest first.
 */
export async function listRecordings(deps = {}) {
  const db = deps.db !== undefined ? deps.db : await openRecordingDb()
  if (!db) return []

  const sessions = await listSessions(db)
  const rows = []
  for (const session of sessions) {
    rows.push(libraryRow(session, recordingSize(await readChunks(db, session.id))))
  }

  return rows
}

/**
 * Load the library into state.
 *
 * @param {{db?: object}} [deps] - injectable database.
 * @returns {Promise<object[]>} what was published.
 */
export async function refreshLibrary(deps = {}) {
  const rows = await listRecordings(deps)
  setValue(PATHS.playback.library, rows)

  return rows
}

/**
 * Sort and filter the library for display.
 *
 * @param {object[]} rows - library rows.
 * @param {{sort?: string, filter?: string}} [view] - how to show them.
 * @returns {object[]} the rows to render.
 */
export function libraryView(rows, view = {}) {
  const all = Array.isArray(rows) ? rows : []
  const needle = String(view?.filter ?? '').trim().toLowerCase()

  const filtered = needle
    ? all.filter(
        (row) =>
          String(row?.instruments ?? '').toLowerCase().includes(needle) ||
          String(row?.label ?? '').toLowerCase().includes(needle),
      )
    : all

  // Copied before sorting: the published array is shared with the binding, and sorting it
  // in place would reorder what is on screen without a state write to explain why.
  return [...filtered].sort((a, b) =>
    String(view?.sort) === 'size'
      ? Number(b?.bytes ?? 0) - Number(a?.bytes ?? 0)
      : Number(b?.startedAt ?? 0) - Number(a?.startedAt ?? 0),
  )
}

/**
 * Delete a recording, reclaiming its space immediately.
 *
 * @param {object} _state - engine state (unused).
 * @param {{id?: string, db?: object}} [payload] - which recording.
 * @returns {Promise<boolean>} true when it is gone.
 */
export async function deleteRecording(_state, payload = {}) {
  const id = String(payload?.id ?? '')
  if (!id) return false

  const db = payload.db !== undefined ? payload.db : await openRecordingDb()
  const gone = await deleteSession(db, id)

  // Removed from the view whatever the store said. A row that survives a delete the trader
  // watched happen reads as a desk that ignored them.
  setValue(
    PATHS.playback.library,
    (appState.playback?.library ?? []).filter((row) => row?.id !== id),
  )
  pushToast(gone ? 'recording deleted' : 'could not delete that recording', gone ? 'success' : 'warn')

  return gone
}

/**
 * Rename a recording.
 *
 * @param {object} _state - engine state (unused).
 * @param {{id?: string, label?: string, value?: string, db?: object}} [payload] - the edit.
 * @returns {Promise<string>} the label now stored.
 */
export async function renameRecording(_state, payload = {}) {
  const id = String(payload?.id ?? '')
  const label = String(payload?.label ?? payload?.value ?? '').trim()
  if (!id) return ''

  const db = payload.db !== undefined ? payload.db : await openRecordingDb()
  if (!db) return ''

  const session = (await listSessions(db)).find((row) => String(row?.id) === id)
  if (!session) return ''

  await putRecord(db, SESSION_STORE, { ...session, label })
  await refreshLibrary({ db })
  log.info(`renamed ${id}`)

  return label
}

/**
 * Register the library actions.
 *
 * @returns {string[]} the registered names.
 */
export function registerLibraryActions() {
  registerAction(ACTIONS.playback.deleteRecording, deleteRecording, {
    description: 'Delete a saved recording',
  })
  registerAction(ACTIONS.playback.renameRecording, renameRecording, {
    description: 'Rename a saved recording',
  })

  return [ACTIONS.playback.deleteRecording, ACTIONS.playback.renameRecording]
}
