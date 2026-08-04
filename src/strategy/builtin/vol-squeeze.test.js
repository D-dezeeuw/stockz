import { describe, it, expect } from 'vitest'
import {
  microRange,
  squeezeDetect,
  expansionTrigger,
  squeezeSignal,
  contractionExit,
  squeezeTick,
  volSqueezeStrategy,
  SQUEEZE_RING,
} from './vol-squeeze.js'
import { createStrategyContext } from '../contract.js'

function squeezing(params = {}) {
  const ctx = createStrategyContext({
    strategy: volSqueezeStrategy,
    instrument: 'okx:BTC-USDT',
    params: { lookback: 10, pctThreshold: 0.2, k: 3, targetTicks: 10, tickSize: 0.1, ...params },
  })
  volSqueezeStrategy.init(ctx)
  return ctx
}

describe('microRange', () => {
  it('emits only on the second boundary, never mid-bucket', () => {
    const state = {}

    expect(microRange(state, 100, 1000)).toBeNull()
    expect(microRange(state, 102, 1400)).toBeNull()
    expect(microRange(state, 99, 1900)).toBeNull()

    // The bucket closes when the next second starts, carrying its range and direction.
    const closed = microRange(state, 101, 2100)
    expect(closed).toEqual({ range: 3, close: 99, delta: -1 })

    expect(microRange(state, NaN, 3000)).toBeNull()
    expect(microRange(null, 100, 1000)).toBeNull()
  })
})

describe('squeezeDetect', () => {
  it('refuses to call a squeeze before it has history to compare against', () => {
    // Nine quiet buckets and a lookback of ten: not yet an opinion.
    expect(squeezeDetect([1, 1, 1, 1, 1, 1, 1, 1, 1], 10, 0.2).active).toBe(false)

    // Ten buckets, the newest among the quietest.
    const quiet = [5, 4, 6, 5, 4, 5, 6, 4, 5, 1]
    expect(squeezeDetect(quiet, 10, 0.2).active).toBe(true)

    // The newest being the loudest is the opposite of a squeeze.
    const loud = [1, 1, 1, 1, 1, 1, 1, 1, 1, 9]
    expect(squeezeDetect(loud, 10, 0.2).active).toBe(false)
    expect(squeezeDetect(loud, 10, 0.2).avg).toBeCloseTo(1.8, 1)

    expect(squeezeDetect(null, 10, 0.2).active).toBe(false)
  })
})

describe('expansionTrigger', () => {
  it('refuses to take a side in a wide bucket that closed where it opened', () => {
    expect(expansionTrigger({ range: 9, delta: 2 }, 2, 3)).toBe('buy')
    expect(expansionTrigger({ range: 9, delta: -2 }, 2, 3)).toBe('sell')

    // Not wide enough is not an expansion.
    expect(expansionTrigger({ range: 5, delta: 2 }, 2, 3)).toBe('')
    // A two-sided fight is the most expensive way to be right about volatility.
    expect(expansionTrigger({ range: 9, delta: 0 }, 2, 3)).toBe('')

    expect(expansionTrigger({ range: 9, delta: 2 }, 0, 3)).toBe('')
    expect(expansionTrigger(null, 2, 3)).toBe('')
  })
})

describe('squeezeSignal', () => {
  it('needs the quiet first, or it is just a volatile market', () => {
    const signal = squeezeSignal(true, 'buy', { range: 10 }, 2)
    expect(signal).toMatchObject({ action: 'buy' })
    expect(signal.reason).toMatch(/expansion 5.0× squeeze/)

    // Expansion out of nowhere in particular is not the trade.
    expect(squeezeSignal(false, 'buy', { range: 10 }, 2)).toBeNull()
    expect(squeezeSignal(true, '', { range: 10 }, 2)).toBeNull()
    expect(squeezeSignal(true, 'buy', { range: 10 }, 0).strength).toBe(0.5)
  })
})

describe('contractionExit', () => {
  it('lets go when the volatility does, because the volatility was the trade', () => {
    const entry = { side: 'buy', px: 100 }

    expect(contractionExit(entry, { range: 9 }, 2, 100.5, 10, 0.1)).toBe('')
    expect(contractionExit(entry, { range: 9 }, 2, 101, 10, 0.1)).toBe('target hit')

    // Back into contraction: the expansion is over and so is the reason to hold.
    expect(contractionExit(entry, { range: 2 }, 2, 100.5, 10, 0.1)).toBe('back into contraction')

    expect(contractionExit(null, { range: 2 }, 2, 100, 10, 0.1)).toBe('')
    expect(contractionExit(entry, {}, 0, 100.5, 10, 0.1)).toBe('')
  })
})

describe('squeezeTick', () => {
  it('does its work per closed bucket, not per print', () => {
    const ctx = squeezing()

    // Twelve very quiet seconds.
    for (let s = 1; s <= 12; s += 1) {
      squeezeTick(ctx, { ts: s * 1000, px: 100 })
      squeezeTick(ctx, { ts: s * 1000 + 500, px: 100.1 })
    }
    expect(ctx.state.squeezed).toBe(true)

    // Then one second that moves hard, up.
    squeezeTick(ctx, { ts: 13000, px: 100 })
    squeezeTick(ctx, { ts: 13500, px: 105 })
    const fired = squeezeTick(ctx, { ts: 14100, px: 105 })

    expect(fired).toMatchObject({ action: 'buy' })
    expect(ctx.state.entry.side).toBe('buy')

    expect(squeezeTick({ state: {} }, { px: 1 })).toBeNull()
  })
})

describe('volSqueezeStrategy', () => {
  it('measures volatility against its own history, per run', () => {
    expect(volSqueezeStrategy.id).toBe('vol-squeeze')
    expect(SQUEEZE_RING).toBe(300)

    const a = squeezing()
    const b = squeezing()
    squeezeTick(a, { ts: 1000, px: 100 })
    squeezeTick(a, { ts: 2100, px: 101 })

    expect(a.state.ranges.size()).toBe(1)
    expect(b.state.ranges.size()).toBe(0)
    expect(volSqueezeStrategy.onCandle()).toBeNull()
  })
})
