import { describe, it, expect } from 'vitest'
import { PROGRESS_MS, signalSide, collectSignals, progressReporter, driveBacktest } from './harness.js'
import { defineStrategy } from '../strategy/contract.js'

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

describe('driveBacktest', () => {
  it('runs one strategy over one instrument and reports what it emitted', () => {
    let clock = 0
    const progress = []
    const result = driveBacktest({
      ticks,
      strategy: flipper,
      instrument: 'BTC-USDT',
      params: { level: 100 },
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
    expect(result.state).toEqual({ run: { signals: 2, errors: 1 } })
    expect(result.elapsedMs).toBeGreaterThan(0)
    expect(progress.at(-1)).toMatchObject({ played: 4, total: 4, signals: 2 })

    // Cancellation lands per tick, not per chunk: a misconfigured sweep over a long
    // recording must stop the moment it is told to.
    const stopped = driveBacktest({ ticks, strategy: flipper, cancelled: () => true })
    expect(stopped).toMatchObject({ played: 0, cancelled: true, signals: [] })

    // No instrument means every tick, and no ticks means an honest empty run.
    expect(driveBacktest({ ticks, strategy: flipper }).total).toBe(5)
    expect(driveBacktest({ strategy: flipper })).toMatchObject({ total: 0, played: 0 })
  })
})
