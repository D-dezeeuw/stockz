import { describe, it, expect } from 'vitest'
import { pathSegments, createSandbox, invokeStrategy } from './sandbox.js'

describe('pathSegments', () => {
  it('splits a dotted path and drops everything unusable', () => {
    expect(pathSegments('run.signals.count')).toEqual(['run', 'signals', 'count'])
    expect(pathSegments(' run . signals ')).toEqual(['run', 'signals'])

    // An empty path is no path, not a key called ''. A sandbox that grew a blank key on
    // every sloppy write would compare unequal to an identical run for no reason.
    expect(pathSegments('')).toEqual([])
    expect(pathSegments('..')).toEqual([])
    expect(pathSegments(null)).toEqual([])
  })
})

describe('createSandbox', () => {
  it('reads and writes its own isolated tree, immediately', () => {
    const seed = { run: { id: 'a' } }
    const box = createSandbox(seed)

    expect(box.get('run.id')).toBe('a')
    expect(box.get('run.missing', 'fallback')).toBe('fallback')
    expect(box.get('', 'fallback')).toBe('fallback')

    // Immediate, unlike the desk's next-tick `setValue`: nothing is rendering, and a value
    // that appeared a tick late would have a strategy read its own scratchpad stale.
    box.set('run.signals', 3)
    expect(box.get('run.signals')).toBe(3)

    // Intermediates are created on the way down.
    box.set('deep.nested.leaf', 'x')
    expect(box.get('deep.nested.leaf')).toBe('x')
    expect(box.set('', 'ignored')).toBe('ignored')
    expect(box.get('deep')).toEqual({ nested: { leaf: 'x' } })

    // The seed is copied, never adopted: two runs started from one config must not see
    // each other's writes.
    expect(seed.run.signals).toBeUndefined()

    // The snapshot is a copy too — it is what a run gets compared against later.
    const snap = box.snapshot()
    box.set('run.signals', 99)
    expect(snap.run.signals).toBe(3)

    // Reading through a non-object stops rather than throws.
    box.set('scalar', 5)
    expect(box.get('scalar.deeper', 'none')).toBe('none')

    expect(box.clear()).toBe(true)
    expect(box.snapshot()).toEqual({})
    expect(createSandbox(null).snapshot()).toEqual({})
  })
})

describe('invokeStrategy', () => {
  it('returns a hook result as data, including when the hook throws', () => {
    const ctx = { instrument: 'BTC-USDT' }
    const strategy = {
      onTick: (c, tick) => ({ action: 'buy', reason: `${c.instrument}@${tick.px}` }),
      onCandle: () => {
        throw new Error('boom')
      },
    }

    expect(invokeStrategy(strategy, 'onTick', ctx, { px: 42 })).toEqual({
      ok: true,
      value: { action: 'buy', reason: 'BTC-USDT@42' },
      error: '',
    })

    // A throw is one lost tick, never a lost run: one malformed print in ninety thousand
    // must not decide whether a strategy gets scored.
    expect(invokeStrategy(strategy, 'onCandle', ctx, {})).toEqual({
      ok: false,
      value: null,
      error: 'boom',
    })

    // A missing hook is not a failure — `init` is optional by contract, and counting its
    // absence as an error would bench every stateless strategy on tick one.
    expect(invokeStrategy(strategy, 'init', ctx, null)).toEqual({ ok: true, value: null, error: '' })
    expect(invokeStrategy(null, 'onTick', ctx, {})).toEqual({ ok: true, value: null, error: '' })
  })
})
