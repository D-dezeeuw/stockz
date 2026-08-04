import { describe, it, expect, beforeEach } from 'vitest'
import {
  makeRunKey,
  registerStrategy,
  knownStrategies,
  startStrategy,
  stopStrategy,
  liveRuns,
  publishRunning,
  resetStrategies,
  registerStrategyActions,
  strategyFor,
  tuneStrategy,
  showParamForm,
} from './registry.js'
import { defineStrategy } from './contract.js'
import { ACTIONS } from '../actions/names.js'
import { dispatchAction, clearActions } from '../actions/registry.js'
import { appState, tick, resetState } from '../app/engine.js'

/** A tick source the test drives by hand. */
function fakeBus() {
  const listeners = new Set()

  return {
    subscribe: (fn) => (listeners.add(fn), () => listeners.delete(fn)),
    emit: (t) => listeners.forEach((fn) => fn(t)),
    get size() {
      return listeners.size
    },
  }
}

function stub(id = 'mean-rev') {
  return defineStrategy({
    id,
    name: 'Mean Reversion',
    params: { lookback: { default: 20 } },
    init: (ctx) => ({ at: ctx.now }),
    onTick: (_ctx, t) => ({ action: t.px > 100 ? 'sell' : 'buy', strength: 1, reason: 'test' }),
    onCandle: () => null,
  })
}

beforeEach(() => {
  resetStrategies()
  resetState()
  clearActions()
})

describe('makeRunKey', () => {
  it('identifies the pair, not the strategy — the same idea runs on four symbols', () => {
    expect(makeRunKey('mean-rev', 'okx:BTC-USDT')).toBe('mean-rev@okx:BTC-USDT')
    expect(makeRunKey(' mean-rev ', ' okx:ETH-USDT ')).toBe('mean-rev@okx:ETH-USDT')

    // Half a key is not a key: it would collide with every other half-key.
    expect(makeRunKey('mean-rev', '')).toBe('')
    expect(makeRunKey('', 'okx:BTC-USDT')).toBe('')
    expect(makeRunKey()).toBe('')
  })
})

describe('registerStrategy', () => {
  it('refuses a duplicate id rather than letting the last one silently win', () => {
    expect(registerStrategy(stub()).id).toBe('mean-rev')
    expect(knownStrategies()).toHaveLength(1)

    // Two strategies under one id means the trader cannot tell which is running.
    expect(() => registerStrategy(stub())).toThrow(/already registered/)
    expect(() => registerStrategy({ id: 'bad' })).toThrow(/onTick/)

    expect(registerStrategy(stub('breakout')).id).toBe('breakout')
    expect(knownStrategies()).toHaveLength(2)
  })
})

describe('startStrategy', () => {
  it('runs one instrument only, and starting twice never doubles the subscription', () => {
    registerStrategy(stub())
    const bus = fakeBus()

    const run = startStrategy('mean-rev', 'okx:BTC-USDT', { subscribe: bus.subscribe, now: 500 })
    expect(run.key).toBe('mean-rev@okx:BTC-USDT')
    expect(run.memory).toEqual({ at: 500 })
    expect(run.ctx.params.lookback).toBe(20)

    bus.emit({ symbol: 'okx:BTC-USDT', px: 120 })
    expect(run.signal).toMatchObject({ action: 'sell' })

    // Ticks arrive for every instrument on the bus; a run only sees its own.
    bus.emit({ symbol: 'okx:ETH-USDT', px: 5 })
    expect(run.signal).toMatchObject({ action: 'sell' })

    // A double-click on start, or a re-subscribe after a reconnect, must not leave two
    // subscriptions racing the same strategy state.
    expect(startStrategy('mean-rev', 'okx:BTC-USDT', { subscribe: bus.subscribe })).toBe(run)
    expect(bus.size).toBe(1)

    expect(startStrategy('nope', 'okx:BTC-USDT', { subscribe: bus.subscribe })).toBeNull()
    expect(startStrategy('mean-rev', '', { subscribe: bus.subscribe })).toBeNull()
  })
})

describe('stopStrategy', () => {
  it('leaves nothing subscribed, which is the whole point of stopping', () => {
    registerStrategy(stub())
    const bus = fakeBus()
    const run = startStrategy('mean-rev', 'okx:BTC-USDT', { subscribe: bus.subscribe })

    expect(stopStrategy(run.key)).toBe(true)
    expect(bus.size).toBe(0)
    expect(liveRuns()).toHaveLength(0)

    // A run still emitting from a UI that says it is off is the worst failure here.
    bus.emit({ symbol: 'okx:BTC-USDT', px: 1 })
    expect(run.signal).toBeNull()

    expect(stopStrategy(run.key)).toBe(false)
    expect(stopStrategy()).toBe(false)
  })
})

