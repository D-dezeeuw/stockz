import { createLogger } from '../utils/log.js'

/**
 * Where finished runs live.
 *
 * A backtest is worth keeping for exactly one reason: the run you want to compare against
 * is always the one you did twenty minutes ago, and it is gone the moment the block
 * repaints. So finished runs go to IndexedDB, keyed by run id, and survive a reload.
 *
 * Its own database rather than a store inside `stockz-recordings`: recordings are tens of
 * megabytes of ticks with a prune policy of their own, and a `deleteSession` that had to
 * know about runs — or a quota eviction that took the analysis with the tape — is a
 * coupling neither side benefits from.
 *
 * Every call resolves rather than rejects, exactly like `recordings.js`: archiving is a
 * convenience, and a browser in private mode should cost the trader the archive, never the
 * desk.
 */

const log = createLogger('bt-archive')

export const RUN_DB = 'stockz-backtests'
export const RUN_STORE = 'runs'
export const RUN_DB_VERSION = 1

/** Past this many archived runs the oldest are pruned on the next save. */
export const RUN_LIMIT = 100

/**
 * Open (or create) the runs database.
 *
 * @param {{factory?: IDBFactory}} [deps] - injectable IndexedDB.
 * @returns {Promise<IDBDatabase|null>} the database, or null when unavailable.
 */
export function openRunDb(deps = {}) {
  const factory = 'factory' in deps ? deps.factory : globalThis.indexedDB
  if (!factory?.open) return Promise.resolve(null)

  return new Promise((resolve) => {
    let request
    try {
      request = factory.open(RUN_DB, RUN_DB_VERSION)
    } catch (err) {
      log.warn(`archive unavailable: ${err?.message ?? err}`)
      return resolve(null)
    }

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(RUN_STORE)) db.createObjectStore(RUN_STORE, { keyPath: 'id' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => {
      log.warn(`could not open ${RUN_DB}`)
      resolve(null)
    }
    request.onblocked = () => resolve(null)
  })
}

/**
 * Strip a run down to what is worth keeping forever.
 *
 * @param {object} stats - a `summariseRun` result.
 * @param {{id?: string, at?: number, label?: string, seed?: number}} [meta] - the run's identity.
 * @returns {object|null} the record, or null without statistics.
 */
export function runRecord(stats, meta = {}) {
  if (!stats || typeof stats !== 'object') return null

  const id = String(meta.id ?? '') || `run-${(Number(meta.at) || 0).toString(36)}`

  return {
    id,
    at: Number(meta.at) || 0,
    label: String(meta.label ?? '') || `${String(stats.strategyId ?? 'run')} ${String(stats.instrument ?? '')}`.trim(),
    strategyId: String(stats.strategyId ?? ''),
    instrument: String(stats.instrument ?? ''),
    // The params, the fill assumptions and the seed together are the whole reproduction
    // recipe. A stored result missing any of them is a number nobody can get back to.
    params: stats.params ?? {},
    fillConfig: stats.fillConfig ?? {},
    seed: Number(meta.seed) || 0,
    trades: Number(stats.trades) || 0,
    net: Number(stats.net) || 0,
    expectancy: Number(stats.expectancy) || 0,
    winRate: Number(stats.winRate) || 0,
    maxDrawdown: Number(stats.maxDrawdown) || 0,
    profitFactor: Number.isFinite(stats.profitFactor) ? stats.profitFactor : 0,
    fees: Number(stats.fees) || 0,
    // The curve, not the trade list: the curve is what the comparison draws, and the
    // trades are megabytes that nothing on this screen reads.
    curve: Array.isArray(stats.curve) ? stats.curve : [],
  }
}

/**
 * Archive a finished run.
 *
 * @param {object} stats - a `summariseRun` result.
 * @param {object} [meta] - the run's identity.
 * @param {{db?: object}} [deps] - injectable database.
 * @returns {Promise<object|null>} the record written, or null.
 */
export async function saveRunResult(stats, meta = {}, deps = {}) {
  const record = runRecord(stats, meta)
  if (!record) return null

  const db = deps.db !== undefined ? deps.db : await openRunDb()
  if (!db?.transaction) return null

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(RUN_STORE, 'readwrite')
      tx.objectStore(RUN_STORE).put(record)
      tx.oncomplete = () => resolve(record)
      tx.onerror = () => resolve(null)
      tx.onabort = () => resolve(null)
    } catch (err) {
      log.warn(`archive write failed: ${err?.message ?? err}`)
      resolve(null)
    }
  })
}

/**
 * Every archived run, newest first.
 *
 * @param {{db?: object, limit?: number}} [deps] - injectable database.
 * @returns {Promise<object[]>} the records.
 */
export async function listRuns(deps = {}) {
  const db = deps.db !== undefined ? deps.db : await openRunDb()
  if (!db?.transaction) return []

  return new Promise((resolve) => {
    try {
      const request = db.transaction(RUN_STORE, 'readonly').objectStore(RUN_STORE).getAll()
      request.onsuccess = () => {
        const rows = Array.isArray(request.result) ? request.result : []
        // Newest first: the run somebody wants to compare against is almost always the
        // last one they did.
        resolve(
          rows
            .sort((a, b) => Number(b?.at ?? 0) - Number(a?.at ?? 0))
            .slice(0, Math.max(1, Math.floor(Number(deps.limit) || RUN_LIMIT))),
        )
      }
      request.onerror = () => resolve([])
    } catch {
      resolve([])
    }
  })
}

/**
 * Forget an archived run.
 *
 * @param {string} id - the run.
 * @param {{db?: object}} [deps] - injectable database.
 * @returns {Promise<boolean>} true when it is gone.
 */
export async function deleteRun(id, deps = {}) {
  const runId = String(id ?? '')
  if (!runId) return false

  const db = deps.db !== undefined ? deps.db : await openRunDb()
  if (!db?.transaction) return false

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(RUN_STORE, 'readwrite')
      tx.objectStore(RUN_STORE).delete(runId)
      tx.oncomplete = () => resolve(true)
      tx.onerror = () => resolve(false)
      tx.onabort = () => resolve(false)
    } catch {
      resolve(false)
    }
  })
}
