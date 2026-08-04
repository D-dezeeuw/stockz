import { describe, it, expect, beforeEach } from 'vitest'
import { PAPER_CAPABILITIES, paperFillPrice, createPaperAdapter } from './paper.js'
import { isAdapter } from './contract.js'
import { resetState } from '../../app/engine.js'
import { restingOrders, resetPaperBook } from '../paper/engine.js'

const BOOK = { bid: 99, ask: 101, mid: 100 }

beforeEach(() => {
  resetState()
  resetPaperBook()
})

describe('paperFillPrice', () => {
  it('makes a market order pay the spread and a limit order fill at its limit', () => {
    // The whole cost a scalper is fighting. Filling at the mid would make every strategy
    // look half a spread better than it is, which over a hundred trades a day is the
    // entire difference between profit and loss.
    expect(paperFillPrice({ type: 'market', side: 'buy' }, BOOK)).toBe(101)
    expect(paperFillPrice({ type: 'market', side: 'sell' }, BOOK)).toBe(99)

    // A limit fills where it was asked to. Doing better is how a paper record flatters a
    // strategy that would in reality have sat in the queue.
    expect(paperFillPrice({ type: 'limit', side: 'buy', price: 95 }, BOOK)).toBe(95)

    // With no book, the mid then the order's own price, and finally nothing at all.
    expect(paperFillPrice({ type: 'market', side: 'buy' }, { mid: 100 })).toBe(100)
    expect(paperFillPrice({ type: 'market', side: 'buy', price: 42 }, {})).toBe(42)
    expect(paperFillPrice({ type: 'market' }, {})).toBe(0)
    expect(paperFillPrice(null)).toBe(0)
  })
})

describe('createPaperAdapter', () => {
  it('fills against the book, refuses when it cannot price, and never reaches a venue', async () => {
    const adapter = createPaperAdapter({ market: () => BOOK })

    // It has to satisfy the same contract as a real venue, or the engine will not take it.
    expect(isAdapter(adapter).ok).toBe(true)
    expect(adapter.venue).toBe('paper')
    expect(adapter.paper).toBe(true)
    expect(PAPER_CAPABILITIES).toContain('market')

    const filled = await adapter.submit({ clientId: 'p1', type: 'market', side: 'buy', size: 2 })
    expect(filled).toMatchObject({ ok: true, clientId: 'p1' })
    expect(filled.order).toMatchObject({ state: 'filled', avgPx: 101, filled: 2, paper: true })

    // Unfillable rather than filled at zero: a paper fill at no price books a position
    // whose P&L is nonsense for the rest of the session. The guards name *why*, which is
    // the difference between a refusal a trader can act on and one that looks like a bug.
    const blind = createPaperAdapter({ market: () => ({}) })
    expect(await blind.submit({ clientId: 'p2', type: 'market', size: 1 })).toMatchObject({
      ok: false,
      reason: 'no_book',
    })

    // A crossed book hands out free money in both directions — the one error a practice
    // account must never teach.
    const crossed = createPaperAdapter({ market: () => ({ bid: 101, ask: 99 }) })
    expect(await crossed.submit({ clientId: 'p4', type: 'market', size: 1 })).toMatchObject({
      reason: 'crossed',
    })

    // And a price nobody has refreshed for a minute is a memory, not a price.
    const stale = createPaperAdapter({
      market: () => ({ bid: 99, ask: 101, ts: 1000 }),
      now: () => 1000 + 60000,
    })
    expect(await stale.submit({ clientId: 'p5', type: 'market', size: 1 })).toMatchObject({
      reason: 'stale',
    })

    // Limits rest rather than filling on submit: the hardest thing about a resting order
    // is that the market has to come to you *and* trade through everyone already there,
    // and an instant fill at your own price is a cheat code, not practice.
    const rested = await adapter.submit({
      clientId: 'p3',
      type: 'limit',
      side: 'buy',
      size: 1,
      price: 99,
      instrument: 'BTC-USDT',
    })
    expect(rested.order).toMatchObject({ state: 'working', resting: true, filled: 0 })
    expect(restingOrders().map((o) => o.id)).toContain('p3')

    // So a cancel now has something real to catch — and reports honestly when it does not.
    expect(await adapter.cancel({ clientId: 'p3' })).toEqual({ ok: true })
    expect(await adapter.cancel({ clientId: 'p3' })).toMatchObject({ ok: false, reason: 'not_found' })
  })
})
