import { describe, it, expect } from 'vitest'
import {
  PROGRESS_MS,
  signalSide,
  collectSignals,
  progressReporter,
  drainPending,
  driveBacktest,
} from './harness.js'
import { defineStrategy } from '../strategy/contract.js'
import { resolveFillConfig } from './fills.js'

/** A strategy that buys above a threshold, sells below it, and can be told to explode. */
const flipper = defineStrategy({
  id: 'flipper',
  name: 'Flipper',
  params: { level: { kind: 'number', default: 100, min: 0, max: 1e9 } },
  init: (ctx) => {
    ctx.state.seen = 0
    return null
  },
  onTick: (ctx, tick) => {
    ctx.state.seen += 1
    if (tick.px === 666) throw new Error('cursed print')
    if (tick.px > ctx.params.level) return { action: 'buy', strength: 0.5, reason: 'above' }
    if (tick.px < ctx.params.level) return { action: 'sell', strength: 0.5, reason: 'below' }
    return { action: 'none' }
  },
  onCandle: () => null,
})

const ticks = [
  { symbol: 'BTC-USDT', px: 101, ts: 1000 },
  { symbol: 'ETH-USDT', px: 50, ts: 1001 },
  { symbol: 'BTC-USDT', px: 100, ts: 1002 },
  { symbol: 'BTC-USDT', px: 99, ts: 1003 },
  { symbol: 'BTC-USDT', px: 666, ts: 1004 },
]

describe('signalSide', () => {
  it('reads the direction and treats silence as nothing to log', () => {
    expect(signalSide({ action: 'buy' })).toBe('buy')
    expect(signalSide({ action: 'sell' })).toBe('sell')
    expect(signalSide({ action: 'flat' })).toBe('flat')

    // 'none' is silence. Logging it would produce a signal list as long as the recording
    // and a report of nothing.
    expect(signalSide({ action: 'none' })).toBe('')
    expect(signalSide(null)).toBe('')
    expect(signalSide({ action: 'nonsense' })).toBe('')
  })
})

describe('collectSignals', () => {
  it('appends actionable emissions with the tick they were formed on', () => {
    const log = []

    collectSignals(log, { action: 'buy', strength: 0.8, reason: 'breakout' }, { px: 101.5, ts: 7 })
    expect(log).toEqual([{ side: 'buy', price: 101.5, ts: 7, strength: 0.8, reason: 'breakout' }])

    // Silence never lands.
    collectSignals(log, { action: 'none' }, { px: 102, ts: 8 })
    collectSignals(log, null, { px: 102, ts: 8 })
    expect(log).toHaveLength(1)

    // A malformed tick still records the signal — the strategy said something, and a
    // dropped emission would understate the run.
    collectSignals(log, { action: 'sell' }, {})
    expect(log[1]).toEqual({ side: 'sell', price: 0, ts: 0, strength: 0, reason: '' })

    expect(collectSignals(null, { action: 'buy' }, { px: 1, ts: 1 })).toEqual([
      { side: 'buy', price: 1, ts: 1, strength: 0, reason: '' },
    ])
  })
})

describe('progressReporter', () => {
  it('emits at most once per window, and always on a forced final update', () => {
    const sent = []
    let clock = 0
    const report = progressReporter((u) => sent.push(u), { now: () => clock, everyMs: 100 })

    expect(report({ played: 1 })).toBe(true)
    expect(report({ played: 2 })).toBe(false)
    expect(report({ played: 3 })).toBe(false)

    clock = 150
    expect(report({ played: 4 })).toBe(true)
    expect(sent.map((u) => u.played)).toEqual([1, 4])

    // The final update is forced: a run that finished inside one window would otherwise
    // leave the bar frozen short of 100%.
    expect(report({ played: 5 }, true)).toBe(true)
    expect(sent.at(-1)).toEqual({ played: 5, at: 150 })

    expect(progressReporter(null)({ played: 1 })).toBe(true)
    expect(PROGRESS_MS).toBe(100)
  })
})

