// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  publishResting,
  restOrder,
  workPrint,
  cancelPaperOrder,
  amendPaperOrder,
  restingOrders,
  resetPaperBook,
  startPaperBook,
} from './engine.js'
import { appState, setValue, tick, resetState } from '../../app/engine.js'
import { PATHS } from '../../state/paths.js'
import { openPositions, resetPositions } from '../../positions/store.js'

const BOOK = { bids: [{ px: 100, sz: 6 }], asks: [{ px: 101, sz: 4 }] }

beforeEach(() => {
  resetState()
  resetPaperBook()
  resetPositions()
  setValue(PATHS.trade.paperResting, [])
  tick()
})

describe('restOrder', () => {
  it('joins the queue at the level it arrives on', () => {
    const order = restOrder(
      { clientId: 'a', instrument: 'BTC-USDT', side: 'buy', price: 100, size: 3 },
      BOOK,
    )

    // Measured at arrival, once. Recomputing it later would let an order jump the queue
    // every time the level thinned, which is the opposite of what a queue is.
    expect(order).toMatchObject({ id: 'a', side: 'buy', price: 100, size: 3, remaining: 3, queue: 6 })
    expect(restingOrders()).toHaveLength(1)

    expect(restOrder({ clientId: '', price: 100, size: 1 }, BOOK)).toBeNull()
    expect(restOrder({ clientId: 'b', price: 0, size: 1 }, BOOK)).toBeNull()
  })
})

describe('publishResting', () => {
  it('mirrors the book into state with the queue that explains it', () => {
    restOrder({ clientId: 'a', instrument: 'BTC-USDT', side: 'buy', price: 100, size: 3 }, BOOK)
    publishResting()
    tick()

    // Queue is the number that explains why an order at the touch has not filled, which is
    // otherwise the most confusing thing a paper book can show.
    expect(appState.trade.paperResting).toEqual([
      { id: 'a', instrument: 'BTC-USDT', side: 'buy', price: 100, size: 3, remaining: 3, queue: 6 },
    ])

    resetPaperBook()
    expect(publishResting()).toEqual([])
  })
})

describe('workPrint', () => {
  it('works the tape against the book and books the fills as real ones', () => {
    restOrder({ clientId: 'a', instrument: 'BTC-USDT', side: 'buy', price: 100, size: 2 }, BOOK)

    // Prints at the level eat the queue first.
    expect(workPrint({ symbol: 'BTC-USDT', px: 100, sz: 6, ts: 1 })).toEqual([])
    expect(restingOrders()[0].queue).toBe(0)

    const fills = workPrint({ symbol: 'BTC-USDT', px: 100, sz: 2, ts: 2 })
    expect(fills).toHaveLength(1)
    expect(fills[0]).toMatchObject({ side: 'buy', size: 2, price: 100, paper: true, done: true })
    // A complete fill leaves the book.
    expect(restingOrders()).toEqual([])

    // Out through the same door live fills use: positions, P&L and the journal cannot tell
    // the two apart except by the flag, which is the point of practising at all.
    expect(openPositions()[0]).toMatchObject({ instrument: 'BTC-USDT', qty: 2 })

    // A print for another instrument leaves the book alone.
    restOrder({ clientId: 'b', instrument: 'ETH-USDT', side: 'sell', price: 50, size: 1 }, BOOK)
    expect(workPrint({ symbol: 'BTC-USDT', px: 60, sz: 5 })).toEqual([])
    expect(restingOrders()).toHaveLength(1)

    expect(workPrint({})).toEqual([])
  })
})

describe('cancelPaperOrder', () => {
  it('removes a working order and reports honestly when there is none', () => {
    restOrder({ clientId: 'a', instrument: 'BTC-USDT', side: 'buy', price: 100, size: 1 }, BOOK)

    expect(cancelPaperOrder('a')).toBe(true)
    expect(restingOrders()).toEqual([])
    // Reporting ok for an id that was not there would let a stuck order look cancelled.
    expect(cancelPaperOrder('a')).toBe(false)
  })
})

describe('amendPaperOrder', () => {
  it('moves the order and puts it at the back of the new level', () => {
    restOrder({ clientId: 'a', instrument: 'BTC-USDT', side: 'buy', price: 99, size: 2 }, BOOK)
    expect(restingOrders()[0].queue).toBe(0)

    const moved = amendPaperOrder('a', 100, BOOK)
    expect(moved).toMatchObject({ price: 100, queue: 6 })

    expect(amendPaperOrder('nope', 100, BOOK)).toBeNull()
  })
})

describe('restingOrders', () => {
  it('exposes the book the module owns', () => {
    expect(restingOrders()).toEqual([])
    restOrder({ clientId: 'a', instrument: 'BTC-USDT', side: 'buy', price: 100, size: 1 }, BOOK)
    expect(restingOrders().map((o) => o.id)).toEqual(['a'])
  })
})

describe('resetPaperBook', () => {
  it('empties the book without touching the desk', () => {
    restOrder({ clientId: 'a', instrument: 'BTC-USDT', side: 'buy', price: 100, size: 1 }, BOOK)
    expect(resetPaperBook()).toBe(true)
    expect(restingOrders()).toEqual([])
  })
})

describe('startPaperBook', () => {
  it('subscribes the book to the tape', () => {
    let listener = null
    const stop = startPaperBook({
      subscribe: (fn) => {
        listener = fn
        return () => (listener = null)
      },
    })

    restOrder({ clientId: 'a', instrument: 'BTC-USDT', side: 'buy', price: 100, size: 1 }, BOOK)
    listener({ symbol: 'BTC-USDT', px: 99, sz: 5, ts: 1 })
    expect(restingOrders()).toEqual([])

    stop()
    expect(listener).toBeNull()
    expect(typeof startPaperBook({ subscribe: () => undefined })).toBe('function')
  })
})
