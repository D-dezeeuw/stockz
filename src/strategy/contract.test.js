import { describe, it, expect } from 'vitest'
import {
  validateStrategyShape,
  defineStrategy,
  resolveParams,
  createStrategyContext,
  toSignal,
  HOOKS,
  SIGNAL_ACTIONS,
  NEUTRAL_SIGNAL,
} from './contract.js'

/** The smallest thing the contract accepts. */
function stub(overrides = {}) {
  return { id: 'mean-rev', onTick: () => null, onCandle: () => null, ...overrides }
}

describe('validateStrategyShape', () => {
  it('fails at registration rather than silently never firing', () => {
    expect(validateStrategyShape(stub())).toBe(true)
    // init is genuinely optional: plenty of strategies are stateless.
    expect(validateStrategyShape(stub({ init: () => null }))).toBe(true)

    // A misspelled hook that silently never fires is worse than a refusal to load — the
    // desk looks like it is running a strategy that is doing nothing at all.
    expect(() => validateStrategyShape(stub({ onTick: undefined }))).toThrow(/onTick/)
    expect(() => validateStrategyShape(stub({ onCandle: 'nope' }))).toThrow(/onCandle/)

    expect(() => validateStrategyShape(stub({ id: 'Mean Rev' }))).toThrow(/kebab-case/)
    expect(() => validateStrategyShape(stub({ params: 7 }))).toThrow(/params/)
    expect(() => validateStrategyShape(null)).toThrow(/object/)
    expect(HOOKS).toContain('onTick')
  })
})

describe('defineStrategy', () => {
  it('hands back something nobody can reach into and change mid-session', () => {
    const strategy = defineStrategy(stub({ name: 'Mean Reversion', params: { lookback: 20 } }))

    expect(strategy.id).toBe('mean-rev')
    expect(strategy.name).toBe('Mean Reversion')
    expect(Object.isFrozen(strategy)).toBe(true)
    expect(Object.isFrozen(strategy.params)).toBe(true)

    // init is defaulted so the runner can call all three without a branch in the per-tick
    // path.
    expect(typeof defineStrategy(stub()).init).toBe('function')
    expect(defineStrategy(stub()).init({})).toBeNull()
    // An id with no name is its own name.
    expect(defineStrategy(stub()).name).toBe('mean-rev')
  })
})

describe('resolveParams', () => {
  it('clamps the tuning, because a saved preset is not a trusted input', () => {
    const schema = { lookback: { default: 20, min: 5, max: 200 }, mode: { default: 'fast' } }

    expect(resolveParams(schema)).toEqual({ lookback: 20, mode: 'fast' })
    expect(resolveParams(schema, { lookback: 50 })).toEqual({ lookback: 50, mode: 'fast' })

    // An out-of-range value from an old tuning reaches the strategy clamped, not raw.
    expect(resolveParams(schema, { lookback: 5000 }).lookback).toBe(200)
    expect(resolveParams(schema, { lookback: 1 }).lookback).toBe(5)

    // A bare value is its own default.
    expect(resolveParams({ size: 3 })).toEqual({ size: 3 })
    expect(resolveParams(null)).toEqual({})
  })
})

describe('createStrategyContext', () => {
  it('gives a strategy the market and nothing else', () => {
    const ctx = createStrategyContext({
      strategy: defineStrategy(stub({ params: { lookback: { default: 20, max: 100 } } })),
      instrument: 'okx:BTC-USDT',
      params: { lookback: 900 },
      ind: { rsi: 71 },
      now: 1000,
    })

    expect(ctx.instrument).toBe('okx:BTC-USDT')
    expect(ctx.params.lookback).toBe(100)
    expect(ctx.ind.rsi).toBe(71)
    expect(ctx.now).toBe(1000)

    // No setValue, no order function, no live store — the unsafe thing is unreachable
    // rather than merely discouraged.
    expect(Object.keys(ctx).sort()).toEqual(['ind', 'instrument', 'log', 'now', 'params'])
    expect(Object.isFrozen(ctx)).toBe(true)
    expect(Object.isFrozen(ctx.ind)).toBe(true)

    expect(createStrategyContext().now).toBe(0)
    expect(typeof createStrategyContext().log.warn).toBe('function')
  })
})

describe('toSignal', () => {
  it('treats an unrecognised action as silence rather than as a guess', () => {
    expect(toSignal({ action: 'buy', strength: 0.5, reason: 'stretched' })).toEqual({
      action: 'buy',
      strength: 0.5,
      reason: 'stretched',
    })

    // Coercing a typo to 'flat' would have a misspelling close positions.
    expect(toSignal({ action: 'byu', strength: 1 })).toEqual(NEUTRAL_SIGNAL)
    expect(toSignal(null)).toEqual(NEUTRAL_SIGNAL)
    expect(toSignal('buy')).toEqual(NEUTRAL_SIGNAL)

    expect(toSignal({ action: 'sell', strength: 9 }).strength).toBe(1)
    expect(toSignal({ action: 'sell', strength: -2 }).strength).toBe(0)
    expect(toSignal({ action: 'flat' })).toEqual({ action: 'flat', strength: 0, reason: '' })
    expect(SIGNAL_ACTIONS).toContain('none')
  })
})
