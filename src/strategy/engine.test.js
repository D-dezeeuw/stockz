import { describe, it, expect } from 'vitest'
import { describeStrategies, runHook, BUILTIN_STRATEGIES, defineStrategy } from './engine.js'
import { NEUTRAL_SIGNAL } from './contract.js'
import { noopStrategy } from './builtin/noop.js'

describe('describeStrategies', () => {
  it('answers the first question asked of a strategy that is not firing', () => {
    const summaries = describeStrategies()

    expect(summaries[0]).toEqual({
      id: 'noop',
      name: 'No-op (reference)',
      // budgetMs is merged in by defineStrategy: every strategy carries a tick budget
      // whether or not its author thought about one.
      params: ['budgetMs', 'label'],
      hooks: ['init', 'onTick', 'onCandle'],
    })
    // The composite ships as an ordinary built-in rather than as a special case, so the
    // runs list, the quarantine and the budget all treat it like a member.
    expect(summaries.map((s) => s.id)).toEqual(['noop', 'momentum-burst', 'composite'])
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
    const ok = runHook(good, 'onTick', ctx, {}, 'a@okx:BTC-USDT')
    expect(ok.signal).toMatchObject({ action: 'buy', strength: 0.4 })
    expect(ok).toMatchObject({ ok: true, error: '', runKey: 'a@okx:BTC-USDT' })

    // The desk's own feed and ticket keep working while somebody's idea is broken — and
    // the failure comes back as data the quarantine tally can count.
    const bad = {
      onTick: () => {
        throw new Error('boom')
      },
    }
    const failed = runHook(bad, 'onTick', ctx, {})
    expect(failed.signal).toEqual(NEUTRAL_SIGNAL)
    expect(failed).toMatchObject({ ok: false, error: 'boom' })
    expect(warned[0]).toMatch(/boom/)

    expect(runHook(noopStrategy, 'onCandle', ctx, {}).signal).toEqual(NEUTRAL_SIGNAL)
    // A hook that does not exist is not a strategy failure worth logging at the trader.
    expect(runHook({}, 'onTick', ctx, {}).error).toBe('not callable')
    expect(warned).toHaveLength(1)
    expect(runHook(bad, 'onTick', null, {}).signal).toEqual(NEUTRAL_SIGNAL)
  })
})
