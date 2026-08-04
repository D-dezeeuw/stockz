import { describe, it, expect } from 'vitest'
import {
  classifyAggressor,
  aggressorRatio,
  ratioShift,
  pressureSignal,
  normalizeExit,
  pressureTick,
  tapePressureStrategy,
  TAPE_RING,
} from './tape-pressure.js'
import { createStrategyContext } from '../contract.js'

function reading(params = {}) {
  const ctx = createStrategyContext({
    strategy: tapePressureStrategy,
    instrument: 'okx:BTC-USDT',
    params: {
      windowMs: 10000,
      shiftMs: 10000,
      threshold: 0.15,
      minPrints: 5,
      neutralBand: 0.05,
      timeStopMs: 20000,
      ...params,
    },
  })
  tapePressureStrategy.init(ctx)
  return ctx
}

/** `{ts, size, dir}` rows, oldest first. */
function rows(...triples) {
  return triples.map(([ts, size, dir]) => ({ ts, size, dir }))
}

describe('classifyAggressor', () => {
  it('takes the venue’s own label over any inference, and refuses to guess on a flat print', () => {
    expect(classifyAggressor({ side: 'buy' }, 100)).toBe(1)
    expect(classifyAggressor({ side: 'SELL' }, 100)).toBe(-1)

    // The tick rule as a fallback: above the last is a lift, below is a hit.
    expect(classifyAggressor({ px: 101 }, 100)).toBe(1)
    expect(classifyAggressor({ px: 99 }, 100)).toBe(-1)

    // Guessing on an unchanged print would bias the ratio toward whatever came before.
    expect(classifyAggressor({ px: 100 }, 100)).toBe(0)
    expect(classifyAggressor({ px: 100 }, NaN)).toBe(0)
    expect(classifyAggressor(null)).toBe(0)
  })
})

describe('aggressorRatio', () => {
  it('weights by size, because the block is what moved the price and the one-lots are not', () => {
    // One 10-lot sell against five 1-lot buys: bullish by count, bearish by size.
    const tape = rows([1000, 1, 1], [1100, 1, 1], [1200, 1, 1], [1300, 1, 1], [1400, 1, 1], [1500, 10, -1])

    expect(aggressorRatio(tape, 2000, 10000).ratio).toBeCloseTo(0.333, 2)
    expect(aggressorRatio(tape, 2000, 10000).prints).toBe(6)

    // Only the window counts.
    expect(aggressorRatio(tape, 12000, 1000).prints).toBe(0)

    // An empty window is balanced, not maximum selling pressure on a quiet tape.
    expect(aggressorRatio([], 2000, 10000)).toEqual({ ratio: 0.5, prints: 0, volume: 0 })
    expect(aggressorRatio(tape, NaN, 10000).ratio).toBe(0.5)
  })
})

describe('ratioShift', () => {
  it('reports the move, which is the signal — the level is already priced in', () => {
    expect(ratioShift(0.7, 0.45)).toBe(0.25)
    expect(ratioShift(0.3, 0.55)).toBe(-0.25)

    // A tape at 70% all session is an instrument with a bid to it, not a trade.
    expect(ratioShift(0.7, 0.7)).toBe(0)
    expect(ratioShift(NaN, 0.5)).toBe(0)
  })
})

describe('pressureSignal', () => {
  it('refuses a thin tape, where it would otherwise fire hardest', () => {
    expect(pressureSignal(0.25, 0.15, 40, 20)).toMatchObject({ action: 'buy' })
    expect(pressureSignal(-0.25, 0.15, 40, 20)).toMatchObject({ action: 'sell' })
    expect(pressureSignal(0.25, 0.15, 40, 20).reason).toMatch(/\+25% over 40 prints/)

    // Three prints can swing a ratio from 0 to 1 and mean nothing at all.
    expect(pressureSignal(0.9, 0.15, 3, 20)).toBeNull()
    expect(pressureSignal(0.05, 0.15, 40, 20)).toBeNull()

    expect(pressureSignal(0.3, 0.15, 40, 20).strength).toBe(1)
  })
})

describe('normalizeExit', () => {
  it('takes the time stop unconditionally, since urgency is short-lived by definition', () => {
    const entry = { side: 'buy', ts: 1000 }

    expect(normalizeExit(entry, 0.7, 5000, 0.05, 20000)).toBe('')

    // Whoever was in a hurry has finished.
    expect(normalizeExit(entry, 0.52, 5000, 0.05, 20000)).toBe('pressure normalised')

    // A pressure trade held past the stop is a directional bet nobody decided to take.
    expect(normalizeExit(entry, 0.9, 30000, 0.05, 20000)).toBe('time stop')

    expect(normalizeExit(null, 0.5, 5000, 0.05, 20000)).toBe('')
    expect(normalizeExit(entry, NaN, 5000, 0.05, 20000)).toBe('')
  })
})

describe('pressureTick', () => {
  it('fires on the arrival, then lets the trade go when the hurry stops', () => {
    const ctx = reading()

    // A balanced tape for a while.
    for (let i = 0; i < 20; i += 1) {
      pressureTick(ctx, { ts: 1000 + i * 100, px: 100, side: i % 2 ? 'buy' : 'sell', size: 1 })
    }

    // Then buyers arrive in size.
    let fired = null
    for (let i = 0; i < 20; i += 1) {
      fired = pressureTick(ctx, { ts: 12000 + i * 100, px: 100, side: 'buy', size: 5 }) ?? fired
    }
    expect(fired).toMatchObject({ action: 'buy' })
    expect(ctx.state.entry.side).toBe('buy')

    // Past the time stop it lets go rather than holding a directional bet.
    const exit = pressureTick(ctx, { ts: 60000, px: 100, side: 'buy', size: 1 })
    expect(exit).toMatchObject({ action: 'flat', reason: 'time stop' })
    expect(ctx.state.entry).toBeNull()

    expect(pressureTick({ state: {} }, { px: 1 })).toBeNull()
  })
})

describe('tapePressureStrategy', () => {
  it('keeps its tape per run, and ships the ring bound with it', () => {
    expect(tapePressureStrategy.id).toBe('tape-pressure')
    expect(TAPE_RING).toBe(512)

    const a = reading()
    const b = reading()
    pressureTick(a, { ts: 1000, px: 100, side: 'buy', size: 1 })

    expect(a.state.prints.size()).toBe(1)
    expect(b.state.prints.size()).toBe(0)
    expect(tapePressureStrategy.onCandle()).toBeNull()
  })
})
