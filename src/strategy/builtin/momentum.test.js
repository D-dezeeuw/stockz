import { describe, it, expect } from 'vitest'
import {
  tickVelocity,
  windowDelta,
  velocityBaseline,
  burstSignal,
  decayExit,
  momentumTick,
  momentumStrategy,
  VELOCITY_RING,
} from './momentum.js'
import { createStrategyContext } from '../contract.js'

/** `{ts, px}` prints, oldest first. */
function prints(...pairs) {
  return pairs.map(([ts, px]) => ({ ts, px }))
}

describe('tickVelocity', () => {
  it('measures how fast the tape is, which leads price on a burst', () => {
    const rows = prints([100, 1], [200, 1], [300, 1], [1500, 1], [1600, 1])

    // Two prints inside the last second (cutoff 1000) is two a second.
    expect(tickVelocity(rows, 2000, 1000)).toBe(2)
    // The whole set over two seconds is 2.5/s.
    expect(tickVelocity(rows, 2000, 2000)).toBe(2.5)

    expect(tickVelocity([], 2000, 1000)).toBe(0)
    expect(tickVelocity(rows, NaN, 1000)).toBe(0)
    expect(VELOCITY_RING).toBe(256)
  })
})

describe('windowDelta', () => {
  it('turns a speed reading into a direction, which speed alone cannot give', () => {
    const rows = prints([1500, 100], [1700, 102], [1900, 105])

    expect(windowDelta(rows, 2000, 1000)).toBe(5)
    expect(windowDelta(prints([1500, 105], [1900, 100]), 2000, 1000)).toBe(-5)

    // Nothing inside the window is no move, not an unknown one.
    expect(windowDelta(prints([10, 100], [20, 200]), 5000, 1000)).toBe(0)
    expect(windowDelta([], 2000, 1000)).toBe(0)
    expect(windowDelta(rows, NaN, 1000)).toBe(0)
  })
})

describe('velocityBaseline', () => {
  it('moves slowly, or it would erase the very spike it exists to detect', () => {
    // Seeded on the first sample: crawling out of zero would call the first thirty seconds
    // of every session a burst.
    expect(velocityBaseline(0, 4)).toBe(4)

    // A 20× spike barely moves it at alpha 0.05.
    expect(velocityBaseline(4, 80)).toBeCloseTo(7.8, 1)
    expect(velocityBaseline(4, 80, 0.5)).toBe(42)

    expect(velocityBaseline(4, NaN)).toBe(4)
    expect(velocityBaseline(4, 8, 0)).toBeCloseTo(4.2, 1)
  })
})

describe('burstSignal', () => {
  it('refuses the fast-but-flat tape, which is the most expensive thing to trade', () => {
    expect(burstSignal(12, 4, 3, 5)).toMatchObject({ action: 'buy' })
    expect(burstSignal(12, 4, 3, -5)).toMatchObject({ action: 'sell' })
    expect(burstSignal(12, 4, 3, 5).reason).toMatch(/3.0× baseline, up/)

    // Fast and going nowhere is a two-sided fight: both sides are there in size.
    expect(burstSignal(12, 4, 3, 0)).toBeNull()
    // Not fast enough is not a burst.
    expect(burstSignal(11, 4, 3, 5)).toBeNull()
    // A zero baseline would make the first print of the session infinitely fast.
    expect(burstSignal(12, 0, 3, 5)).toBeNull()

    // Conviction scales with the overage and saturates.
    expect(burstSignal(12, 4, 3, 5).strength).toBeCloseTo(0.5, 2)
    expect(burstSignal(40, 4, 3, 5).strength).toBe(1)
  })
})

describe('decayExit', () => {
  it('takes the time stop unconditionally, which is where the day’s losses are made', () => {
    // Still fast, still inside the stop: hold.
    expect(decayExit(1000, 3000, 12, 4, 8000)).toBe('')

    // The flow that was carrying the trade has gone.
    expect(decayExit(1000, 3000, 4, 4, 8000)).toBe('burst decayed')

    // The time stop wins even while the tape is still fast.
    expect(decayExit(1000, 9000, 40, 4, 8000)).toBe('time stop')

    expect(decayExit(0, 9000, 4, 4, 8000)).toBe('')
    expect(decayExit(1000, NaN, 4, 4, 8000)).toBe('')
  })
})

describe('momentumTick', () => {
  it('fires on the burst, then closes the trade rather than riding it out', () => {
    const ctx = createStrategyContext({
      strategy: momentumStrategy,
      instrument: 'okx:BTC-USDT',
      params: { windowMs: 1000, multiple: 3, timeStopMs: 8000, alpha: 0.01 },
    })
    momentumStrategy.init(ctx)

    // Quiet tape: one print a second for a minute establishes the baseline.
    for (let i = 1; i <= 60; i += 1) momentumTick(ctx, { ts: i * 1000, px: 100 })
    expect(ctx.state.baseline).toBeCloseTo(1, 1)

    // Then the tape goes fast and up.
    let fired = null
    for (let i = 0; i < 12; i += 1) {
      fired = momentumTick(ctx, { ts: 60000 + i * 20, px: 100 + i * 0.1 }) ?? fired
    }
    expect(fired).toMatchObject({ action: 'buy' })
    expect(ctx.state.entryTs).toBeGreaterThan(0)

    // Well past the time stop, it flattens rather than holding on.
    const exit = momentumTick(ctx, { ts: 90000, px: 101 })
    expect(exit).toMatchObject({ action: 'flat', reason: 'time stop' })
    expect(ctx.state.entryTs).toBe(0)

    expect(momentumTick({ state: {} }, { px: 1 })).toBeNull()
  })
})

describe('momentumStrategy', () => {
  it('keeps its tape in the run’s own scratchpad, never in module scope', () => {
    expect(momentumStrategy.id).toBe('momentum-burst')

    const a = createStrategyContext({ strategy: momentumStrategy, instrument: 'okx:BTC-USDT' })
    const b = createStrategyContext({ strategy: momentumStrategy, instrument: 'okx:ETH-USDT' })
    momentumStrategy.init(a)
    momentumStrategy.init(b)

    momentumTick(a, { ts: 1000, px: 100 })

    // Two runs on two instruments never share a tape.
    expect(a.state.prints.size()).toBe(1)
    expect(b.state.prints.size()).toBe(0)
    expect(momentumStrategy.onCandle()).toBeNull()
  })
})
