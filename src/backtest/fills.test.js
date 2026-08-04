import { describe, it, expect } from 'vitest'
import {
  DEFAULT_FILL_CONFIG,
  resolveFillConfig,
  slippageForSize,
  quoteFromTick,
  orderFromSignal,
  applyLatency,
  simMarketFill,
  simLimitFill,
  simFees,
} from './fills.js'

/** The defaults, resolved, so the fill functions get a complete config. */
const CONFIG = resolveFillConfig()

describe('resolveFillConfig', () => {
  it('merges onto the defaults and refuses assumptions that pay you to trade', () => {
    expect(resolveFillConfig()).toMatchObject({
      spreadBps: 2,
      latencyMs: 40,
      slippageBps: 1,
      venue: 'okx',
      orderType: 'market',
      size: 1,
    })

    expect(resolveFillConfig({ latencyMs: 250, venue: 'etoro', orderType: 'limit' })).toMatchObject({
      latencyMs: 250,
      venue: 'etoro',
      orderType: 'limit',
      // Untouched fields keep their default rather than becoming undefined.
      spreadBps: 2,
    })

    // A negative spread or latency would model a venue that pays you to trade, so it falls
    // back rather than being honoured.
    expect(resolveFillConfig({ latencyMs: -10, spreadBps: -1 })).toMatchObject({
      latencyMs: 40,
      spreadBps: 2,
    })
    expect(resolveFillConfig({ latencyMs: 'soon' }).latencyMs).toBe(40)

    // Sorted, because the interpolation walks the points in order: an unsorted curve read
    // from a saved config would interpolate between the wrong pair.
    expect(
      resolveFillConfig({ sizeCurve: [{ size: 50, bps: 5 }, { size: 1, bps: 0 }] }).sizeCurve,
    ).toEqual([{ size: 1, bps: 0 }, { size: 50, bps: 5 }])

    // An unknown order type is market, never a third state the fill functions cannot serve.
    expect(resolveFillConfig({ orderType: 'iceberg' }).orderType).toBe('market')
    expect(Object.isFrozen(DEFAULT_FILL_CONFIG)).toBe(true)
  })
})

describe('slippageForSize', () => {
  it('interpolates between the curve points and flattens past the last', () => {
    const curve = [{ size: 1, bps: 0 }, { size: 10, bps: 2 }, { size: 100, bps: 8 }]

    // At and below the first point costs the first point's bps: the curve describes a book,
    // and no size is so small it trades outside one.
    expect(slippageForSize(0.5, curve)).toBe(0)
    expect(slippageForSize(1, curve)).toBe(0)

    // Linear between the points. A step function would make one unit over a breakpoint cost
    // dramatically more than one unit under it, which no book does.
    expect(slippageForSize(5.5, curve)).toBe(1)
    expect(slippageForSize(10, curve)).toBe(2)
    expect(slippageForSize(55, curve)).toBe(5)

    // Past the last point it flattens rather than extrapolating: nobody knows what a clip
    // ten times the deepest measured size does, and a straight line would guess.
    expect(slippageForSize(1000, curve)).toBe(8)

    // Sign is not a size: a short clip of 20 costs what a long clip of 20 costs.
    expect(slippageForSize(-20, curve)).toBe(slippageForSize(20, curve))
    expect(slippageForSize(5, [])).toBe(0)
    expect(slippageForSize(5)).toBeGreaterThan(0)
  })
})

describe('quoteFromTick', () => {
  it('prefers the recorded book and synthesises one only when there is none', () => {
    // A real book beats a synthetic one: when the recording caught the quote, that is the
    // spread that existed, not an assumption about it.
    expect(quoteFromTick({ bid: 99, ask: 101 }, 50)).toEqual({ bid: 99, ask: 101, mid: 100 })

    // 2bps on 100 is 0.02 wide, half either side of the print.
    expect(quoteFromTick({ px: 100 }, 2)).toEqual({ bid: 99.99, ask: 100.01, mid: 100 })
    expect(quoteFromTick({ px: 100 }, 0)).toEqual({ bid: 100, ask: 100, mid: 100 })

    // A crossed or one-sided book is not a book.
    expect(quoteFromTick({ bid: 101, ask: 99, px: 100 }, 2)).toEqual({ bid: 99.99, ask: 100.01, mid: 100 })
    expect(quoteFromTick({})).toBeNull()
    expect(quoteFromTick({ px: 0 })).toBeNull()
  })
})

describe('orderFromSignal', () => {
  it('turns a tradeable signal into an order and ignores the rest', () => {
    expect(orderFromSignal({ side: 'buy', price: 100, ts: 7 }, CONFIG)).toEqual({
      side: 'buy',
      type: 'market',
      size: 1,
      price: 0,
      ts: 7,
      reason: '',
    })

    // A passive order posts *behind* the touch — a buy below the print, a sell above it.
    // Posting through it would be a market order wearing a limit's name.
    const limit = resolveFillConfig({ orderType: 'limit', limitOffsetBps: 10, size: 3 })
    expect(orderFromSignal({ side: 'buy', price: 100, ts: 1, reason: 'dip' }, limit)).toMatchObject({
      type: 'limit',
      price: 99.9,
      size: 3,
      reason: 'dip',
    })
    expect(orderFromSignal({ side: 'sell', price: 100, ts: 1 }, limit).price).toBe(100.1)

    // 'flat' closes a position rather than opening one, and is the caller's business.
    expect(orderFromSignal({ side: 'flat', price: 100 }, CONFIG)).toBeNull()
    expect(orderFromSignal(null, CONFIG)).toBeNull()
  })
})

