import { describe, it, expect } from 'vitest'
import {
  quotePrices,
  minSpreadGate,
  shouldRequote,
  inventorySkew,
  spreadTick,
  spreadCaptureStrategy,
} from './spread-capture.js'
import { createStrategyContext } from '../contract.js'

function quoting(params = {}) {
  const ctx = createStrategyContext({
    strategy: spreadCaptureStrategy,
    instrument: 'okx:BTC-USDT',
    params: {
      offsetTicks: 0,
      minTicks: 2,
      toleranceTicks: 1,
      maxInventory: 1,
      skewTicks: 2,
      tickSize: 0.1,
      ...params,
    },
  })
  spreadCaptureStrategy.init(ctx)
  return ctx
}

describe('quotePrices', () => {
  it('refuses a crossed or one-sided book rather than quoting off half of it', () => {
    expect(quotePrices(100, 100.5, 0, 0.1)).toEqual({ bid: 100, ask: 100.5 })
    expect(quotePrices(100, 100.5, 2, 0.1)).toEqual({ bid: 99.8, ask: 100.7 })

    // Quoting off a stale half-book is how a maker ends up alone on the wrong side.
    expect(quotePrices(100, 99, 0, 0.1)).toBeNull()
    expect(quotePrices(100, 100, 0, 0.1)).toBeNull()
    expect(quotePrices(0, 100, 0, 0.1)).toBeNull()
    expect(quotePrices(NaN, 100, 0, 0.1)).toBeNull()
  })
})

describe('minSpreadGate', () => {
  it('counts the round trip, or the maker loses money at a perfectly steady rate', () => {
    // A 100 mid with a 0.01 tick: 2bp is 0.02, or 2 ticks per fill, so the round trip is
    // 4 ticks and anything at or under that is a losing quote.
    expect(minSpreadGate(10, 2, 2, 100, 0.01)).toBe(true)
    expect(minSpreadGate(4, 2, 2, 100, 0.01)).toBe(false)

    // The same gate on BTC: at a 50000 mid a 0.1 tick is 0.02bp, so a 2bp maker fee is
    // 200 ticks round trip and a two-tick spread never pays. That is not a bug in the
    // gate — it is why passive scalping on a tight book needs a rebate.
    expect(minSpreadGate(30, 2, 2, 50000, 0.1)).toBe(false)

    // The trader's own floor still applies first.
    expect(minSpreadGate(1, 2, 0, 100, 0.1)).toBe(false)

    // No price context means the floor is the whole gate — better than assuming a fee of
    // zero, which would pass every spread.
    expect(minSpreadGate(5, 2, NaN, 100, 0.1)).toBe(true)
    expect(minSpreadGate(0, 2, 2, 50000, 0.1)).toBe(false)
  })
})

describe('shouldRequote', () => {
  it('holds the queue position through a flicker, which is where the fills come from', () => {
    const current = { bid: 100, ask: 100.5 }

    // Exactly the tolerance is not drift: a book oscillating by one tick would otherwise
    // requote forever, and a cancelled quote was not in the queue when the fill came.
    expect(shouldRequote(current, { bid: 100.1, ask: 100.5 }, 1, 0.1)).toEqual({
      bid: false,
      ask: false,
    })
    expect(shouldRequote(current, { bid: 100.3, ask: 100.5 }, 1, 0.1).bid).toBe(true)

    // No live quote is not drift — it is a side that needs posting.
    expect(shouldRequote(null, current, 1, 0.1)).toEqual({ bid: true, ask: true })
    expect(shouldRequote(current, {}, 1, 0.1)).toEqual({ bid: false, ask: false })
  })
})

describe('inventorySkew', () => {
  it('leans against the position, so passive fills cannot make it directional', () => {
    const quotes = { bid: 100, ask: 100.5 }

    // Flat: no lean.
    expect(inventorySkew(quotes, 0, 1, 2, 0.1)).toEqual({ bid: 100, ask: 100.5, skew: 0 })

    // Long: both quotes shift down — keener to sell, less keen to buy more.
    expect(inventorySkew(quotes, 1, 1, 2, 0.1)).toEqual({ bid: 99.8, ask: 100.3, skew: 0.2 })
    expect(inventorySkew(quotes, -1, 1, 2, 0.1)).toEqual({ bid: 100.2, ask: 100.7, skew: -0.2 })

    // Clamped past the limit: a quote pushed arbitrarily far never fills, and never
    // filling is not the same as getting flat.
    expect(inventorySkew(quotes, 50, 1, 2, 0.1).skew).toBe(0.2)
    expect(inventorySkew(null, 1, 1, 2, 0.1)).toEqual({ bid: 0, ask: 0, skew: 0 })
  })
})

describe('spreadTick', () => {
  it('stops quoting when the spread stops paying', () => {
    const ctx = quoting()

    const first = spreadTick(ctx, { bid: 100, ask: 101 })
    expect(first.reason).toMatch(/^quote 100 \/ 101/)
    expect(ctx.state.quotes).toEqual({ bid: 100, ask: 101, skew: 0 })

    // The same book again is not worth a requote.
    expect(spreadTick(ctx, { bid: 100, ask: 101 })).toBeNull()

    // A book that tightened below the floor pulls the quotes entirely.
    const pulled = spreadTick(ctx, { bid: 100, ask: 100.1 })
    expect(pulled.reason).toMatch(/under fee/)
    expect(ctx.state.quotes).toBeNull()

    // A crossed book pulls them too, silently.
    expect(spreadTick(ctx, { bid: 101, ask: 100 })).toBeNull()
    expect(spreadTick(null, {})).toBeNull()
  })
})

describe('spreadCaptureStrategy', () => {
  it('never emits a direction, because it does not have one', () => {
    expect(spreadCaptureStrategy.id).toBe('spread-capture')

    const ctx = quoting()
    const signal = spreadTick(ctx, { bid: 100, ask: 101 })

    // Emitting buy/sell would put a market maker's inventory into a directional pipeline
    // that means something else entirely.
    expect(signal.action).toBe('flat')
    expect(signal.strength).toBe(0)
    expect(ctx.state.requotes).toBe(1)
    expect(spreadCaptureStrategy.onCandle()).toBeNull()
  })
})
