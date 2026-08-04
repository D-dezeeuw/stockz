import { describe, it, expect } from 'vitest'
import {
  emptyBook,
  applySnapshot,
  applyUpdate,
  mergeSide,
  sortSide,
  crc32,
  checksumString,
  verifyChecksum,
  hasSeqGap,
  ingestFrame,
  CHECKSUM_DEPTH,
} from './book.js'

describe('emptyBook', () => {
  it('starts valid and empty, so a fresh subscribe has something to merge into', () => {
    expect(emptyBook()).toEqual({
      bids: [],
      asks: [],
      seqId: 0,
      ts: 0,
      checksum: 0,
      valid: true,
    })
    // A fresh object each call — two books must never share an array.
    expect(emptyBook().bids).not.toBe(emptyBook().bids)
  })
})

describe('sortSide', () => {
  it('sorts bids down and asks up, dropping levels nobody is quoting', () => {
    expect(sortSide([[100, 1], [102, 2], [101, 3]], 'bid')).toEqual([
      [102, 2],
      [101, 3],
      [100, 1],
    ])
    expect(sortSide([[102, 2], [100, 1]], 'ask')).toEqual([
      [100, 1],
      [102, 2],
    ])

    // Objects read the same as pairs; zero and junk sizes are not levels.
    expect(sortSide([{ px: 5, sz: 1 }, { px: 6, sz: 0 }, { px: 'x', sz: 1 }], 'ask')).toEqual([
      [5, 1],
    ])
    expect(sortSide(null, 'bid')).toEqual([])
  })
})

describe('applySnapshot', () => {
  it('replaces the book wholesale and marks it trustworthy again', () => {
    const book = applySnapshot({
      bids: [[100, 1], [101, 2]],
      asks: [[103, 1], [102, 4]],
      seqId: 7,
      ts: 1234,
      checksum: -42,
    })

    expect(book.bids).toEqual([[101, 2], [100, 1]])
    expect(book.asks).toEqual([[102, 4], [103, 1]])
    expect(book).toMatchObject({ seqId: 7, ts: 1234, checksum: -42, valid: true })

    expect(applySnapshot(null)).toEqual(emptyBook())
  })
})

describe('mergeSide', () => {
  it('replaces a level by price and treats size zero as a deletion', () => {
    const merged = mergeSide(
      [
        [101, 2],
        [100, 1],
      ],
      [
        [101, 5],
        [100, 0],
        [99, 3],
      ],
      'bid',
    )

    // 101 re-sized, 100 deleted (not left resting zero), 99 inserted in sort order.
    expect(merged).toEqual([
      [101, 5],
      [99, 3],
    ])

    // Junk deltas are ignored rather than corrupting the side.
    expect(mergeSide([[100, 1]], [{ px: 'x', sz: 1 }, null], 'bid')).toEqual([[100, 1]])
    expect(mergeSide(null, null, 'ask')).toEqual([])
  })
})

describe('applyUpdate', () => {
  it('folds a delta into both sides and carries the frame identity forward', () => {
    const book = applySnapshot({ bids: [[100, 1]], asks: [[101, 1]], seqId: 1, ts: 10 })
    const next = applyUpdate(book, {
      bids: [[100, 3]],
      asks: [[101, 0], [102, 2]],
      seqId: 2,
      ts: 20,
      checksum: 99,
    })

    expect(next.bids).toEqual([[100, 3]])
    expect(next.asks).toEqual([[102, 2]])
    expect(next).toMatchObject({ seqId: 2, ts: 20, checksum: 99 })

    // A frame with no seqId keeps the book's own rather than resetting it to zero.
    expect(applyUpdate(next, { bids: [] }).seqId).toBe(2)
    expect(applyUpdate(null, { bids: [[1, 1]] }).bids).toEqual([[1, 1]])
  })
})

describe('crc32', () => {
  it('matches zlib in the signed 32-bit space OKX publishes its checksum in', () => {
    // Reference values from zlib.crc32, converted to signed — the same space `cs` uses.
    expect(crc32('3366.1:7:3366.8:9:3366:6:3368:8')).toBe(-1881014294)
    expect(crc32('100:2:100.5:1')).toBe(1068927704)

    expect(crc32('')).toBe(0)
    expect(crc32(null)).toBe(0)
  })
})

