import { describe, it, expect } from 'vitest'
import { createVwap, trueRange, createAtr, createStddev, zscore } from './volatility.js'
import { indicatorKit } from './index.js'

describe('createVwap', () => {
  it('weights by volume, so a one-lot print cannot drag the anchor', () => {
    const vwap = createVwap()

    expect(vwap.update(100, 1)).toBe(100)
    // 100×1 + 200×3 = 700 over 4 lots.
    expect(vwap.update(200, 3)).toBe(175)
    expect(vwap.volume()).toBe(4)
    expect(vwap.warm()).toBe(true)

    // A print with no size does not move a volume-weighted average; counting it would
    // quietly turn VWAP into a plain mean.
    expect(vwap.update(9999, 0)).toBe(175)
    expect(vwap.update(NaN, 5)).toBe(175)

    vwap.reset()
    expect(vwap.value()).toBe(0)
    expect(vwap.warm()).toBe(false)
  })
})

describe('trueRange', () => {
  it('counts the gap, because a gap through the bar is not a quiet bar', () => {
    expect(trueRange({ h: 105, l: 100 }, 102)).toBe(5)

    // Gapped up: the move from the previous close is the real range, not the bar's own
    // high minus low.
    expect(trueRange({ h: 120, l: 118 }, 100)).toBe(20)
    expect(trueRange({ h: 82, l: 80 }, 100)).toBe(20)

    // No previous close is the first bar, not a gap of unknown size.
    expect(trueRange({ h: 105, l: 100 })).toBe(5)
    expect(trueRange({}, 100)).toBe(0)
    expect(trueRange(null)).toBe(0)
  })
})

describe('createAtr', () => {
  it('fills the period with a plain mean before it starts smoothing', () => {
    const atr = createAtr(3)

    expect(atr.update({ h: 105, l: 100, c: 102 })).toBe(5)
    expect(atr.warm()).toBe(false)
    // TR = max(|110-104|, |110-102|, |104-102|) = 8; mean of 5 and 8 is 6.5.
    expect(atr.update({ h: 110, l: 104, c: 108 })).toBe(6.5)

    atr.update({ h: 112, l: 108, c: 110 })
    expect(atr.warm()).toBe(true)

    // Wilder smoothing from here: a single wide bar moves it a third of the way, not all.
    const before = atr.value()
    const after = atr.update({ h: 200, l: 100, c: 150 })
    expect(after).toBeGreaterThan(before)
    expect(after).toBeLessThan(100)

    expect(atr.update({})).toBe(after)
    atr.reset()
    expect(atr.value()).toBe(0)
  })
})

describe('createStddev', () => {
  it('stays exact over a rolling window, where the textbook formula loses its digits', () => {
    const sd = createStddev(4)

    sd.update(2)
    expect(sd.value()).toBe(0)
    sd.update(4)
    // Sample stddev of [2, 4] is √2.
    expect(sd.value()).toBeCloseTo(1.4142, 3)

    sd.update(4)
    sd.update(6)
    expect(sd.warm()).toBe(true)
    // [2,4,4,6]: mean 4, sample stddev √(8/3).
    expect(sd.value()).toBeCloseTo(1.633, 3)
    expect(sd.mean()).toBeCloseTo(4, 6)

    // The window evicts: [4,4,6,6] has the same shape a decay-only estimate would smear.
    sd.update(6)
    expect(sd.mean()).toBeCloseTo(5, 6)
    expect(sd.value()).toBeCloseTo(1.1547, 3)

    expect(sd.update(NaN)).toBe(sd.value())
    sd.reset()
    expect(sd.samples()).toBe(0)
  })
})

describe('zscore', () => {
  it('refuses to call a dead market the most extreme move ever recorded', () => {
    expect(zscore(110, 100, 5)).toBe(2)
    expect(zscore(90, 100, 5)).toBe(-2)
    expect(zscore(100, 100, 5)).toBe(0)

    // A flat series has no scale to measure against; Infinity here would light every
    // stretch signal at once.
    expect(zscore(110, 100, 0)).toBe(0)
    expect(zscore(110, 100, NaN)).toBe(0)
    expect(zscore(NaN, 100, 5)).toBe(0)
  })
})

describe('volatility barrel', () => {
  it('ships all three in the toolkit a strategy is handed', () => {
    const kit = indicatorKit()

    expect(typeof kit.createVwap).toBe('function')
    expect(typeof kit.createAtr).toBe('function')
    expect(typeof kit.createStddev).toBe('function')
    expect(typeof kit.zscore).toBe('function')
    expect(typeof kit.trueRange).toBe('function')
  })
})
