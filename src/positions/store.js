import { setValue } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { makePosition, applyFill, unrealizedPnl, sideOf, DUST } from './math.js'
import { splitSymbol } from '../lists/ops.js'
import { appendRealization, flushLedger } from './ledger.js'
import { onJournalFill } from '../journal/pairing.js'

/**
 * The positions book.
 *
 * Held outside the reactive tree and flushed per frame, like every other hot store here:
 * a burst of fills is one repaint, not twenty. What is different about this one is that
 * being *stale* is not acceptable — an order list a frame behind is cosmetic, a position
 * a frame behind is a risk number someone might size against — so every fill updates the
 * book synchronously and only the *publish* is batched.
 */

/** key -> position. */
const book = new Map()

/** Keys touched since the last flush. */
let dirty = new Set()

/**
 * The slot a venue and instrument share.
 *
 * @param {string} venue - the venue.
 * @param {string} instrument - the instrument.
 * @returns {string} the key, e.g. 'okx:BTC-USDT'.
 */
export function positionKey(venue, instrument) {
  const raw = String(instrument ?? '')
  // A qualified symbol carries its own venue; taking it from there stops the same
  // position living in two slots depending on which caller wrote it.
  const { venue: fromSymbol, symbol } = splitSymbol(raw)
  const v = String(venue || fromSymbol || '').toLowerCase()
  const i = (symbol || raw).toUpperCase()

  return v && i ? `${v}:${i}` : ''
}

/**
 * The position in a slot, or a flat one.
 *
 * @param {string} key - the position key.
 * @returns {object} the position.
 */
export function positionFor(key) {
  const id = String(key ?? '')
  if (book.has(id)) return book.get(id)

  const [venue, instrument] = id.split(':')
  return makePosition({ venue: venue ?? '', instrument: instrument ?? '' })
}

/**
 * Write a position into the book, pruning it when flat.
 *
 * @param {string} key - the position key.
 * @param {object} position - the record.
 * @returns {object|null} the stored position, or null when it was pruned.
 */
export function upsertPosition(key, position) {
  const id = String(key ?? '')
  if (!id) return null

  // A flat position is not a position. Keeping zero-quantity rows would put the whole
  // session's history in the risk view and make "am I flat?" a reading exercise.
  if (Math.abs(Number(position?.qty) || 0) < DUST) {
    book.delete(id)
    dirty.add(id)
    return null
  }

  const stored = { ...makePosition(position), key: id }
  book.set(id, stored)
  dirty.add(id)

  return stored
}

/**
 * Apply a fill to the book.
 *
 * @param {{venue?: string, instrument?: string, symbol?: string, side?: string,
 *   qty?: number, px?: number, fee?: number, ts?: number}} fill - the fill.
 * @returns {{key: string, position: object|null, realized: number}} what changed.
 */
export function ingestFill(fill) {
  const key = positionKey(fill?.venue, fill?.instrument ?? fill?.symbol)
  if (!key) return { key: '', position: null, realized: 0 }

  // The sign is the position's language; sides are the venue's. Converting once here
  // means nothing downstream has to remember which convention it is holding.
  const magnitude = Math.abs(Number(fill?.qty) || 0)
  const signed = String(fill?.side ?? '').toLowerCase() === 'sell' ? -magnitude : magnitude

  const { position, realized } = applyFill(positionFor(key), {
    qty: signed,
    px: fill?.px,
    fee: fill?.fee,
    ts: fill?.ts,
  })

  // And into the journal, off the same fill. Fed here rather than from a watch on the
  // published book: the journal pairs *executions*, and a frame-batched position snapshot
  // has already averaged away the two fills a scale-out is made of.
  onJournalFill({
    id: fill?.id ?? fill?.fillId,
    venue: fill?.venue,
    instrument: key,
    qty: signed,
    px: fill?.px,
    intentPx: fill?.intentPx,
    fee: fill?.fee,
    ts: fill?.ts,
  })

  // A close is booked the moment it happens: the ledger is the session's only honest
  // scoreboard, and reconstructing it later from order history is a different, worse job.
  if (realized !== 0) {
    appendRealization({
      instrument: key,
      amount: realized,
      fee: fill?.fee,
      ts: fill?.ts,
      qty: magnitude,
    })
  }

  return { key, position: upsertPosition(key, position), realized }
}

/**
 * Mark a position to a price.
 *
 * @param {string} key - the position key.
 * @param {number} mark - the current price.
 * @returns {object|null} the position, or null when there is none.
 */
export function markPosition(key, mark) {
  const held = book.get(String(key ?? ''))
  const price = Number(mark)
  if (!held || !Number.isFinite(price) || price <= 0) return null

  const marked = { ...held, mark: price }
  book.set(held.key, marked)
  dirty.add(held.key)

  return marked
}

/**
 * Every open position, with its live P&L.
 *
 * @returns {object[]} the rows.
 */
export function openPositions() {
  return [...book.values()].map((position) => ({
    ...position,
    side: sideOf(position.qty),
    unrealized: unrealizedPnl(position, position.mark),
  }))
}

/**
 * Total absolute exposure at the marks currently held.
 *
 * @returns {number} gross exposure in quote currency.
 */
export function grossExposure() {
  let total = 0
  for (const position of book.values()) {
    // Marked where a mark exists, at entry where it does not: exposure is a risk number,
    // and a position with no tick yet still has size on it.
    total += Math.abs(position.qty) * (position.mark || position.avgPx || 0)
  }

  return Number(total.toFixed(8))
}

/**
 * The desk's totals.
 *
 * @returns {{unrealized: number, realized: number, fees: number, count: number}} totals.
 */
export function pnlTotals() {
  let unrealized = 0
  let realized = 0
  let fees = 0

  for (const position of book.values()) {
    unrealized += unrealizedPnl(position, position.mark)
    realized += position.realized
    fees += position.fees
  }

  return {
    unrealized: Number(unrealized.toFixed(8)),
    realized: Number(realized.toFixed(8)),
    fees: Number(fees.toFixed(8)),
    count: book.size,
  }
}

/**
 * Publish the book into state. Called once per frame, never per fill.
 *
 * @returns {boolean} true when a write happened.
 */
export function flushPositions() {
  if (dirty.size === 0) return false
  dirty = new Set()

  const rows = openPositions()
  setValue(PATHS.trade.positions, rows)
  setValue(PATHS.trade.pnl, pnlTotals())
  flushLedger()

  return true
}

/** Empty the book. */
export function resetPositions() {
  book.clear()
  dirty = new Set()
  return true
}
