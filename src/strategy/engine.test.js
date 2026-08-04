import { describe, it, expect } from 'vitest'
import { describeStrategies, runHook, BUILTIN_STRATEGIES, defineStrategy } from './engine.js'
import { NEUTRAL_SIGNAL } from './contract.js'
import { noopStrategy } from './builtin/noop.js'

describe('describeStrategies', () => {
  it('answers the first question asked of a strategy that is not firing', () => {
    const summaries = describeStrategies()

    expect(summaries).toEqual([
      { id: 'noop', name: 'No-op (reference)', params: ['label'], hooks: ['init', 'onTick', 'onCandle'] },
    ])
    expect(BUILTIN_STRATEGIES).toContain(noopStrategy)

    // Which hooks a strategy actually implements is otherwise buried in its module.
    const stateless = defineStrategy({ id: 'x', onTick: () => null, onCandle: () => null })
    expect(describeStrategies([stateless])[0].hooks).toEqual(['init', 'onTick', 'onCandle'])

    expect(describeStrategies([])).toEqual([])
    expect(describeStrategies(null)).toEqual([])
  })
})

describe('runHook', () => {
  it('silences a throwing strategy for the tick without taking the frame with it', () => {
    const warned = []
    const ctx = { log: { warn: (m) => warned.push(m) } }

    const good = { onTick: () => ({ action: 'buy', strength: 0.4, reason: 'edge' }) }
    expect(runHook(good, 'onTick', ctx, {})).toMatchObject({ action: 'buy', strength: 0.4 })

    // The desk's own feed and ticket keep working while somebody's idea is broken.
    const bad = {
      onTick: () => {
        throw new Error('boom')
      },
    }
    expect(runHook(bad, 'onTick', ctx, {})).toEqual(NEUTRAL_SIGNAL)
    expect(warned[0]).toMatch(/boom/)

    expect(runHook(noopStrategy, 'onCandle', ctx, {})).toEqual(NEUTRAL_SIGNAL)
    expect(runHook({}, 'onTick', ctx, {})).toEqual(NEUTRAL_SIGNAL)
    expect(runHook(bad, 'onTick', null, {})).toEqual(NEUTRAL_SIGNAL)
  })
})