describe('checksumString', () => {
  it('interleaves bid and ask per rank, exactly as OKX serialises it', () => {
    const book = {
      bids: [[3366.1, 7], [3366, 6]],
      asks: [[3366.8, 9], [3368, 8]],
    }

    // Alternating, not concatenated: a book joined the other way never matches even when
    // it is perfectly correct.
    expect(checksumString(book)).toBe('3366.1:7:3366.8:9:3366:6:3368:8')

    // Uneven sides simply run out; the deeper side keeps going alone.
    expect(checksumString({ bids: [[1, 1]], asks: [[2, 2], [3, 3]] })).toBe('1:1:2:2:3:3')

    expect(checksumString({ bids: [], asks: [] })).toBe('')
    expect(CHECKSUM_DEPTH).toBe(25)
    // Only the top 25 a side count toward the checksum.
    const deep = { bids: Array.from({ length: 30 }, (_, i) => [100 - i, 1]), asks: [] }
    expect(checksumString(deep).split(':')).toHaveLength(50)
  })
})

describe('verifyChecksum', () => {
  it('accepts a book that still hashes to the venue\'s number, rejects one that drifted', () => {
    const book = { bids: [[100, 2]], asks: [[100.5, 1]], checksum: 1068927704 }

    expect(verifyChecksum(book)).toBe(true)
    expect(verifyChecksum({ ...book, bids: [[100, 3]] })).toBe(false)

    // No checksum on the frame is "not stated", not "wrong" — treating it as a failure
    // would resubscribe in a loop on channels that omit it.
    expect(verifyChecksum({ ...book, checksum: 0 })).toBe(true)
    expect(verifyChecksum(book, 1068927704)).toBe(true)
  })
})

describe('hasSeqGap', () => {
  it('spots a missed delta but not a repeated heartbeat', () => {
    expect(hasSeqGap({ seqId: 5 }, { prevSeqId: 4, seqId: 6 })).toBe(true)
    expect(hasSeqGap({ seqId: 5 }, { prevSeqId: 5, seqId: 6 })).toBe(false)

    // OKX repeats the last seqId on a heartbeat frame; that is continuity.
    expect(hasSeqGap({ seqId: 5 }, { prevSeqId: 5, seqId: 5 })).toBe(false)

    // Nothing to compare against yet is not a gap.
    expect(hasSeqGap({ seqId: 0 }, { prevSeqId: 4 })).toBe(false)
    expect(hasSeqGap({ seqId: 5 }, {})).toBe(false)
  })
})

describe('ingestFrame', () => {
  it('resyncs on a gap or a bad checksum instead of trusting a damaged book', () => {
    const snapshot = ingestFrame(null, {
      action: 'snapshot',
      bids: [[100, 2]],
      asks: [[100.5, 1]],
      seqId: 1,
    })
    expect(snapshot).toMatchObject({ resync: false, reason: '' })
    expect(snapshot.book.bids).toEqual([[100, 2]])

    // A clean delta whose checksum agrees is applied and trusted.
    const clean = ingestFrame(snapshot.book, {
      bids: [[100, 2]],
      asks: [[100.5, 1]],
      prevSeqId: 1,
      seqId: 2,
      checksum: 1068927704,
    })
    expect(clean).toMatchObject({ resync: false })
    expect(clean.book.valid).toBe(true)

    // A checksum that does not match means the book is already wrong: mark it invalid
    // and resubscribe rather than repairing in place.
    const corrupt = ingestFrame(snapshot.book, {
      bids: [[100, 9]],
      prevSeqId: 1,
      seqId: 2,
      checksum: 1068927704,
    })
    expect(corrupt).toMatchObject({ resync: true, reason: 'checksum' })
    expect(corrupt.book.valid).toBe(false)

    // A missing delta is unrecoverable — the data is simply gone.
    const gap = ingestFrame(snapshot.book, { prevSeqId: 99, seqId: 100 })
    expect(gap).toMatchObject({ resync: true, reason: 'seq-gap' })
    expect(gap.book.valid).toBe(false)

    // An empty book takes any frame as a snapshot, however it was labelled.
    expect(ingestFrame(emptyBook(), { bids: [[1, 1]], seqId: 3 }).book.seqId).toBe(3)
  })
})