describe('applyLatency', () => {
  it('stamps when the order will actually reach the venue', () => {
    expect(applyLatency({ side: 'buy', ts: 1000 }, { latencyMs: 40 })).toMatchObject({
      sentAt: 1000,
      arrivesAt: 1040,
    })

    // Zero is allowed but is not the default: a zero-latency backtest is a time machine,
    // and every strategy is profitable in one.
    expect(applyLatency({ ts: 1000 }, { latencyMs: 0 }).arrivesAt).toBe(1000)
    expect(applyLatency({ ts: 1000 }, { latencyMs: -5 }).arrivesAt).toBe(1000)
    expect(applyLatency({}, {}).arrivesAt).toBe(0)
  })
})

describe('simMarketFill', () => {
  it('pays the opposing touch plus adverse slippage, never the mid', () => {
    const flat = resolveFillConfig({ slippageBps: 0, sizeCurve: [{ size: 1, bps: 0 }] })

    // A market buy pays the offer. Filling at the mid — or worse, the last print — is the
    // single most flattering lie a backtest can tell.
    expect(simMarketFill({ side: 'buy', size: 1 }, { bid: 99, ask: 101, ts: 5 }, flat)).toEqual({
      filled: true,
      side: 'buy',
      size: 1,
      price: 101,
      ts: 5,
      liquidity: 'taker',
      slippageBps: 0,
    })
    expect(simMarketFill({ side: 'sell', size: 1 }, { bid: 99, ask: 101, ts: 5 }, flat).price).toBe(99)

    // Slippage is always adverse. One that could go either way would average to nothing
    // over a long run, which is exactly the wrong model of a cost.
    const costed = resolveFillConfig({ slippageBps: 10, spreadBps: 0, sizeCurve: [{ size: 1, bps: 0 }] })
    expect(simMarketFill({ side: 'buy', size: 1 }, { px: 100 }, costed).price).toBe(100.1)
    expect(simMarketFill({ side: 'sell', size: 1 }, { px: 100 }, costed).price).toBe(99.9)

    // Size costs more, through the curve: 1bp base plus 8bp for a clip of 100.
    const big = simMarketFill({ side: 'buy', size: 100 }, { px: 100 }, resolveFillConfig({ spreadBps: 0 }))
    expect(big.slippageBps).toBe(9)
    expect(big.price).toBe(100.09)

    expect(simMarketFill({ side: 'buy', size: 0 }, { px: 100 }, CONFIG).filled).toBe(false)
    expect(simMarketFill({ side: 'buy', size: 1 }, {}, CONFIG)).toEqual({ filled: false, reason: 'no price' })
  })
})

describe('simLimitFill', () => {
  it('fills only when the tape traded through the limit, and only at the limit', () => {
    // Crossed, not merely touched. A print *at* the limit says the price traded there, not
    // that this order was at the front of the queue when it did.
    expect(simLimitFill({ side: 'buy', size: 2, price: 100 }, { px: 100, ts: 3 }, CONFIG)).toEqual({
      filled: false,
      reason: 'not crossed',
    })

    expect(simLimitFill({ side: 'buy', size: 2, price: 100 }, { px: 99.5, ts: 3 }, CONFIG)).toEqual({
      filled: true,
      side: 'buy',
      size: 2,
      // At the limit, never better: giving a passive order the improvement would credit it
      // with the aggressor's edge.
      price: 100,
      ts: 3,
      liquidity: 'maker',
      slippageBps: 0,
      venue: 'okx',
    })

    expect(simLimitFill({ side: 'sell', size: 1, price: 100 }, { px: 100.5 }, CONFIG).filled).toBe(true)
    expect(simLimitFill({ side: 'sell', size: 1, price: 100 }, { px: 99.5 }, CONFIG).filled).toBe(false)

    expect(simLimitFill({ side: 'buy', size: 1 }, { px: 99 }, CONFIG)).toEqual({ filled: false, reason: 'no limit' })
    expect(simLimitFill({ side: 'buy', size: 1, price: 100 }, {}, CONFIG)).toEqual({
      filled: false,
      reason: 'no print',
    })
  })
})

describe('simFees', () => {
  it('charges the venue rate on notional, by liquidity and instrument kind', () => {
    // OKX spot: 10bps taker on 1000 notional is 1.
    expect(simFees({ price: 1000, size: 1, liquidity: 'taker' }, CONFIG)).toEqual({ amount: 1, bps: 10 })
    expect(simFees({ price: 1000, size: 1, liquidity: 'maker' }, CONFIG)).toEqual({ amount: 0.8, bps: 8 })

    // A perpetual is a third of the cost of spot. One rate for both would misprice every
    // scalp by enough to matter at this trade count.
    const swap = resolveFillConfig({ instrument: 'BTC-USDT-SWAP' })
    expect(simFees({ price: 1000, size: 1, liquidity: 'taker' }, swap)).toEqual({ amount: 0.5, bps: 5 })

    // EToro takes a spread markup instead of commission, which is a fee by another name.
    expect(simFees({ price: 1000, size: 1 }, resolveFillConfig({ venue: 'etoro' })).bps).toBe(100)

    // An unknown venue falls back to OKX rather than charging nothing.
    expect(simFees({ price: 1000, size: 1 }, resolveFillConfig({ venue: 'moon' })).bps).toBe(10)
    expect(simFees({ price: 0, size: 1 }, CONFIG)).toEqual({ amount: 0, bps: 0 })
  })
})
