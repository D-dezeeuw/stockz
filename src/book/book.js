/**
 * Book state — snapshots, deltas, and proving the result is still correct.
 *
 * A depth book maintained by deltas is the one structure on the desk that can go
 * *silently* wrong. A dropped update does not throw; it leaves a level at a size nobody
 * is resting anymore, and the ladder keeps rendering it confidently. Someone then sizes
 * an entry against liquidity that is not there.
 *
 * So this module does not trust itself: OKX sends a CRC32 over the top 25 levels with
 * every frame, and every applied update is checked against it. A mismatch or a sequence
 * gap is not repaired in place — it triggers a resubscribe, because a book that has been
 * wrong once cannot be reasoned about, only replaced.
 */

/** Levels OKX includes in its checksum. */
export const CHECKSUM_DEPTH = 25

/** An empty book. */
export function emptyBook() {
  return { bids: [], asks: [], seqId: 0, ts: 0, checksum: 0, valid: true }
}

/**
 * Replace the book from a snapshot frame.
 *
 * @param {{bids?: Array, asks?: Array, seqId?: number, ts?: number,
 *   checksum?: number}} frame - the snapshot.
 * @returns {object} the new book.
 */
export function applySnapshot(frame) {
  return {
    bids: sortSide(frame?.bids, 'bid'),
    asks: sortSide(frame?.asks, 'ask'),
    seqId: Number(frame?.seqId) || 0,
    ts: Number(frame?.ts) || 0,
    checksum: Number(frame?.checksum) || 0,
    valid: true,
  }
}

/**
 * Apply a delta frame to a book.
 *
 * @param {object} book - the current book.
 * @param {{bids?: Array, asks?: Array, seqId?: number, prevSeqId?: number,
 *   ts?: number, checksum?: number}} frame - the update.
 * @returns {object} the new book.
 */
export function applyUpdate(book, frame) {
  const current = book ?? emptyBook()

  return {
    bids: mergeSide(current.bids, frame?.bids, 'bid'),
    asks: mergeSide(current.asks, frame?.asks, 'ask'),
    seqId: Number(frame?.seqId) || current.seqId,
    ts: Number(frame?.ts) || current.ts,
    checksum: Number(frame?.checksum) || 0,
    valid: current.valid !== false,
  }
}

/**
 * Merge delta levels into one side, preserving sort order.
 *
 * @param {Array} levels - the current side.
 * @param {Array} deltas - incoming levels.
 * @param {string} side - 'bid' or 'ask'.
 * @returns {Array<[number, number]>} the new side.
 */
export function mergeSide(levels, deltas, side) {
  const map = new Map(sortSide(levels, side).map(([px, sz]) => [px, sz]))

  for (const level of Array.isArray(deltas) ? deltas : []) {
    const px = Number(Array.isArray(level) ? level[0] : level?.px)
    const sz = Number(Array.isArray(level) ? level[1] : level?.sz)
    if (!Number.isFinite(px) || !Number.isFinite(sz)) continue

    // Size zero is a deletion, not a level resting zero — leaving it in would show
    // depth at a price nobody is quoting.
    if (sz <= 0) map.delete(px)
    else map.set(px, sz)
  }

  return sortSide([...map.entries()], side)
}

/**
 * Normalise and sort one side of a book.
 *
 * @param {Array} levels - raw levels, pairs or objects.
 * @param {string} side - 'bid' (descending) or 'ask' (ascending).
 * @returns {Array<[number, number]>} sorted price/size pairs.
 */
export function sortSide(levels, side) {
  return (Array.isArray(levels) ? levels : [])
    .map((level) => [
      Number(Array.isArray(level) ? level[0] : level?.px),
      Number(Array.isArray(level) ? level[1] : level?.sz),
    ])
    .filter(([px, sz]) => Number.isFinite(px) && Number.isFinite(sz) && sz > 0)
    .sort((a, b) => (side === 'bid' ? b[0] - a[0] : a[0] - b[0]))
}

