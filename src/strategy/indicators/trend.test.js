import { describe, it, expect } from 'vitest'
import { createEma, createRsi, isWarm, crossed } from './trend.js'
import { indicatorKit } from './index.js'

/** Wilder's own worked example — the series every RSI implementation is checked against. */
const WILDER = [
  44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61,
  46.28, 46.28,
]

describe('createEma', () => {
  it('seeds on its first sample instead of climbing out of zero', () => {
    const ema = createEma(3)

    // An EMA that spends its first hundred ticks climbing from 0 to 60000 is not a slow
    // reading, it is a wrong one.
    expect(ema.update(10)).toBe(10)
    expect(ema.warm()).toBe(false)

    // alpha = 2/(3+1) = 0.5
    expect(ema.update(20)).toBe(15)
    expect(ema.update(20)).toBe(17.5)
    expect(ema.warm()).toBe(true)

    // A junk print neither moves the average nor counts toward warmup.
    expect(ema.update(NaN)).toBe(17.5)
    expect(ema.samples()).toBe(3)

    ema.reset()
    expect(ema.value()).toBe(0)
    expect(createEma(0).update(5)).toBe(5)
  })
})

describe('createRsi', () => {
  it('matches Wilder’s own worked series, which is the only real proof it is right', () => {
    const rsi = createRsi(14)
    let last = 50
    for (const px of WILDER) last = rsi.update(px)

    // Wilder's first 14-period RSI on this series is ~70.5.
    expect(last).toBeCloseTo(70.5, 0)
    expect(rsi.warm()).toBe(true)

    // No losses at all is 100 by definition, not a division by zero.
    const rising = createRsi(2)
    rising.update(1)
    rising.update(2)
    expect(rising.update(3)).toBe(100)

    const flat = createRsi(2)
    flat.update(5)
    expect(flat.update(5)).toBe(50)

    expect(rsi.update(NaN)).toBe(last)
    rsi.reset()
    expect(rsi.value()).toBe(50)
  })
})

describe('isWarm', () => {
  it('keeps a strategy off a reading that is noise dressed as a number', () => {
    const ema = createEma(3)
    ema.update(1)

    expect(isWarm(ema)).toBe(false)
    ema.update(2)
    ema.update(3)
    expect(isWarm(ema)).toBe(true)

    // An explicit period overrides the indicator's own opinion of warm.
    expect(isWarm(ema, 10)).toBe(false)
    expect(isWarm({ samples: 5 }, 3)).toBe(true)
    expect(isWarm({ samples: 0 })).toBe(false)
    expect(isWarm(null)).toBe(false)
  })
})

describe('crossed', () => {
  it('does not fire twice on a pair that merely touched', () => {
    expect(crossed(2, 1, 0, 1)).toBe(1)
    expect(crossed(0, 1, 2, 1)).toBe(-1)

    // Touching is not crossing: a pair that met exactly and separated the same way would
    // otherwise fire on both frames.
    expect(crossed(1, 1, 0, 1)).toBe(0)
    expect(crossed(2, 1, 1, 1)).toBe(0)

    expect(crossed(2, 1, 1.5, 1)).toBe(0)
    expect(crossed(NaN, 1, 0, 1)).toBe(0)
  })
})

describe('indicatorKit', () => {
  it('hands a strategy the toolkit so it imports nothing of its own', () => {
    const kit = indicatorKit({ rsi: 71 })

    expect(typeof kit.createEma).toBe('function')
    expect(typeof kit.crossed).toBe('function')
    // Live readings the desk already keeps merge in beside the constructors.
    expect(kit.rsi).toBe(71)
    expect(Object.keys(indicatorKit())).toContain('createEma')
  })
})

describe('indicator hot path', () => {
  it('stays cheap enough to run on every tick of every instrument', () => {
    const ema = createEma(20)
    const rsi = createRsi(14)

    const started = performance.now()
    for (let i = 0; i < 100000; i += 1) {
      ema.update(100 + (i % 7))
      rsi.update(100 + (i % 7))
    }
    const perUpdate = (performance.now() - started) / 100000

    // Two indicators per tick at 5µs each is 1% of a 60fps frame budget at 100 ticks a
    // second. A ceiling this loose still catches an accidental allocation or a slice.
    expect(perUpdate).toBeLessThan(0.005)
  })
})
