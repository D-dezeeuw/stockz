import { describe, it, expect } from 'vitest'
import {
  queuePosition,
  insertResting,
  removeResting,
  paperMarketFill,
  paperLimitMatch,
  amendResting,
} from './book.js'

const BOOK = {
  bids: [{ px: 100, sz: 12 }, { px: 99, sz: 40 }],
  asks: [{ px: 101, sz: 8 }, { px: 102, sz: 25 }],
}

describe('queuePosition', () => {
  it('counts only the size already showing at the trader own level', () => {
    expect(queuePosition(100, BOOK, 'buy')).toBe(12)
    expect(queuePosition(101, BOOK, 'sell')).toBe(8)

    // Size at better prices fills first but is a different queue: folding it in would make
    // an order at the touch look as though it were behind the whole book.
    expect(queuePosition(99, BOOK, 'buy')).toBe(40)

    // A level nobody is showing has no queue, which is why a limit far from the market
    // fills the instant the tape reaches it.
    expect(queuePosition(95, BOOK, 'buy')).toBe(0)
    expect(queuePosition(0, BOOK, 'buy')).toBe(0)
    expect(queuePosition(100, null, 'buy')).toBe(0)
  })
})

describe('insertResting', () => {
  it('keeps each side best-first and replaces rather than duplicating an id', () => {
    let list = insertResting([], { id: 'a', side: 'buy', price: 99, size: 1 })
    list = insertResting(list, { id: 'b', side: 'buy', price: 101, size: 2 })
    list = insertResting(list, { id: 'c', side: 'buy', price: 100, size: 3 })

    // A buy at 101 fills before a buy at 100, and sorting at match time would sort on
    // every print.
    expect(list.map((o) => o.price)).toEqual([101, 100, 99])
    expect(list[0].remaining).toBe(2)

    // Same id replaces: an amend that re-rested without removing would leave two orders
    // competing for one fill.
    list = insertResting(list, { id: 'b', side: 'buy', price: 98, size: 5 })
    expect(list.filter((o) => o.id === 'b')).toHaveLength(1)
    expect(list.at(-1)).toMatchObject({ id: 'b', price: 98 })

    expect(insertResting([], { id: '', price: 1 })).toEqual([])
    expect(insertResting([], { id: 'x', price: 0 })).toEqual([])
    expect(insertResting(null, { id: 'x', side: 'sell', price: 1, size: 1 })).toHaveLength(1)
  })
})

describe('removeResting', () => {
  it('takes one order out and leaves the rest alone', () => {
    const list = [{ id: 'a' }, { id: 'b' }]

    expect(removeResting(list, 'a').map((o) => o.id)).toEqual(['b'])
    expect(removeResting(list, 'nope')).toHaveLength(2)
    expect(removeResting(null, 'a')).toEqual([])
  })
})

describe('paperMarketFill', () => {
  it('pays the spread, never the mid, and refuses without a price', () => {
    expect(paperMarketFill({ side: 'buy', size: 2 }, { bid: 99, ask: 101, mid: 100 })).toEqual({
      filled: true,
      side: 'buy',
      size: 2,
      // Reporting the mid would make every strategy look half a spread better than it is,
      // which over a hundred trades a day is the whole difference between profit and loss.
      price: 101,
      liquidity: 'taker',
      paper: true,
    })
    expect(paperMarketFill({ side: 'sell', size: 1 }, { bid: 99, ask: 101 }).price).toBe(99)

    // Size costs more on top.
    expect(paperMarketFill({ side: 'buy', size: 1 }, { ask: 100 }, { slipBps: 10 }).price).toBe(100.1)

    // Only the mid to go on is still a price; nothing at all is not.
    expect(paperMarketFill({ side: 'buy', size: 1 }, { mid: 100 }).price).toBe(100)
    expect(paperMarketFill({ side: 'buy', size: 1 }, {})).toEqual({ filled: false, reason: 'no_market' })
    expect(paperMarketFill({ side: 'buy', size: 0 }, { ask: 100 }).filled).toBe(false)
  })
})

describe('paperLimitMatch', () => {
  it('makes the tape eat the queue before it touches the order', () => {
    const order = { id: 'a', side: 'buy', price: 100, size: 5, remaining: 5, queue: 10 }

    // A print at the level works the queue down and fills nothing: price alone is never
    // enough, the tape has to trade the size that was already there.
    const first = paperLimitMatch(order, { px: 100, sz: 4, ts: 1 })
    expect(first.fill).toBeNull()
    expect(first.order.queue).toBe(6)

    // Still queued.
    const second = paperLimitMatch(first.order, { px: 100, sz: 6, ts: 2 })
    expect(second.fill).toBeNull()
    expect(second.order.queue).toBe(0)

    // Now the print reaches the order — and only for the size the tape actually showed.
    const third = paperLimitMatch(second.order, { px: 100, sz: 2, ts: 3 })
    expect(third.fill).toMatchObject({ side: 'buy', size: 2, price: 100, liquidity: 'maker', done: false })
    expect(third.order.remaining).toBe(3)

    // A print *through* the price fills the rest regardless of queue: the market traded
    // past the level, so everything resting at it is gone.
    const done = paperLimitMatch(third.order, { px: 99, sz: 1, ts: 4 })
    expect(done.fill).toMatchObject({ size: 3, done: true })
    expect(done.order.remaining).toBe(0)

    // A sell rests the other way round.
    const sell = { id: 'b', side: 'sell', price: 100, size: 1, remaining: 1, queue: 0 }
    expect(paperLimitMatch(sell, { px: 101, sz: 1 }).fill).toMatchObject({ side: 'sell', price: 100 })
    expect(paperLimitMatch(sell, { px: 99, sz: 1 }).fill).toBeNull()

    expect(paperLimitMatch(order, {}).fill).toBeNull()
    expect(paperLimitMatch({}, { px: 1, sz: 1 }).fill).toBeNull()
  })
})

describe('amendResting', () => {
  it('re-queues at the back of the new level, so repricing is not free', () => {
    const list = insertResting([], { id: 'a', side: 'buy', price: 99, size: 4 })
    const moved = amendResting(list, 'a', 100, BOOK)

    expect(moved[0]).toMatchObject({ id: 'a', price: 100, size: 4 })
    // A venue treats a price change as a cancel and a replace; an amend that kept its old
    // queue position would make repricing free.
    expect(moved[0].queue).toBe(12)

    // Only what is left moves: a partly-filled order does not get its filled size back.
    const partial = amendResting([{ id: 'b', side: 'buy', price: 99, size: 4, remaining: 1 }], 'b', 100, BOOK)
    expect(partial[0].size).toBe(1)

    expect(amendResting(list, 'nope', 100, BOOK)).toBe(list)
    expect(amendResting(list, 'a', 0, BOOK)).toBe(list)
  })
})