describe('drainPending', () => {
  it('fills what has arrived, keeps working limits, and drops what cannot price', () => {
    const config = resolveFillConfig({ spreadBps: 0, slippageBps: 0, sizeCurve: [{ size: 1, bps: 0 }] })
    const queue = [
      { side: 'buy', type: 'market', size: 1, arrivesAt: 900, reason: 'early' },
      { side: 'buy', type: 'market', size: 1, arrivesAt: 5000, reason: 'later' },
      { side: 'buy', type: 'limit', size: 1, price: 90, arrivesAt: 900, reason: 'passive' },
    ]

    const drained = drainPending(queue, { px: 100, ts: 1000 }, config)

    // The market order fills at the touch; the limit at 90 has not been reached, so it
    // stays working — dropping it would score a passive strategy as if it had cancelled
    // every quote it ever posted.
    expect(drained.fills).toHaveLength(1)
    expect(drained.fills[0]).toMatchObject({ side: 'buy', price: 100, liquidity: 'taker', reason: 'early' })
    // Fees come attached, so nothing downstream has to remember to charge them.
    expect(drained.fills[0].fee).toBeGreaterThan(0)
    expect(drained.pending.map((o) => o.reason)).toEqual(['later', 'passive'])

    // Checked against every tick, not only the one matching the arrival stamp: a recording
    // is an irregular clock, and an order arriving between two prints must fill on the next.
    expect(drainPending(drained.pending, { px: 89, ts: 6000 }, config).fills.map((f) => f.reason)).toEqual([
      'later',
      'passive',
    ])

    // A market order that cannot price is dead rather than left in flight forever.
    expect(drainPending([{ side: 'buy', type: 'market', size: 1, arrivesAt: 0 }], {}, config)).toEqual({
      fills: [],
      pending: [],
    })
    expect(drainPending(null, {}, config)).toEqual({ fills: [], pending: [] })
  })
})

describe('driveBacktest', () => {
  it('runs one strategy over one instrument and reports what it emitted', () => {
    let clock = 0
    const progress = []
    const result = driveBacktest({
      ticks,
      strategy: flipper,
      instrument: 'BTC-USDT',
      params: { level: 100 },
      // One millisecond of wire, so the fill lands on the next print rather than the one
      // that triggered it — the gap the latency model exists to charge for.
      fillConfig: { latencyMs: 1 },
      now: () => (clock += 200),
      onProgress: (u) => progress.push(u),
    })

    // ETH is filtered out: a strategy handed two markets down one `onTick` sees a chart
    // that teleports and scores noise.
    expect(result.total).toBe(4)
    expect(result.played).toBe(4)
    expect(result.instrument).toBe('BTC-USDT')

    // 101 buys, 100 is silence, 99 sells, 666 throws.
    expect(result.signals).toEqual([
      { side: 'buy', price: 101, ts: 1000, strength: 0.5, reason: 'above' },
      { side: 'sell', price: 99, ts: 1003, strength: 0.5, reason: 'below' },
    ])
    expect(result.errors).toBe(1)
    expect(result.cancelled).toBe(false)
    // Fees are summed as integers in the snapshot, so a rerun with the fills in a
    // different order still hashes the same.
    expect(result.state).toEqual({ run: { signals: 2, fills: 2, errors: 1, fees: expect.any(Number) } })
    expect(result.state.run.fees).toBeGreaterThan(0)
    expect(result.elapsedMs).toBeGreaterThan(0)
    expect(progress.at(-1)).toMatchObject({ played: 4, total: 4, signals: 2 })

    // Signals became orders, and orders became fills only after the latency gap. The buy
    // signalled on the tick at ts 1000 is still on the wire when that tick ends; it fills
    // against ts 1002 — a different price, which is exactly the cost being modelled.
    expect(result.fills).toHaveLength(2)
    expect(result.fills[0]).toMatchObject({ side: 'buy', ts: 1002, liquidity: 'taker' })
    // And it pays the offer plus adverse slippage, never the 100 that was on the tape.
    expect(result.fills[0].price).toBeGreaterThan(100)
    expect(result.fills[0].fee).toBeGreaterThan(0)
    expect(result.fills[1]).toMatchObject({ side: 'sell', ts: 1004 })
    expect(result.fillConfig).toMatchObject({ latencyMs: 1, instrument: 'BTC-USDT' })

    // The same tape run passively is a different trade count. Quotes post 5% behind the
    // touch: the sell at 103.95 is crossed by the 666 print, the buy at 95.95 never is —
    // and the one the tape never reached is reported unfilled rather than force-filled at
    // the end, which would credit the strategy with the fill it demonstrably did not get.
    const passive = driveBacktest({
      ticks,
      strategy: flipper,
      instrument: 'BTC-USDT',
      params: { level: 100 },
      fillConfig: { orderType: 'limit', limitOffsetBps: 500, latencyMs: 1 },
    })
    expect(passive.fills).toHaveLength(1)
    expect(passive.fills[0]).toMatchObject({ side: 'sell', price: 103.95, liquidity: 'maker' })
    expect(passive.unfilled).toBe(1)

    // Cancellation lands per tick, not per chunk: a misconfigured sweep over a long
    // recording must stop the moment it is told to.
    const stopped = driveBacktest({ ticks, strategy: flipper, cancelled: () => true })
    expect(stopped).toMatchObject({ played: 0, cancelled: true, signals: [] })

    // No instrument means every tick, and no ticks means an honest empty run.
    expect(driveBacktest({ ticks, strategy: flipper }).total).toBe(5)
    expect(driveBacktest({ strategy: flipper })).toMatchObject({ total: 0, played: 0 })
  })
})
