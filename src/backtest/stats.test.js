import { describe, it, expect } from 'vitest'
import {
  buildTradeList,
  computeExpectancy,
  computeDrawdown,
  equityCurve,
  summariseRun,
} from './stats.js'

/** Two round trips: a long that won, then a short that lost. */
const FILLS = [
  { side: 'buy', size: 1, price: 100, ts: 1000, fee: 0.1 },
  { side: 'sell', size: 1, price: 110, ts: 2000, fee: 0.1 },
  { side: 'sell', size: 1, price: 100, ts: 3000, fee: 0.1 },
  { side: 'buy', size: 1, price: 105, ts: 4000, fee: 0.1 },
]

describe('buildTradeList', () => {
  it('pairs fills FIFO into round trips, netting the fees off both legs', () => {
    const trades = buildTradeList(FILLS)

    expect(trades).toHaveLength(2)
    expect(trades[0]).toMatchObject({
      side: 'long',
      size: 1,
      entryPx: 100,
      exitPx: 110,
      holdMs: 1000,
      gross: 10,
      fees: 0.2,
      // Net, always. A gross P&L at scalping frequency says the opposite of the truth
      // often enough to be worse than none.
      net: 9.8,
    })
    expect(trades[1]).toMatchObject({ side: 'short', gross: -5, net: -5.2 })

    // FIFO rather than an averaged book: one blended entry no individual trade ever had
    // would collapse the hold-time distribution, which is the thing being tuned.
    const layered = buildTradeList([
      { side: 'buy', size: 1, price: 100, ts: 1 },
      { side: 'buy', size: 1, price: 200, ts: 2 },
      { side: 'sell', size: 1, price: 150, ts: 3 },
    ])
    expect(layered).toHaveLength(1)
    expect(layered[0]).toMatchObject({ entryPx: 100, exitPx: 150, net: 50, openTs: 1 })

    // A fill that closes two lots splits its fee across them rather than dumping it on
    // the first.
    const split = buildTradeList([
      { side: 'buy', size: 1, price: 100, ts: 1, fee: 0 },
      { side: 'buy', size: 1, price: 100, ts: 2, fee: 0 },
      { side: 'sell', size: 2, price: 100, ts: 3, fee: 2 },
    ])
    expect(split.map((t) => t.fees)).toEqual([1, 1])

    // Open inventory is not a trade: a run that ended long has not realised anything.
    expect(buildTradeList([{ side: 'buy', size: 1, price: 100, ts: 1 }])).toEqual([])
    expect(buildTradeList([{ side: 'buy', size: 0, price: 100 }, null])).toEqual([])
    expect(buildTradeList(null)).toEqual([])
  })
})

describe('computeExpectancy', () => {
  it('divides by every trade, scratches included', () => {
    const stats = computeExpectancy(buildTradeList(FILLS))

    expect(stats).toMatchObject({
      trades: 2,
      wins: 1,
      losses: 1,
      scratches: 0,
      winRate: 0.5,
      avgWin: 9.8,
      avgLoss: 5.2,
      net: 4.6,
      expectancy: 2.3,
    })

    // A strategy that scratches nine trades in ten has an expectancy near zero; excluding
    // them would report the tenth trade's edge as the strategy's.
    const scratchy = computeExpectancy([{ net: 10 }, { net: 0 }, { net: 0 }, { net: 0 }])
    expect(scratchy).toMatchObject({ trades: 4, scratches: 3, expectancy: 2.5, winRate: 0.25 })

    // No losing trade has no profit factor, which is a real answer rather than a division
    // by zero.
    expect(computeExpectancy([{ net: 5 }]).profitFactor).toBe(Infinity)
    expect(computeExpectancy([]).profitFactor).toBe(0)
    expect(computeExpectancy(null)).toMatchObject({ trades: 0, expectancy: 0 })
  })
})

describe('computeDrawdown', () => {
  it('tracks the worst peak-to-trough and how long it lasted', () => {
    const worst = computeDrawdown([
      { net: 10, closeTs: 1000 },
      { net: -4, closeTs: 2000 },
      { net: -3, closeTs: 3000 },
      { net: 6, closeTs: 4000 },
    ])

    expect(worst).toMatchObject({
      maxDrawdown: 7,
      peak: 10,
      final: 9,
      peakAt: 1000,
      troughAt: 3000,
      // "Does it make money" is the easy question; "how long does it make you wait" is the
      // one that decides whether a strategy is survivable.
      underwaterMs: 2000,
    })

    // A run that only ever went up never drew down.
    expect(computeDrawdown([{ net: 1 }, { net: 1 }])).toMatchObject({ maxDrawdown: 0, final: 2 })
    // One that only ever went down drew down from a peak of zero, not from its first trade.
    expect(computeDrawdown([{ net: -3 }, { net: -2 }])).toMatchObject({ maxDrawdown: 5, peak: 0 })
    expect(computeDrawdown(null)).toMatchObject({ maxDrawdown: 0, final: 0 })
  })
})

describe('equityCurve', () => {
  it('accumulates P&L and downsamples without dropping the end', () => {
    expect(equityCurve([{ net: 5, closeTs: 1 }, { net: -2, closeTs: 2 }])).toEqual([
      { i: 0, equity: 5, ts: 1 },
      { i: 1, equity: 3, ts: 2 },
    ])

    const many = Array.from({ length: 1000 }, (_, n) => ({ net: 1, closeTs: n }))
    const curve = equityCurve(many, 50)
    expect(curve).toHaveLength(50)
    expect(curve[0]).toMatchObject({ i: 0, equity: 1 })
    // The last point is always kept: a downsample that dropped the tail would draw a curve
    // ending somewhere the run never was, which is the part everybody reads first.
    expect(curve.at(-1)).toMatchObject({ i: 999, equity: 1000 })

    expect(equityCurve([])).toEqual([])
    expect(equityCurve(null)).toEqual([])
    // Zero points is not a request for an empty chart, it is an unspecified one — and the
    // floor of two exists because a single point is not a line.
    expect(equityCurve(many, 0)).toHaveLength(200)
    expect(equityCurve(many, 1)).toHaveLength(2)
  })
})

describe('summariseRun', () => {
  it('turns a worker result into everything the report and the sweep need', () => {
    const stats = summariseRun({
      strategyId: 'momentum-burst',
      instrument: 'BTC-USDT',
      params: { lookback: 20 },
      fillConfig: { latencyMs: 40 },
      signals: [{ side: 'buy' }, { side: 'sell' }, { side: 'sell' }],
      fills: FILLS,
      unfilled: 1,
    })

    expect(stats).toMatchObject({
      strategyId: 'momentum-burst',
      instrument: 'BTC-USDT',
      params: { lookback: 20 },
      signals: 3,
      fills: 4,
      unfilled: 1,
      trades: 2,
      net: 4.6,
      expectancy: 2.3,
      maxDrawdown: 5.2,
    })
    expect(stats.curve).toHaveLength(2)
    // The round trips keep a name of their own: `trades` is the count every tile reads.
    expect(stats.tradeList).toHaveLength(2)

    // A run that never filled is a report of nothing, not a crash.
    expect(summariseRun(null)).toMatchObject({ trades: 0, net: 0, fills: 0, curve: [] })
  })
})
