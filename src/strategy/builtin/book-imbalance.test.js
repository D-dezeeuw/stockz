import { describe, it, expect } from 'vitest'
import {
  depthImbalance,
  microPrice,
  imbalancePersist,
  imbalanceSignal,
  flipExit,
  imbalanceTick,
  bookImbalanceStrategy,
} from './book-imbalance.js'
import { createStrategyContext } from '../contract.js'

function reading(params = {}) {
  const ctx = createStrategyContext({
    strategy: bookImbalanceStrategy,
    instrument: 'okx:BTC-USDT',
    params: { levels: 5, threshold: 0.3, persistM: 3, targetTicks: 3, tickSize: 0.1, ...params },
  })
  bookImbalanceStrategy.init(ctx)
  return ctx
}

/** A book loaded `by` on the bid side. */
function book(bidSize, askSize, bid = 100, ask = 100.1) {
  return {
    bids: [[bid, bidSize]],
    asks: [[ask, askSize]],
  }
}

describe('depthImbalance', () => {
  it('reads an empty book as balanced, not as loaded', () => {
    expect(depthImbalance([[100, 3]], [[101, 1]], 5)).toBe(0.5)
    expect(depthImbalance([[100, 1]], [[101, 3]], 5)).toBe(-0.5)
    expect(depthImbalance([[100, 2]], [[101, 2]], 5)).toBe(0)

    // Only the top N count: the far book is a different question.
    expect(depthImbalance([[100, 1], [99, 99]], [[101, 1]], 1)).toBe(0)

    // A disconnect must not fire the strategy.
    expect(depthImbalance([], [], 5)).toBe(0)
    expect(depthImbalance(null, null, 5)).toBe(0)
  })
})

describe('microPrice', () => {
  it('leans toward the side a taker has to lift through', () => {
    // A big bid pulls the microprice toward the ask: that resting size is what has to be
    // lifted.
    expect(microPrice(100, 101, 9, 1)).toBeCloseTo(100.9, 6)
    expect(microPrice(100, 101, 1, 9)).toBeCloseTo(100.1, 6)
    expect(microPrice(100, 101, 1, 1)).toBe(100.5)

    // No sizes is the plain mid, which is still a usable number.
    expect(microPrice(100, 101, 0, 0)).toBe(100.5)
    expect(microPrice(0, 101, 1, 1)).toBe(0)
    expect(microPrice(NaN, 101, 1, 1)).toBe(0)
  })
})

describe('imbalancePersist', () => {
  it('restarts the count on a flip, because volatile is the opposite of persistent', () => {
    const state = {}

    expect(imbalancePersist(state, 0.5, 0.3, 3)).toMatchObject({ ok: false, streak: 1 })
    expect(imbalancePersist(state, 0.5, 0.3, 3).streak).toBe(2)
    expect(imbalancePersist(state, 0.5, 0.3, 3)).toMatchObject({ ok: true, side: 'buy' })

    // A swing from loaded-bid to loaded-ask has not been persistent, it has been volatile.
    expect(imbalancePersist(state, -0.5, 0.3, 3)).toMatchObject({ streak: 1, side: 'sell' })

    // Falling back inside the band clears it entirely.
    expect(imbalancePersist(state, 0.1, 0.3, 3)).toEqual({ ok: false, streak: 0, side: '' })
    expect(imbalancePersist(null, 0.5, 0.3, 3).ok).toBe(false)
  })
})

describe('imbalanceSignal', () => {
  it('throws away loaded depth that nothing is trading against — a spoof, from here', () => {
    const persist = { ok: true, side: 'buy', streak: 4 }

    expect(imbalanceSignal(persist, 0.6, 0.05)).toMatchObject({ action: 'buy', strength: 0.6 })
    expect(imbalanceSignal(persist, 0.6, 0.05).reason).toMatch(/bid-heavy ×4/)

    // Depth loaded one way with the microprice going the other is depth nobody is trading
    // against.
    expect(imbalanceSignal(persist, 0.6, -0.05)).toBeNull()
    // No drift at all is not disagreement.
    expect(imbalanceSignal(persist, 0.6, 0)).toMatchObject({ action: 'buy' })

    expect(imbalanceSignal({ ok: false, side: 'buy' }, 0.6, 0.05)).toBeNull()
    expect(imbalanceSignal(null, 0.6, 0.05)).toBeNull()
  })
})

describe('flipExit', () => {
  it('exits on the book turning, which usually comes before price does', () => {
    const entry = { side: 'buy', px: 100 }

    expect(flipExit(entry, 0.5, 100.1, 3, 0.1)).toBe('')
    // The whole reason to trade the book rather than the tape.
    expect(flipExit(entry, -0.1, 100.1, 3, 0.1)).toBe('book flipped')
    expect(flipExit(entry, 0.5, 100.3, 3, 0.1)).toBe('target hit')

    const short = { side: 'sell', px: 100 }
    expect(flipExit(short, 0.1, 100, 3, 0.1)).toBe('book flipped')
    expect(flipExit(short, -0.5, 99.7, 3, 0.1)).toBe('target hit')

    expect(flipExit(null, 0.5, 100, 3, 0.1)).toBe('')
  })
})

describe('imbalanceTick', () => {
  it('needs the book to hold before it will act on it', () => {
    const ctx = reading()

    // A loaded bid, rising microprice — but not yet persistent.
    expect(imbalanceTick(ctx, book(9, 1))).toBeNull()
    expect(imbalanceTick(ctx, book(9, 1, 100.1, 100.2))).toBeNull()

    const fired = imbalanceTick(ctx, book(9, 1, 100.2, 100.3))
    expect(fired).toMatchObject({ action: 'buy' })
    expect(ctx.state.entry.side).toBe('buy')

    // The book turning is the exit.
    const exit = imbalanceTick(ctx, book(1, 9, 100.2, 100.3))
    expect(exit).toMatchObject({ action: 'flat', reason: 'book flipped' })
    expect(ctx.state.entry).toBeNull()

    expect(imbalanceTick(null, {})).toBeNull()
  })
})

describe('bookImbalanceStrategy', () => {
  it('keeps its streak per run, so one instrument cannot arm another', () => {
    expect(bookImbalanceStrategy.id).toBe('book-imbalance')
    expect(bookImbalanceStrategy.params.persistM.default).toBe(3)

    const a = reading()
    const b = reading()
    imbalanceTick(a, book(9, 1))

    expect(a.state.streak).toBe(1)
    expect(b.state.streak).toBe(0)
    expect(bookImbalanceStrategy.onCandle()).toBeNull()
  })
})
