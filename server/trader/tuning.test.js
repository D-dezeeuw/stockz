import { describe, it, expect } from 'vitest'
import { slide, tunedParams, tunedMinStrength, SENSITIVE_PARAMS } from './tuning.js'
import { STRATEGIES } from './engine.js'

describe('slide', () => {
  it('moves linearly from the author\'s default to the schema floor', () => {
    expect(slide(3, 1.5, 0)).toBe(3)
    expect(slide(3, 1.5, 1)).toBe(1.5)
    expect(slide(3, 1.5, 0.5)).toBe(2.25)

    // Clamped at both ends: a dial somebody typed 5 or -2 into must not push a threshold
    // past what the strategy declared legal.
    expect(slide(3, 1.5, 5)).toBe(1.5)
    expect(slide(3, 1.5, -1)).toBe(3)

    expect(slide('x', 1, 0.5)).toBe(NaN)
  })
})

describe('tunedParams', () => {
  it('lowers only threshold-shaped params, and nothing at all at zero', () => {
    const momentum = STRATEGIES.find((s) => s.id === 'momentum-burst')

    // Zero must mean *no overrides*, not overrides that happen to equal the defaults — a
    // caller comparing the two should be able to see the difference.
    expect(tunedParams(momentum, 0)).toEqual({})

    const hot = tunedParams(momentum, 1)
    expect(hot.multiple).toBe(1.5)
    // Windows and time stops change what a strategy *measures*, not how readily it acts.
    // Scaling them would quietly turn one strategy into a different one.
    expect(hot.windowMs).toBeUndefined()
    expect(hot.timeStopMs).toBeUndefined()

    // Whole-number params stay whole: `persistM: 2.4` updates is not a thing, and the
    // strategy compares it against a counter.
    const book = STRATEGIES.find((s) => s.id === 'book-imbalance')
    const half = tunedParams(book, 0.5)
    expect(Number.isInteger(half.persistM)).toBe(true)
    expect(half.threshold).toBeCloseTo(0.175, 5)

    // Every floor must name a real param and sit inside the range that param's own schema
    // declares legal — never below the min (which `resolveParams` would clamp away, making
    // the dial silently stop short) and never above the default (which would make turning
    // the dial *up* trade less).
    for (const strategy of STRATEGIES) {
      const floors = SENSITIVE_PARAMS[strategy.id] ?? {}
      for (const [key, floor] of Object.entries(floors)) {
        const spec = strategy.params[key]
        expect(spec, `${strategy.id}.${key} is not a real param`).toBeDefined()
        expect(floor).toBeGreaterThanOrEqual(spec.min)
        expect(floor).toBeLessThan(spec.default)
      }
    }

    // The one floor deliberately stricter than its schema: a pressure reading from a
    // single print is a coin flip with a reason string, not an aggressive tuning.
    const tape = STRATEGIES.find((s) => s.id === 'tape-pressure')
    expect(tape.params.minPrints.min).toBe(1)
    expect(SENSITIVE_PARAMS['tape-pressure'].minPrints).toBe(5)

    // An unknown strategy is left entirely alone rather than guessed at.
    expect(tunedParams({ id: 'made-up', params: {} }, 1)).toEqual({})
    expect(tunedParams(undefined, 1)).toEqual({})
  })
})

describe('tunedMinStrength', () => {
  it('relaxes the gate with the dial but never to zero', () => {
    expect(tunedMinStrength(0)).toBe(0.5)
    expect(tunedMinStrength(1)).toBeCloseTo(0.15, 5)

    // Never zero: a signal with no conviction at all is noise whatever the dial says, and
    // a floor of zero would turn every neutral tick into an order.
    expect(tunedMinStrength(1, 0.2)).toBeGreaterThanOrEqual(0.1)
    expect(tunedMinStrength(99)).toBeGreaterThanOrEqual(0.1)
  })
})
