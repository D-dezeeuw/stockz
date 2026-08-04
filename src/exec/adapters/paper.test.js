import { describe, it, expect, beforeEach } from 'vitest'
import { PAPER_CAPABILITIES, paperFillPrice, createPaperAdapter } from './paper.js'
import { isAdapter } from './contract.js'
import { resetState } from '../../app/engine.js'

const BOOK = { bid: 99, ask: 101, mid: 100 }

beforeEach(() => {
  resetState()
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
    // whose P&L is nonsense for the rest of the session.
    const blind = createPaperAdapter({ market: () => ({}) })
    expect(await blind.submit({ clientId: 'p2', type: 'market' })).toMatchObject({
      ok: false,
      reason: 'no_market',
    })

    // Nothing rests, so a cancel has nothing to chase.
    expect(await adapter.cancel({ clientId: 'p1' })).toEqual({ ok: true })
  })
})
