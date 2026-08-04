import { describe, it, expect } from 'vitest'
import {
  swingPoints,
  levelCluster,
  touchReject,
  fadeSignal,
  levelBreak,
  fadeTick,
  publishLevels,
  rangeFadeStrategy,
  RANGE_RING,
} from './range-fade.js'
import { createStrategyContext } from '../contract.js'
import { appState, tick, resetState } from '../../app/engine.js'

function fading(params = {}) {
  const ctx = createStrategyContext({
    strategy: rangeFadeStrategy,
    instrument: 'okx:BTC-USDT',
    params: {
      fractal: 2,
      mergeTicks: 2,
      rejectTicks: 2,
      stopBufferTicks: 2,
      breakTicks: 3,
      tickSize: 0.1,
      ...params,
    },
  })
  rangeFadeStrategy.init(ctx)
  return ctx
}

describe('swingPoints', () => {
  it('confirms a swing only after price comes off it, which is the point of a level', () => {
    // A clean peak at index 3 and a trough at index 7.
    const swings = swingPoints([100, 101, 102, 105, 102, 101, 100, 98, 100, 101, 102], 2)

    expect(swings).toEqual([
      { px: 105, kind: 'high', index: 3 },
      { px: 98, kind: 'low', index: 7 },
    ])

    // The newest prints cannot be swings yet: a level called at the moment of the extreme
    // is just the last price.
    expect(swingPoints([100, 101, 102, 105], 2)).toEqual([])
    expect(swingPoints([], 2)).toEqual([])
    expect(swingPoints(null, 2)).toEqual([])
  })
})

describe('levelCluster', () => {
  it('merges the near-identical touches that would otherwise look like three fresh levels', () => {
    const levels = levelCluster(
      [
        { px: 100, kind: 'high' },
        { px: 100.1, kind: 'high' },
        { px: 99.9, kind: 'high' },
        { px: 95, kind: 'low' },
      ],
      2,
      0.1,
    )

    expect(levels).toHaveLength(2)
    expect(levels[0]).toMatchObject({ kind: 'high', touches: 3 })
    // Sits at the average of its touches, so a band that drifted is described where it is.
    expect(levels[0].px).toBeCloseTo(100, 1)

    // A high and a low at the same price are two different levels.
    expect(levelCluster([{ px: 100, kind: 'high' }, { px: 100, kind: 'low' }], 2, 0.1)).toHaveLength(2)
    expect(levelCluster(null, 2, 0.1)).toEqual([])
  })
})

describe('touchReject', () => {
  it('waits for the rejection print, because a touch alone is only a test', () => {
    const high = { px: 100, kind: 'high' }

    // Price at the level then coming back off it: the level held.
    expect(touchReject(high, 99.8, 100, 2, 0.1)).toBe('sell')
    // Still going up at the level is not a rejection.
    expect(touchReject(high, 100.2, 100, 2, 0.1)).toBe('')

    const low = { px: 95, kind: 'low' }
    expect(touchReject(low, 95.2, 95, 2, 0.1)).toBe('buy')

    // Nowhere near the level is no setup.
    expect(touchReject(high, 90, 90.5, 2, 0.1)).toBe('')
    expect(touchReject(null, 100, 100, 2, 0.1)).toBe('')
  })
})

describe('fadeSignal', () => {
  it('puts the stop just past the level and caps conviction on a well-worn one', () => {
    const level = { px: 100, kind: 'high', touches: 2 }
    const signal = fadeSignal(level, 'sell', 2, 0.1)

    expect(signal).toMatchObject({ action: 'sell', stop: 100.2 })
    expect(signal.reason).toMatch(/fade high 100 \(2 touches\)/)
    expect(signal.strength).toBeCloseTo(0.7, 2)

    // A level tested ten times is one about to break, so conviction is capped rather than
    // growing with the count.
    expect(fadeSignal({ px: 100, kind: 'high', touches: 10 }, 'sell', 2, 0.1).strength).toBe(0.9)

    expect(fadeSignal({ px: 100, kind: 'low' }, 'buy', 2, 0.1).stop).toBe(99.8)
    expect(fadeSignal(null, 'sell', 2, 0.1)).toBeNull()
    expect(fadeSignal(level, 'sideways', 2, 0.1)).toBeNull()
  })
})

describe('levelBreak', () => {
  it('deletes rather than downgrades, so a fade never fights a breakout', () => {
    const high = { px: 100, kind: 'high' }

    expect(levelBreak(high, 100.2, 3, 0.1)).toBe(false)
    expect(levelBreak(high, 100.4, 3, 0.1)).toBe(true)

    const low = { px: 95, kind: 'low' }
    expect(levelBreak(low, 94.6, 3, 0.1)).toBe(true)
    expect(levelBreak(low, 95.5, 3, 0.1)).toBe(false)

    expect(levelBreak(null, 100, 3, 0.1)).toBe(false)
  })
})

describe('fadeTick', () => {
  it('drops the trade the moment the range ends, which is the only way a fade loses', () => {
    const ctx = fading()

    // A band between roughly 98 and 102, walked twice so both edges confirm.
    const band = [100, 101, 102, 101, 100, 99, 98, 99, 100, 101, 102, 101, 100, 99, 98, 99, 100]
    for (const px of band) fadeTick(ctx, { px })
    expect(ctx.state.levels.length).toBeGreaterThan(0)

    // Touch the top and reject.
    fadeTick(ctx, { px: 102 })
    const fired = fadeTick(ctx, { px: 101.5 })
    expect(fired).toMatchObject({ action: 'sell' })

    // A clean break upward closes it immediately rather than holding for the range.
    const exit = fadeTick(ctx, { px: 110 })
    expect(exit).toMatchObject({ action: 'flat', reason: 'level broke' })
    expect(ctx.state.entry).toBeNull()

    expect(fadeTick({ state: {} }, { px: 1 })).toBeNull()
  })
})

describe('rangeFadeStrategy', () => {
  it('keeps its levels per run, so one instrument’s band cannot arm another', () => {
    expect(rangeFadeStrategy.id).toBe('range-fade')
    expect(RANGE_RING).toBe(256)

    const a = fading()
    const b = fading()
    fadeTick(a, { px: 100 })

    expect(a.state.prints.size()).toBe(1)
    expect(b.state.prints.size()).toBe(0)
    expect(rangeFadeStrategy.onCandle()).toBeNull()
  })
})

describe('publishLevels', () => {
  it('hands the chart plain numbers, never the strategy’s own objects', () => {
    resetState()

    const rows = publishLevels([{ px: 100, kind: 'high', touches: 3 }, { px: 95, kind: 'low' }])
    tick()

    expect(rows).toEqual([
      { px: 100, kind: 'high', touches: 3 },
      { px: 95, kind: 'low', touches: 0 },
    ])
    expect(appState.market.levels).toHaveLength(2)
    expect(publishLevels(null)).toEqual([])
  })
})
