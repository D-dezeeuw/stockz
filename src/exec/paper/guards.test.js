import { describe, it, expect } from 'vitest'
import {
  MAX_SPREAD_BPS,
  MAX_GAP_BPS,
  STALE_MS,
  checkBook,
  checkGap,
  checkFresh,
  guardPaperFill,
} from './guards.js'
import { workPrint, restOrder, restingOrders, resetPaperBook } from './engine.js'

describe('checkBook', () => {
  it('refuses a crossed book and a half-populated one', () => {
    expect(checkBook({ bid: 99, ask: 101 })).toEqual({ ok: true, reason: '' })

    // Crossed happens for milliseconds on a real venue and constantly on a desk whose two
    // updates landed out of order. Filling against it hands out free money in *both*
    // directions, which is the one error a practice account must never teach.
    expect(checkBook({ bid: 101, ask: 99 })).toEqual({ ok: false, reason: 'crossed' })

    // A 10% spread is not a wide market, it is one side of a reconnect.
    expect(checkBook({ bid: 50, ask: 150 })).toEqual({ ok: false, reason: 'spread' })
    expect(checkBook({ bid: 99, ask: 101 }, { maxSpreadBps: 10 })).toEqual({ ok: false, reason: 'spread' })

    expect(checkBook({})).toEqual({ ok: false, reason: 'no_book' })
    expect(checkBook({ bid: 0, ask: 1 })).toEqual({ ok: false, reason: 'no_book' })
    expect(MAX_SPREAD_BPS).toBe(1000)
  })
})

describe('checkGap', () => {
  it('separates a move from a skip, and lets a session start', () => {
    expect(checkGap(101, 100)).toMatchObject({ ok: true, bps: 100 })
    expect(checkGap(100, 100)).toMatchObject({ ok: true, bps: 0 })

    // A limit "filled" through a gap it was never in front of is the most flattering bug
    // a sim can have: the strategy books the whole move and never had to be right.
    expect(checkGap(110, 100)).toMatchObject({ ok: false, reason: 'gap', bps: 1000 })
    expect(checkGap(90, 100)).toMatchObject({ ok: false, reason: 'gap' })
    expect(checkGap(101, 100, { maxGapBps: 10 })).toMatchObject({ ok: false, reason: 'gap' })

    // Nothing to compare against is not a gap: the first print of a session has no
    // predecessor, and refusing it would make every session start dead.
    expect(checkGap(100, undefined)).toMatchObject({ ok: true, bps: 0 })
    expect(checkGap(0, 100)).toMatchObject({ ok: false, reason: 'no_price' })
    expect(MAX_GAP_BPS).toBe(500)
  })
})

describe('checkFresh', () => {
  it('calls a stalled price a memory, and an unstamped one merely unknown', () => {
    expect(checkFresh(1000, 2000)).toMatchObject({ ok: true, ageMs: 1000 })
    expect(checkFresh(1000, 1000 + STALE_MS + 1)).toMatchObject({ ok: false, reason: 'stale' })
    expect(checkFresh(1000, 2000, { staleMs: 100 })).toMatchObject({ ok: false, reason: 'stale' })

    // No timestamp is absence of evidence, not evidence of staleness — refusing every
    // unstamped snapshot would break the honest callers to punish the careless.
    expect(checkFresh(undefined, 2000)).toMatchObject({ ok: true, reason: 'unknown' })
    expect(checkFresh(0, 2000)).toMatchObject({ ok: true, reason: 'unknown' })
  })
})

describe('guardPaperFill', () => {
  it('runs the checks in the order that makes the reason useful', () => {
    const good = { market: { bid: 99, ask: 101 }, size: 1, lastTs: 1000, now: 1500 }
    expect(guardPaperFill(good)).toEqual({ ok: true, reason: '' })

    // Size first and cheapest: a malformed frame fills nothing but would book a position
    // of NaN, and every check after it would be reasoning about that.
    expect(guardPaperFill({ ...good, size: 0 })).toEqual({ ok: false, reason: 'no_size' })
    expect(guardPaperFill({ ...good, market: { bid: 101, ask: 99 } }).reason).toBe('crossed')
    expect(guardPaperFill({ ...good, now: 1000 + STALE_MS + 1 }).reason).toBe('stale')

    // A gap is a property of consecutive *prints*, so the submit path — a book and no
    // tape — has nothing to check, and running it there would refuse every market order
    // for want of a price it was never given.
    expect(guardPaperFill(good).ok).toBe(true)
    expect(guardPaperFill({ ...good, price: 110, previous: 100 }).reason).toBe('gap')
    expect(guardPaperFill({ ...good, price: 101, previous: 100 }).ok).toBe(true)
  })
})

describe('the guarded paper book', () => {
  it('updates its price on a gap but refuses to fill through it', () => {
    resetPaperBook()
    // Joined behind five lots, so a print at the level works the queue rather than
    // filling — which is what leaves an order in the book for the gap to be tested on.
    restOrder({ clientId: 'a', instrument: 'BTC-USDT', side: 'buy', price: 100, size: 1 }, {
      bids: [{ px: 100, sz: 5 }],
    })

    expect(workPrint({ symbol: 'BTC-USDT', px: 100, sz: 1, ts: 1 })).toEqual([])
    expect(restingOrders()).toHaveLength(1)

    // A 20% skip does not — refusing teaches nothing wrong, while filling teaches a
    // strategy that only works when the data is broken.
    expect(workPrint({ symbol: 'BTC-USDT', px: 80, sz: 5, ts: 2 })).toEqual([])
    expect(restingOrders()).toHaveLength(1)

    // But the price *was* taken, so the next print is judged against 80 rather than 100
    // and normal trading resumes rather than every later print reading as a gap.
    expect(workPrint({ symbol: 'BTC-USDT', px: 79.9, sz: 5, ts: 3 })).toHaveLength(1)
    expect(restingOrders()).toEqual([])
  })
})
