/**
 * Client order ids, and the reconnect that must not double an order.
 *
 * A reconnect is the dangerous moment: the desk knows what it *sent*, the venue knows
 * what it *has*, and any resubmit logic that does not reconcile the two produces a
 * doubled position — the one bug in this codebase that costs real money silently.
 *
 * The registry makes reuse impossible in O(1), and the dedupe makes the reconciliation
 * a set difference rather than a judgement call.
 */

/** Ids this session has issued. */
const issued = new Set()

/** Monotonic counter behind the id. */
let counter = 0

/** The session's prefix, stable for the life of the tab. */
let prefix = 'stkz'

/**
 * Set the session prefix.
 *
 * @param {string} value - a short alphanumeric prefix.
 * @returns {string} the prefix now in use.
 */
export function setPrefix(value) {
  const clean = String(value ?? '').replace(/[^a-z0-9]/gi, '').slice(0, 8)
  if (clean) prefix = clean

  return prefix
}

/**
 * Issue a client order id.
 *
 * @param {number} now - epoch milliseconds.
 * @returns {string} a unique, sortable id.
 */
export function issueId(now) {
  counter = (counter + 1) % 1e6
  const stamp = Math.max(0, Math.floor(Number(now) || 0)).toString(36)
  const id = `${prefix}${stamp}${counter.toString(36).padStart(4, '0')}`

  issued.add(id)
  return id
}

/**
 * Whether an id has already been used this session.
 *
 * @param {string} id - the candidate id.
 * @returns {boolean} true when it is a reuse.
 */
export function isReused(id) {
  return issued.has(String(id ?? ''))
}

/**
 * Claim an externally supplied id.
 *
 * @param {string} id - the id.
 * @returns {{ok: boolean, reason: string}} whether it was free.
 */
export function claimId(id) {
  const key = String(id ?? '')
  if (!key) return { ok: false, reason: 'no id' }
  // Rejected before any network call: a duplicate id at the venue is either a rejection
  // or, worse, a second order.
  if (issued.has(key)) return { ok: false, reason: 'duplicate id' }

  issued.add(key)
  return { ok: true, reason: '' }
}

/**
 * Decide what to resubmit after a reconnect.
 *
 * @param {object[]} pending - what the desk believes is working.
 * @param {object[]} openAtVenue - the venue's open-orders snapshot.
 * @returns {{resubmit: object[], alreadyLive: string[], orphans: string[]}} the plan.
 */
export function dedupeOnReconnect(pending, openAtVenue) {
  const mine = Array.isArray(pending) ? pending : []
  const theirs = new Set(
    (Array.isArray(openAtVenue) ? openAtVenue : [])
      .map((order) => String(order?.clOrdId ?? order?.clientId ?? ''))
      .filter(Boolean),
  )

  const resubmit = mine.filter((order) => !theirs.has(String(order?.clientId ?? '')))
  const alreadyLive = mine
    .filter((order) => theirs.has(String(order?.clientId ?? '')))
    .map((order) => String(order.clientId))

  // Orphans are the other half of the reconciliation: orders the venue holds that this
  // session did not send. They are usually another tab, and adopting them silently would
  // let two desks fight over the same position.
  const known = new Set(mine.map((order) => String(order?.clientId ?? '')))
  const orphans = [...theirs].filter((id) => !known.has(id))

  return { resubmit, alreadyLive, orphans }
}

/** Forget every issued id. */
export function resetIds() {
  issued.clear()
  counter = 0
  prefix = 'stkz'
  return true
}
