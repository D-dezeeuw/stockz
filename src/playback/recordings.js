import { createLogger } from '../utils/log.js'

/**
 * Where recorded markets live.
 *
 * IndexedDB rather than `localStorage`, and not because of the 5MB cap alone: a recorded
 * session is tens of thousands of ticks, and `localStorage` is synchronous — writing one
 * would block the main thread mid-scalp, which is the exact thing recording exists to let
 * you study.
 *
 * Two stores. `sessions` holds one self-describing row per recording — what, where, when,
 * how many — so the picker can list recordings without reading a single tick. `chunks`
 * holds the ticks in batches keyed by `[sessionId, seq]`, so a replay can stream a session
 * in order without holding all of it in memory at once.
 *
 * Every call resolves rather than rejects. Recording is a convenience on a trading desk;
 * a browser in private mode with IndexedDB disabled should cost the trader the recorder,
 * never the desk.
 */

const log = createLogger('recordings')

/** The database and its stores. */
export const RECORDING_DB = 'stockz-recordings'
export const SESSION_STORE = 'sessions'
export const CHUNK_STORE = 'chunks'
export const DB_VERSION = 1

/**
 * Open (or create) the recordings database.
 *
 * @param {{factory?: IDBFactory}} [deps] - injectable IndexedDB.
 * @returns {Promise<IDBDatabase|null>} the database, or null when unavailable.
 */
export function openRecordingDb(deps = {}) {
  const factory = 'factory' in deps ? deps.factory : globalThis.indexedDB
  if (!factory?.open) return Promise.resolve(null)

  return new Promise((resolve) => {
    let request
    try {
      request = factory.open(RECORDING_DB, DB_VERSION)
    } catch (err) {
      log.warn(`recordings unavailable: ${err?.message ?? err}`)
      return resolve(null)
    }

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(SESSION_STORE)) {
        db.createObjectStore(SESSION_STORE, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(CHUNK_STORE)) {
        // Compound key so chunks of one session read back in the order they were written,
        // and a range query can stream exactly one session without scanning the rest.
        db.createObjectStore(CHUNK_STORE, { keyPath: ['sessionId', 'seq'] })
      }
    }
    // Resolved rather than rejected on failure, so no caller has to defend against an
    // exception on a path that is only ever a convenience.
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => {
      log.warn(`could not open ${RECORDING_DB}`)
      resolve(null)
    }
    request.onblocked = () => resolve(null)
  })
}

/**
 * Put one record into a store.
 *
 * @param {IDBDatabase} db - an open database.
 * @param {string} store - the store name.
 * @param {object} value - the record.
 * @returns {Promise<boolean>} true when it was written.
 */
export function putRecord(db, store, value) {
  if (!db?.transaction) return Promise.resolve(false)

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(store, 'readwrite')
      tx.objectStore(store).put(value)
      tx.oncomplete = () => resolve(true)
      tx.onerror = () => resolve(false)
      tx.onabort = () => resolve(false)
    } catch (err) {
      log.warn(`write failed: ${err?.message ?? err}`)
      resolve(false)
    }
  })
}

/**
 * Every recorded session, newest first.
 *
 * @param {IDBDatabase} db - an open database.
 * @returns {Promise<object[]>} the session rows.
 */
export function listSessions(db) {
  if (!db?.transaction) return Promise.resolve([])

  return new Promise((resolve) => {
    try {
      const request = db.transaction(SESSION_STORE, 'readonly').objectStore(SESSION_STORE).getAll()
      request.onsuccess = () => {
        const rows = Array.isArray(request.result) ? request.result : []
        // Newest first: the recording somebody wants is almost always the last one made.
        resolve(rows.sort((a, b) => Number(b?.startedAt ?? 0) - Number(a?.startedAt ?? 0)))
      }
      request.onerror = () => resolve([])
    } catch {
      resolve([])
    }
  })
}

/**
 * Read one session's chunks back in order.
 *
 * @param {IDBDatabase} db - an open database.
 * @param {string} sessionId - the session.
 * @returns {Promise<object[]>} the chunks, seq ascending.
 */
export function readChunks(db, sessionId) {
  if (!db?.transaction || !sessionId) return Promise.resolve([])

  return new Promise((resolve) => {
    try {
      const request = db.transaction(CHUNK_STORE, 'readonly').objectStore(CHUNK_STORE).getAll()
      request.onsuccess = () => {
        const rows = Array.isArray(request.result) ? request.result : []
        resolve(
          rows
            .filter((row) => String(row?.sessionId) === String(sessionId))
            .sort((a, b) => Number(a?.seq ?? 0) - Number(b?.seq ?? 0)),
        )
      }
      request.onerror = () => resolve([])
    } catch {
      resolve([])
    }
  })
}

/**
 * Delete a session and everything it recorded.
 *
 * @param {IDBDatabase} db - an open database.
 * @param {string} sessionId - the session.
 * @returns {Promise<boolean>} true when it is gone.
 */
export function deleteSession(db, sessionId) {
  if (!db?.transaction || !sessionId) return Promise.resolve(false)

  return new Promise((resolve) => {
    try {
      const tx = db.transaction([SESSION_STORE, CHUNK_STORE], 'readwrite')
      tx.objectStore(SESSION_STORE).delete(String(sessionId))

      // The chunks go with it in the same transaction. Deleting the row and leaving the
      // ticks would quietly fill the origin's quota with data nothing can ever reach.
      const chunks = tx.objectStore(CHUNK_STORE).getAll()
      chunks.onsuccess = () => {
        for (const row of chunks.result ?? []) {
          if (String(row?.sessionId) === String(sessionId)) {
            tx.objectStore(CHUNK_STORE).delete([row.sessionId, row.seq])
          }
        }
      }

      tx.oncomplete = () => resolve(true)
      tx.onerror = () => resolve(false)
      tx.onabort = () => resolve(false)
    } catch {
      resolve(false)
    }
  })
}
