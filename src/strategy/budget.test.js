import { describe, it, expect } from 'vitest'
import {
  measureTick,
  costEwma,
  overBudget,
  throttleStride,
  shouldRunTick,
  recordCost,
  DEFAULT_BUDGET_MS,
  COST_ALPHA,
  STRIDES,
} from './budget.js'

describe('measureTick', () => {
  it('times the call without changing what it returns', () => {
    let clock = 1000
    const timed = measureTick((a, b) => a + b, { clock: () => (clock += 3) })

    expect(timed(2, 3)).toEqual({ result: 5, costMs: 3 })

    // A missing hook costs nothing rather than throwing inside the frame pump.
    expect(measureTick(null)()).toEqual({ result: undefined, costMs: 0 })
  })
})

describe('costEwma', () => {
  it('seeds on the first sample, so a new run is judged on what it actually cost', () => {
    expect(costEwma(undefined, 4)).toBe(4)

    // alpha 0.2: one spike moves the estimate a fifth of the way, not all of it.
    expect(costEwma(1, 6)).toBe(2)
    expect(costEwma(1, NaN)).toBe(1)
    expect(COST_ALPHA).toBe(0.2)
  })
})

describe('overBudget', () => {
  it('holds a verdict through the wobble instead of flapping on the boundary', () => {
    expect(overBudget(3, 2)).toBe(true)
    expect(overBudget(2, 2)).toBe(false)

    // Already throttled, it takes a drop to 80% of budget to be let back up — without the
    // hysteresis a strategy sitting on its budget flaps every few ticks.
    expect(overBudget(1.9, 2, true)).toBe(true)
    expect(overBudget(1.5, 2, true)).toBe(false)

    expect(overBudget(3, 0)).toBe(true)
    expect(overBudget(1, undefined)).toBe(false)
    expect(DEFAULT_BUDGET_MS).toBe(2)
  })
})

describe('throttleStride', () => {
  it('degrades in steps, because a degraded signal is still a signal', () => {
    expect(throttleStride(1, 2)).toBe(1)
    expect(throttleStride(3, 2)).toBe(2)
    expect(throttleStride(10, 2)).toBe(4)
    expect(throttleStride(20, 2)).toBe(8)

    // Silently disabling one would leave the trader watching a strategy they believe is
    // running — so the worst case is still every eighth tick, never zero.
    expect(throttleStride(9999, 2)).toBe(STRIDES[2])
  })
})

describe('shouldRunTick', () => {
  it('gates cheaply, with a modulo and nothing else in the hot path', () => {
    expect(shouldRunTick(0, 4)).toBe(true)
    expect(shouldRunTick(1, 4)).toBe(false)
    expect(shouldRunTick(4, 4)).toBe(true)

    expect(shouldRunTick(7, 1)).toBe(true)
    expect(shouldRunTick(7, 0)).toBe(true)
    expect(shouldRunTick(NaN, 4)).toBe(true)
  })
})

describe('recordCost', () => {
  it('carries the verdict on the run, so the row can show it before it hurts', () => {
    const run = { budgetMs: 2 }

    expect(recordCost(run, 1)).toEqual({ costMs: 1, stride: 1, throttled: false })

    // A sustained overrun throttles.
    for (let i = 0; i < 20; i += 1) recordCost(run, 9)
    expect(run.throttled).toBe(true)
    expect(run.stride).toBe(4)
    expect(run.costMs).toBeCloseTo(9, 0)

    // And it comes back down once the cost does.
    for (let i = 0; i < 40; i += 1) recordCost(run, 0.5)
    expect(run.throttled).toBe(false)
    expect(run.stride).toBe(1)

    expect(recordCost(null, 3).costMs).toBe(3)
  })
})
