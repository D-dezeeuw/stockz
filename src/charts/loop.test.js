// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import {
  shouldStop,
  coalesceMarks,
  overBudget,
  createScheduler,
  pauseWhenHidden,
  framesPerSecond,
  drawDebugHud,
  FRAME_BUDGET_MS,
} from './loop.js'

describe('shouldStop', () => {
  it('stops the loop the moment nothing is left to draw', () => {
    expect(shouldStop(new Set())).toBe(true)
    expect(shouldStop(new Set(['a']))).toBe(false)

    // Arrays read the same way, so a caller can pass either.
    expect(shouldStop([])).toBe(true)
    expect(shouldStop(['a'])).toBe(false)
    expect(shouldStop(null)).toBe(true)
  })
})

describe('coalesceMarks', () => {
  it('folds a tick storm of marks into one draw per surface', () => {
    const marks = coalesceMarks(new Set(), 'chart')
    coalesceMarks(marks, 'chart')
    coalesceMarks(marks, ['chart', 'tape'])

    expect([...marks]).toEqual(['chart', 'tape'])

    // Empty ids are not surfaces; they must not arm a frame.
    coalesceMarks(marks, ['', null, undefined])
    expect(marks.size).toBe(2)

    expect([...coalesceMarks(null, 'x')]).toEqual(['x'])
  })
})

describe('overBudget', () => {
  it('flags a frame that has spent its allowance', () => {
    expect(overBudget(100, 108)).toBe(true)
    expect(overBudget(100, 107.9)).toBe(false)
    expect(overBudget(100, 103, 2)).toBe(true)

    expect(FRAME_BUDGET_MS).toBe(8)
    // A broken clock must not defer every layer forever.
    expect(overBudget(100, NaN)).toBe(false)
  })
})

describe('createScheduler', () => {
  it('draws by priority, defers low layers past budget, and stops when idle', () => {
    const frames = []
    let now = 0
    const order = []

    const scheduler = createScheduler({
      raf: (fn) => {
        frames.push(fn)
        return frames.length
      },
      clock: () => now,
    })

    scheduler.register('chart', () => order.push('chart'), { priority: 'high' })
    scheduler.register('tape', () => order.push('tape'))
    const unregister = scheduler.register('spark', () => order.push('spark'), { priority: 'low' })

    // Nothing dirty: no frame is armed at all.
    expect(scheduler.stats().running).toBe(false)

    scheduler.markDirty(['tape', 'spark', 'chart'])
    scheduler.markDirty('chart')
    expect(scheduler.stats().pending).toBe(3)
    // Four marks, one armed frame — the marks coalesced.
    expect(frames).toHaveLength(1)

    expect(frames.shift()()).toBe(3)
    // The price chart draws before the tape, and the sparkline last.
    expect(order).toEqual(['chart', 'tape', 'spark'])

    // Idle again: the loop does not re-arm, so a quiet market costs zero frames.
    expect(frames).toHaveLength(0)
    expect(scheduler.stats().pending).toBe(0)

    // A frame that runs out of budget defers the low-priority layer to the next one.
    order.length = 0
    scheduler.markDirty(['chart', 'spark'])
    now = 0
    const slowClock = createScheduler({
      raf: (fn) => frames.push(fn),
      clock: () => (now += 10),
    })
    slowClock.register('chart', () => order.push('slow-chart'), { priority: 'high' })
    slowClock.register('spark', () => order.push('slow-spark'), { priority: 'low' })
    slowClock.markDirty(['chart', 'spark'])
    frames.pop()()
    expect(order).toContain('slow-chart')
    expect(order).not.toContain('slow-spark')
    // The deferred mark carries over rather than being dropped.
    expect(slowClock.stats().pending).toBe(1)
    expect(slowClock.stats().deferred).toBe(1)

    // markAll redraws every registered surface, e.g. on returning to the tab.
    unregister()
    expect(scheduler.markAll()).toBe(2)
    expect(scheduler.stop()).toBe(true)
    expect(scheduler.stats().running).toBe(false)

    // No rAF at all: marking never throws, it simply never draws.
    const bare = createScheduler({ raf: null })
    bare.register('x', () => {})
    expect(bare.markDirty('x')).toBe(1)
    expect(bare.frame()).toBe(1)
    expect(bare.frame()).toBe(0)
  })
})

describe('pauseWhenHidden', () => {
  it('stops the loop on a hidden tab and redraws everything on return', () => {
    const calls = []
    const scheduler = { stop: () => calls.push('stop'), markAll: () => calls.push('markAll') }
    const stop = pauseWhenHidden(scheduler, document)

    Object.defineProperty(document, 'hidden', { value: true, configurable: true })
    document.dispatchEvent(new window.Event('visibilitychange'))
    expect(calls).toEqual(['stop'])

    Object.defineProperty(document, 'hidden', { value: false, configurable: true })
    document.dispatchEvent(new window.Event('visibilitychange'))
    expect(calls).toEqual(['stop', 'markAll'])

    stop()
    document.dispatchEvent(new window.Event('visibilitychange'))
    expect(calls).toHaveLength(2)

    expect(() => pauseWhenHidden(null, document)()).not.toThrow()
    expect(() => pauseWhenHidden(scheduler, null)()).not.toThrow()
  })
})

describe('framesPerSecond', () => {
  it('reads fps off frame timestamps, and says nothing without samples', () => {
    expect(framesPerSecond([0, 16.7, 33.4, 50.1])).toBe(60)
    // Two frames spread over 200ms is ten a second, not twenty.
    expect(framesPerSecond([0, 100, 200])).toBe(10)

    expect(framesPerSecond([100])).toBe(0)
    expect(framesPerSecond([5, 5])).toBe(0)
    expect(framesPerSecond(null)).toBe(0)
  })
})

describe('drawDebugHud', () => {
  it('turns "the chart feels sluggish" into a number a bug report can carry', () => {
    const calls = []
    const ctx = {
      save: () => calls.push(['save']),
      restore: () => calls.push(['restore']),
      fillText: (...args) => calls.push(['fillText', ...args]),
    }

    const line = drawDebugHud(ctx, {
      stats: { surfaces: 38, pending: 3, deferred: 21 },
      fps: 12,
      palette: { muted: '#666' },
    })

    expect(line).toBe('12fps 38sfc 3dirty 21def')
    expect(calls).toContainEqual(['fillText', '12fps 38sfc 3dirty 21def', 4, 4])
    expect(ctx.fillStyle).toBe('#666')

    // Without a context it still reports, so the same line can go to the console.
    expect(drawDebugHud(null, {})).toBe('0fps 0sfc 0dirty 0def')
  })
})
