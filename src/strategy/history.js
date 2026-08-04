import { createRing } from '../pipeline/ring.js'
import { DIR } from './signal.js'

/**
 * What each strategy actually said, and when.
 *
 * The question that matters after a bad trade is not "what is the strategy saying now" but
 * "what was it saying when I clicked". Live state cannot answer that — it holds one signal
 * per run and overwrites it every tick. So every emission is appended to a bounded ring.
 *
 * Bounded per run rather than one shared log: a chatty strategy on a fast instrument would
 * otherwise evict a quiet strategy's entire history within a minute, and the quiet one's
 * three signals a day are exactly the ones somebody will want to look up.
 */

/** Signals kept per run. A session's worth of scalping, not a career. */
export const SIGNAL_HISTORY = 512

/** Rings by run key. */
const rings = new Map()

/**
 * The ring for one run, created on demand.
 *
 * @param {string} runKey - the run.
 * @returns {object|null} the ring.
 */
export function createSignalRing(runKey) {
  const key = String(runKey ?? '')
  if (!key) return null

  if (!rings.has(key)) rings.set(key, createRing(SIGNAL_HISTORY))
  return rings.get(key)
}

/**
 * Remember one emission.
 *
 * @param {string} runKey - the run.
 * @param {object} signal - the normalised signal.
 * @returns {object} the signal.
 */
export function appendSignal(runKey, signal) {
  const ring = createSignalRing(runKey)
  // A repeat of the same call is not news. Without this a strategy holding an opinion for
  // ten seconds fills its whole history with one decision and evicts the ten before it.
  const last = ring?.last()
  if (ring && !(last && last.dir === signal?.dir && last.reason === signal?.reason)) {
    ring.push(signal)
  }

  return signal
}

/**
 * One run's history as plain data.
 *
 * @param {string} runKey - the run.
 * @param {number} [limit] - at most this many, newest-biased.
 * @returns {object[]} oldest first.
 */
export function snapshotRing(runKey, limit) {
  const ring = rings.get(String(runKey ?? ''))
  return ring ? ring.toArray(limit) : []
}

/**
 * What a run has been saying.
 *
 * @param {object[]} snapshot - the history.
 * @returns {{long: number, short: number, flat: number, total: number, lastTs: number}} the tallies.
 */
export function ringStats(snapshot) {
  const rows = Array.isArray(snapshot) ? snapshot : []
  let long = 0
  let short = 0
  let flat = 0
  let lastTs = 0

  for (const row of rows) {
    const dir = Number(row?.dir) || DIR.FLAT
    if (dir === DIR.LONG) long += 1
    else if (dir === DIR.SHORT) short += 1
    else flat += 1

    const ts = Number(row?.ts) || 0
    if (ts > lastTs) lastTs = ts
  }

  return { long, short, flat, total: rows.length, lastTs }
}

/**
 * History for the journal.
 *
 * @param {{runKey?: string, from?: number, to?: number, limit?: number}} [query] - the filter.
 * @returns {object[]} matching signals, oldest first.
 */
export function exportSignals(query = {}) {
  const keys = query.runKey ? [String(query.runKey)] : [...rings.keys()]
  const from = Number(query.from)
  const to = Number(query.to)

  const rows = keys.flatMap((key) =>
    snapshotRing(key).map((signal) => ({ ...signal, runKey: key })),
  )

  const filtered = rows.filter((row) => {
    const ts = Number(row?.ts) || 0
    if (Number.isFinite(from) && ts < from) return false
    return !(Number.isFinite(to) && ts > to)
  })

  // Sorted across runs: the journal reads this as one timeline, and two runs interleaved
  // by insertion order would be a timeline only by accident.
  filtered.sort((a, b) => (Number(a.ts) || 0) - (Number(b.ts) || 0))
  const limit = Number(query.limit)

  return Number.isFinite(limit) && limit > 0 ? filtered.slice(-limit) : filtered
}

/**
 * Forget every run's history.
 *
 * @returns {boolean} true.
 */
export function resetHistory() {
  rings.clear()
  return true
}
