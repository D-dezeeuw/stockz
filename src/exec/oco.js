import { oppositeLeg } from './bracket.js'

/**
 * One-cancels-other.
 *
 * A take-profit and a stop are both live, both real, and exactly one of them should ever
 * fill. The moment one does, the other stops being protection and becomes an unhedged
 * order sitting in the market — a stop that survives its take-profit will happily open a
 * new position in the opposite direction the next time price touches it.
 *
 * So the sibling lookup is a Map, not a scan: this runs on the fill path, where every
 * millisecond between the fill and the cancel is a millisecond of exposure nobody chose.
 */

/** id -> sibling id, both directions. */
const siblings = new Map()

/** pair id -> {aId, bId, status}. */
const pairs = new Map()

/**
 * Link two working orders as a pair.
 *
 * @param {string} aId - one client order id.
 * @param {string} bId - the other.
 * @param {{pairId?: string}} [meta] - the pair's own id.
 * @returns {{ok: boolean, pairId: string, reason: string}} the link.
 */
export function linkOco(aId, bId, meta = {}) {
  const a = String(aId ?? '')
  const b = String(bId ?? '')
  if (!a || !b) return { ok: false, pairId: '', reason: 'two ids required' }
  if (a === b) return { ok: false, pairId: '', reason: 'cannot pair with itself' }

  const pairId = String(meta.pairId ?? `oco-${a}-${b}`)
  siblings.set(a, b)
  siblings.set(b, a)
  pairs.set(pairId, { pairId, aId: a, bId: b, status: 'working' })

  return { ok: true, pairId, reason: '' }
}

/**
 * The sibling of an order.
 *
 * @param {string} id - a client order id.
 * @returns {string} the sibling's id, or '' when unpaired.
 */
export function siblingOf(id) {
  return siblings.get(String(id ?? '')) ?? ''
}

/**
 * Resolve what a fill means for a pair.
 *
 * @param {string} id - the id that filled.
 * @param {{filled?: number, size?: number}} [detail] - the fill.
 * @returns {{action: string, target: string, size: number}} what to do about the sibling.
 */
export function resolveFill(id, detail = {}) {
  const target = siblingOf(id)
  if (!target) return { action: 'none', target: '', size: 0 }

  const filled = Number(detail.filled) || 0
  const size = Number(detail.size) || 0

  // A partial fill shrinks the sibling rather than killing it: the remainder of the
  // position still needs protecting, and cancelling would leave it naked.
  if (size > 0 && filled > 0 && filled < size) {
    return { action: 'amend', target, size: Number((size - filled).toFixed(8)) }
  }

  return { action: 'cancel', target, size: 0 }
}

/**
 * Interpret a cancel that failed because the order had already filled.
 *
 * @param {string} pairId - the pair.
 * @param {{reason?: string}} error - why the cancel failed.
 * @returns {{raced: boolean, status: string}} the reading.
 */
export function resolveOcoRace(pairId, error) {
  const reason = String(error?.reason ?? error?.message ?? '').toLowerCase()
  // Both legs filling in the same instant is not an error state: the cancel lost a race
  // it was always going to lose sometimes, and both fills are real and must be booked.
  const raced = reason.includes('filled') || reason.includes('not exist') || reason.includes('51400')

  const pair = pairs.get(String(pairId ?? ''))
  const status = raced ? 'both-filled' : 'cancel-failed'
  if (pair) pairs.set(pair.pairId, { ...pair, status })

  return { raced, status }
}

/**
 * Close a pair out.
 *
 * @param {string} pairId - the pair.
 * @param {string} [status] - how it ended.
 * @returns {object|null} the closed record.
 */
export function closePair(pairId, status = 'closed') {
  const pair = pairs.get(String(pairId ?? ''))
  if (!pair) return null

  siblings.delete(pair.aId)
  siblings.delete(pair.bId)
  const closed = { ...pair, status: String(status) }
  pairs.set(pair.pairId, closed)

  return closed
}

/**
 * Link a bracket's exits as a pair.
 *
 * @param {object} bracket - an expanded bracket.
 * @returns {{ok: boolean, pairId: string, reason: string}} the link.
 */
export function linkBracketExits(bracket) {
  const tp = bracket?.tp
  const sl = bracket?.sl
  if (!tp || !sl) return { ok: false, pairId: '', reason: 'bracket has one exit' }

  // Routed through `oppositeLeg` so the bracket stays the single description of which
  // leg opposes which, rather than that knowledge being restated here.
  const opposite = oppositeLeg(bracket, 'tp')
  return linkOco(tp.clientId, opposite?.clientId, { pairId: `oco-${bracket.id}` })
}

/** @returns {object[]} every pair the engine knows about. */
export function allPairs() {
  return [...pairs.values()]
}

/** Forget every pair — a reconnect rebuilds them from the venue's open orders. */
export function resetOco() {
  siblings.clear()
  pairs.clear()
  return true
}