/**
 * CRC32 over a string, per the standard IEEE polynomial OKX uses.
 *
 * @param {string} input - the checksum string.
 * @returns {number} the signed 32-bit checksum, matching OKX's `cs` field.
 */
export function crc32(input) {
  const text = String(input ?? '')
  let crc = -1

  for (let i = 0; i < text.length; i += 1) {
    crc ^= text.charCodeAt(i) & 0xff
    for (let bit = 0; bit < 8; bit += 1) {
      // 0xedb88320 is the reversed IEEE polynomial — the same one zlib uses, which is
      // what OKX's `cs` is computed with.
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1
    }
  }

  // OKX publishes the checksum as a *signed* 32-bit int, so the comparison must be made
  // in the same space rather than against an unsigned value that will never match.
  return ~crc | 0
}

/**
 * The string OKX computes its checksum over: alternating bid and ask levels,
 * `price:size` joined by colons, top 25 a side.
 *
 * @param {object} book - the book.
 * @param {number} [depth] - levels per side.
 * @returns {string} the checksum input.
 */
export function checksumString(book, depth = CHECKSUM_DEPTH) {
  const bids = sortSide(book?.bids, 'bid').slice(0, depth)
  const asks = sortSide(book?.asks, 'ask').slice(0, depth)
  const parts = []

  for (let i = 0; i < Math.max(bids.length, asks.length); i += 1) {
    // Alternating, not concatenated: OKX interleaves bid then ask per rank, and a book
    // checksummed the other way round never matches even when it is perfectly correct.
    if (bids[i]) parts.push(`${format(bids[i][0])}:${format(bids[i][1])}`)
    if (asks[i]) parts.push(`${format(asks[i][0])}:${format(asks[i][1])}`)
  }

  return parts.join(':')
}

/**
 * Format a number the way the venue serialised it.
 *
 * @param {number} value - price or size.
 * @returns {string} the string form.
 */
function format(value) {
  return String(value)
}

/**
 * Whether a book still matches the checksum the venue sent with it.
 *
 * @param {object} book - the book.
 * @param {number} [expected] - the venue's checksum; defaults to the book's own.
 * @returns {boolean} true when they agree.
 */
export function verifyChecksum(book, expected = book?.checksum) {
  const cs = Number(expected)
  // No checksum on the frame is not a failure: OKX omits it on some channels, and
  // treating "not stated" as "wrong" would resubscribe in a loop.
  if (!Number.isFinite(cs) || cs === 0) return true

  return crc32(checksumString(book)) === cs
}

/**
 * Whether a frame skipped an update.
 *
 * @param {object} book - the current book.
 * @param {{prevSeqId?: number, seqId?: number}} frame - the incoming frame.
 * @returns {boolean} true when an update was missed.
 */
export function hasSeqGap(book, frame) {
  const prev = Number(frame?.prevSeqId)
  const held = Number(book?.seqId)
  if (!Number.isFinite(prev) || !Number.isFinite(held) || held === 0) return false

  // OKX repeats the last seqId on a heartbeat frame; that is continuity, not a gap.
  return prev !== held
}

/**
 * Apply a frame and decide whether the book can still be trusted.
 *
 * @param {object} book - the current book.
 * @param {{action?: string}} frame - snapshot or update frame.
 * @returns {{book: object, resync: boolean, reason: string}} the outcome.
 */
export function ingestFrame(book, frame) {
  if (frame?.action === 'snapshot' || !book || book.seqId === 0) {
    const next = applySnapshot(frame)
    return { book: next, resync: false, reason: '' }
  }

  if (hasSeqGap(book, frame)) {
    // A gap is unrecoverable by definition — the missing delta is gone. Mark the book
    // invalid so the ladder can show it is stale while the resubscribe lands.
    return { book: { ...book, valid: false }, resync: true, reason: 'seq-gap' }
  }

  const next = applyUpdate(book, frame)
  if (!verifyChecksum(next)) {
    return { book: { ...next, valid: false }, resync: true, reason: 'checksum' }
  }

  return { book: next, resync: false, reason: '' }
}