describe('liveRuns', () => {
  it('lists every run, one per instrument', () => {
    registerStrategy(stub())
    const bus = fakeBus()

    startStrategy('mean-rev', 'okx:BTC-USDT', { subscribe: bus.subscribe })
    startStrategy('mean-rev', 'okx:ETH-USDT', { subscribe: bus.subscribe })

    expect(liveRuns().map((r) => r.instrument)).toEqual(['okx:BTC-USDT', 'okx:ETH-USDT'])
    expect(bus.size).toBe(2)
  })
})

describe('publishRunning', () => {
  it('tells the UI what is running and what it last said', () => {
    registerStrategy(stub())
    const bus = fakeBus()
    startStrategy('mean-rev', 'okx:BTC-USDT', { subscribe: bus.subscribe, now: 500 })
    bus.emit({ symbol: 'okx:BTC-USDT', px: 120 })

    const rows = publishRunning()
    tick()

    expect(rows[0]).toEqual({
      key: 'mean-rev@okx:BTC-USDT',
      strategyId: 'mean-rev',
      name: 'Mean Reversion',
      instrument: 'okx:BTC-USDT',
      startedAt: 500,
      action: 'sell',
    })
    expect(appState.strategy.running).toHaveLength(1)
  })
})

describe('resetStrategies', () => {
  it('unsubscribes before forgetting, so nothing outlives the reset', () => {
    registerStrategy(stub())
    const bus = fakeBus()
    startStrategy('mean-rev', 'okx:BTC-USDT', { subscribe: bus.subscribe })

    expect(resetStrategies()).toBe(true)
    expect(bus.size).toBe(0)
    expect(liveRuns()).toEqual([])
    expect(knownStrategies()).toEqual([])
  })
})

describe('registerStrategyActions', () => {
  it('registers the built-ins once and wires the stop button', () => {
    expect(registerStrategyActions()).toBe(ACTIONS.strategy.stop)
    expect(knownStrategies().map((s) => s.id)).toEqual(['noop'])

    // Boot may run twice in a hot reload. The action registry rejects the duplicate — its
    // job — but the built-ins must not be registered a second time behind it.
    clearActions()
    registerStrategyActions()
    expect(knownStrategies()).toHaveLength(1)

    const bus = fakeBus()
    const run = startStrategy('noop', 'okx:BTC-USDT', { subscribe: bus.subscribe })
    dispatchAction(ACTIONS.strategy.stop, { key: run.key })
    expect(liveRuns()).toHaveLength(0)
  })
})

describe('strategyFor', () => {
  it('resolves an id to its descriptor, and an unknown one to nothing', () => {
    registerStrategy(stub())

    expect(strategyFor('mean-rev').name).toBe('Mean Reversion')
    expect(strategyFor('nope')).toBeNull()
    expect(strategyFor()).toBeNull()
  })
})

describe('tuneStrategy', () => {
  it('applies within the tick, because a tuning behind a restart is one nobody uses', () => {
    registerStrategy(
      defineStrategy({
        id: 'tuned',
        params: { lookback: { kind: 'number', default: 20, min: 5, max: 200 } },
        init: (ctx) => ({ threshold: ctx.params.lookback * 2 }),
        onTick: () => null,
        onCandle: () => null,
      }),
    )
    const bus = fakeBus()
    const run = startStrategy('tuned', 'okx:BTC-USDT', { subscribe: bus.subscribe })
    expect(run.memory).toEqual({ threshold: 40 })

    expect(tuneStrategy({ strategy: 'tuned', param: 'lookback', value: '60' })).toEqual({
      lookback: 60,
    })
    // The running run picked it up, init included.
    expect(run.memory).toEqual({ threshold: 120 })

    expect(tuneStrategy({ strategy: 'nope', param: 'lookback', value: 1 })).toBeNull()
    expect(tuneStrategy({ strategy: 'tuned', param: 'ghost', value: 1 })).toBeNull()
  })
})

describe('showParamForm', () => {
  it('publishes the form for a known strategy only', () => {
    registerStrategy(stub())

    expect(showParamForm('mean-rev').map((f) => f.key)).toEqual(['lookback'])
    expect(showParamForm('nope')).toEqual([])
  })
})
