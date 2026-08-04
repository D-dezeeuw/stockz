import { fetchPositions } from '../venues/okx/rest.js'
import { openPositions, upsertPosition, positionKey } from './store.js'
import { pushToast } from '../ui/toast.js'
import { createLogger } from '../utils/log.js'

const log = createLogger('reconcile')

/**
 * Reconciliation.
 *
 * The local book is derived from fills the desk *saw*. A dropped WebSocket, a fill from
 * another session, or a liquidation the venue performed on its own all produce a book
 * that is confidently wrong — and a wrong position is the one error here that compounds,
 * because every subsequent size decision is made against it.
 *
 * So the venue is the authority, always. Drift is never averaged, negotiated, or assumed
 * to be a timing artefact: the venue's number replaces the local one, and the difference
 * is reported so someone can find out why.
 */

/** Below this, a difference is float noise rather than drift. */
export const DRIFT_EPSILON = 1e-6

/**
 * Compare the local book against a venue snapshot.
 *
 * @param {object[]} local - the desk's positions.
 * @param {object[]} remote - the venue's positions.
 * @param {string} venue - which venue the snapshot is from.
 * @returns {{drifted: object[], missingLocal: object[], missingRemote: object[]}} the diff.
 */
export function diffPositions(local, remote, venue = 'okx') {
  const mine = new Map(
    (Array.isArray(local) ? local : [])
      .filter((p) => String(p?.venue ?? '') === venue)
      .map((p) => [positionKey(p.venue, p.instrument), p]),
  )
  const theirs = new Map(
    (Array.isArray(remote) ? remote : []).map((p) => [
      positionKey(venue, p?.instrument ?? p?.instId ?? p?.symbol),
      p,
    ]),
  )

  const drifted = []
  const missingRemote = []

  for (const [key, position] of mine) {
    const other = theirs.get(key)
    // A position the venue has never heard of is not drift, it is a position that does
    // not exist — usually a fill the desk booked from an order that was later rejected.
    if (!other) {
      missingRemote.push({ key, local: Number(position.qty) || 0, remote: 0 })
      continue
    }

    const localQty = Number(position.qty) || 0
    const remoteQty = Number(other.qty ?? other.pos ?? 0) || 0
    if (Math.abs(localQty - remoteQty) > DRIFT_EPSILON) {
      drifted.push({ key, local: localQty, remote: remoteQty, instrument: position.instrument })
    }
  }

  // The dangerous direction: the venue holds something this desk does not know about, so
  // nothing is protecting it and no risk check has ever seen it.
  const missingLocal = [...theirs.keys()]
    .filter((key) => !mine.has(key))
    .map((key) => ({ key, local: 0, remote: Number(theirs.get(key)?.qty ?? theirs.get(key)?.pos ?? 0) || 0 }))

  return { drifted, missingLocal, missingRemote }
}

/**
 * Adopt the venue's numbers.
 *
 * @param {{drifted: object[], missingLocal: object[], missingRemote: object[]}} diff - the diff.
 * @param {object[]} remote - the venue snapshot, for entry prices.
 * @param {string} venue - the venue.
 * @returns {number} how many slots were corrected.
 */
export function adoptVenueTruth(diff, remote, venue = 'okx') {
  const byKey = new Map(
    (Array.isArray(remote) ? remote : []).map((p) => [
      positionKey(venue, p?.instrument ?? p?.instId ?? p?.symbol),
      p,
    ]),
  )

  const rows = [...(diff?.drifted ?? []), ...(diff?.missingLocal ?? []), ...(diff?.missingRemote ?? [])]
  let corrected = 0

  for (const row of rows) {
    const source = byKey.get(row.key)
    const [v, instrument] = row.key.split(':')
    // The venue's number replaces the local one outright. Averaging the two, or waiting
    // to see whether it settles, leaves the desk sizing against a number it invented.
    upsertPosition(row.key, {
      venue: v,
      instrument,
      qty: Number(source?.qty ?? source?.pos ?? 0) || 0,
      avgPx: Number(source?.avgPx ?? source?.avgEntry ?? 0) || 0,
      realized: 0,
      fees: 0,
    })
    corrected += 1
  }

  return corrected
}

/**
 * Reconcile the book against a venue.
 *
 * @param {{fetch?: Function, venue?: string, now?: () => number}} [deps] - injectable
 *   snapshot source.
 * @returns {Promise<{ok: boolean, corrected: number, reason: string}>} the outcome.
 */
export async function reconcile(deps = {}) {
  const { fetch = fetchPositions, venue = 'okx', now = () => Date.now() } = deps

  const snapshot = await fetch().catch((error) => ({ ok: false, error }))
  // A failed snapshot changes nothing. Treating "I could not ask" as "there is nothing
  // there" would flatten the book on every network hiccup.
  if (!snapshot?.ok) return { ok: false, corrected: 0, reason: 'snapshot failed' }

  const diff = diffPositions(openPositions(), snapshot.positions, venue)
  const corrected = adoptVenueTruth(diff, snapshot.positions, venue)

  if (corrected > 0) {
    log.warn(`position drift corrected on ${corrected} instrument(s)`)
    pushToast(`position drift: ${corrected} corrected from ${venue}`, 'warn', now())
  }

  return { ok: true, corrected, reason: '' }
}

/**
 * Reconcile on a timer.
 *
 * @param {{everyMs?: number, timer?: object, run?: Function}} [options] - the schedule.
 * @returns {() => void} stop.
 */
export function startReconciler(options = {}) {
  const { everyMs = 30000, timer = globalThis, run = reconcile } = options
  if (typeof timer?.setInterval !== 'function') return () => {}

  // Every thirty seconds: often enough that drift is caught inside a scalp's lifetime,
  // rare enough that it costs nothing on the rate limit.
  const handle = timer.setInterval(() => run(), Math.max(1000, Number(everyMs) || 30000))
  return () => timer.clearInterval?.(handle)
}
