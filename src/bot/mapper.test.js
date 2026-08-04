import { describe, it, expect, beforeEach } from 'vitest'
import { snapToStep, ruleSize, routeInstrument, mapSignalToOrder, rulesFor, SIZE_RULES } from './mapper.js'
import { setValue, tick, resetState } from '../app/engine.js'

function signal(overrides = {}) {
  return {
    action: 'buy',
    strength: 0.8,
    reason: 'burst',
    source: 'momentum-burst',
    instrument: 'okx:BTC-USDT',
    ts: 1000,
    ...overrides,
  }
}

beforeEach(() => {
  resetState()
})

describe('snapToStep', () => {
  it('floors onto the grid, because a cap sometimes exceeded is not a cap', () => {
    expect(snapToStep(1.27, 0.1)).toBe(1.2)
    expect(snapToStep(1.0, 0.1)).toBe(1)

    // Rounding up would turn a size the trader capped into one a hair above it.
    expect(snapToStep(0.999, 0.5)).toBe(0.5)

    // A value already exactly on the grid stays there: `70000.2 / 0.1` is
    // 700001.9999999999 in floating point, and a naive floor drops it a whole tick.
    expect(snapToStep(70000.2, 0.1)).toBe(70000.2)

    expect(snapToStep(5, 0)).toBe(5)
    expect(snapToStep(NaN, 0.1)).toBe(0)
  })
})

describe('ruleSize', () => {
  it('never divides by a zero price, which is how a bot asks for an infinite position', () => {
    expect(ruleSize({ rule: 'fixed', size: 0.05 }, 70000)).toBe(0.05)

    // 2% of 10000 at a price of 100 is 2 units.
    expect(ruleSize({ rule: 'equityPct', equityPct: 2, equity: 10000 }, 100)).toBe(2)

    expect(ruleSize({ rule: 'equityPct', equityPct: 2, equity: 10000 }, 0)).toBe(0)
    expect(ruleSize({ rule: 'equityPct', equityPct: 2, equity: 0 }, 100)).toBe(0)
    // An unknown rule is the safe one, not a crash.
    expect(ruleSize({ rule: 'wishful', size: 0.05 }, 100)).toBe(0.05)
    expect(SIZE_RULES).toContain('equityPct')
  })
})

describe('routeInstrument', () => {
  it('splits the qualified symbol the desk uses into what a venue expects', () => {
    expect(routeInstrument('okx:BTC-USDT')).toEqual({ venue: 'okx', instId: 'BTC-USDT' })
    expect(routeInstrument('etoro:BTC')).toEqual({ venue: 'etoro', instId: 'BTC' })

    // An unqualified symbol is assumed to be the venue the desk actually trades.
    expect(routeInstrument('BTC-USDT').venue).toBe('okx')
    expect(routeInstrument('').instId).toBe('')
  })
})

describe('mapSignalToOrder', () => {
  it('places a passive entry behind the touch, not in front of it', () => {
    const market = mapSignalToOrder(signal(), { size: 0.05, mid: 70000, lotSize: 0.001 })

    expect(market.ok).toBe(true)
    expect(market.order).toMatchObject({
      venue: 'okx',
      instrument: 'BTC-USDT',
      side: 'buy',
      type: 'market',
      size: 0.05,
      origin: 'bot',
      strategy: 'momentum-burst',
    })

    // In front of the touch is a market order wearing a limit order's name.
    const limit = mapSignalToOrder(signal(), {
      size: 0.05,
      mid: 70000,
      lotSize: 0.001,
      tickSize: 0.1,
      type: 'limit',
      offsetTicks: 2,
    })
    expect(limit.order).toMatchObject({ type: 'limit', price: 69999.8 })
    expect(
      mapSignalToOrder(signal({ action: 'sell' }), {
        size: 0.05,
        mid: 70000,
        lotSize: 0.001,
        tickSize: 0.1,
        type: 'limit',
        offsetTicks: 2,
      }).order.price,
    ).toBe(70000.2)

    // An exit is the position layer's job: it knows the size, and this does not.
    expect(mapSignalToOrder(signal({ action: 'flat' }), {}).reason).toMatch(/not an entry/)
    expect(mapSignalToOrder(signal({ instrument: '' }), { size: 1 }).reason).toMatch(/no instrument/)
    // A size that rounds to nothing is refused rather than sent as zero.
    expect(mapSignalToOrder(signal(), { size: 0.0001, lotSize: 0.001, mid: 1 }).reason).toMatch(/zero/)
    expect(mapSignalToOrder(signal(), { size: 1, type: 'limit', mid: 0 }).reason).toMatch(/no price/)
  })
})

describe('rulesFor', () => {
  it('lets a per-strategy rule override the desk default without replacing all of it', () => {
    setValue('settings.botSizeRule', 'fixed')
    setValue('settings.botSize', 0.01)
    setValue('settings.botRules', { 'momentum-burst': { size: 0.5 } })
    tick()

    const rules = rulesFor('momentum-burst')
    expect(rules.size).toBe(0.5)
    // The rest still comes from the desk-wide setting.
    expect(rules.rule).toBe('fixed')

    expect(rulesFor('vwap-revert').size).toBe(0.01)
  })
})
