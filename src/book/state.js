import { setValue } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { emptyBook, ingestFrame } from './book.js'

/**
 * The live book, and the resync it asks for when it stops being trustworthy.
 *
 * The book itself is held **outside** Spektrum state and flushed in on a frame, for the
 * same reason ticks are: OKX sends depth deltas faster than a screen refreshes, and
 * writing every one into the reactive tree would re-derive the ladder hundreds of times
 * a second to show frames nobody can see.
 *
 * `onResync` is the one escape hatch. A book that failed its checksum cannot be repaired
 * from the deltas it already has — the caller (the socket client) resubscribes, and the
 * next snapshot replaces it wholesale.
 */

/** symbol -> book. */
const books = new Map()
let resyncHandler = null
let pending = new Set()

/**
 * Apply a depth frame for a symbol.
 *
 * @param {string} symbol - instrument.
 * @param {object} frame - snapshot or update frame.
 * @returns {{book: object, resync: boolean, reason: string}} the outcome.
 */
export function applyBookFrame(symbol, frame) {
  const key = String(symbol ?? '')
  if (!key) return { book: emptyBook(), resync: false, reason: '' }

  const outcome = ingestFrame(books.get(key) ?? null, frame)
  books.set(key, outcome.book)
  pending.add(key)

  // The resync fires immediately rather than on the next flush: every frame applied to a
  // book already known to be wrong is a frame spent making it wronger.
  if (outcome.resync && typeof resyncHandler === 'function') {
    resyncHandler(key, outcome.reason)
  }
  return outcome
}

/**
 * The current book for a symbol.
 *
 * @param {string} symbol - instrument.
 * @returns {object} the book, empty if none has arrived.
 */
export function bookFor(symbol) {
  return books.get(String(symbol ?? '')) ?? emptyBook()
}

/**
 * Write the focused symbol's book into state. Called once per frame, never per delta.
 *
 * @param {string} focus - the instrument the desk is focused on.
 * @returns {boolean} true when a write happened.
 */
export function flushBook(focus) {
  const key = String(focus ?? '')
  if (!key || !pending.has(key)) return false

  pending = new Set()
  setValue(PATHS.market.book, bookFor(key))
  return true
}

/**
 * Register the handler that resubscribes a damaged book.
 *
 * @param {(symbol: string, reason: string) => unknown} handler - the resync callback.
 * @returns {() => void} unregister.
 */
export function onResync(handler) {
  resyncHandler = typeof handler === 'function' ? handler : null
  return () => {
    resyncHandler = null
  }
}

/** Forget every book. */
export function resetBooks() {
  books.clear()
  pending = new Set()
  resyncHandler = null
}
