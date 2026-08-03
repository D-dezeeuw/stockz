import { describe, it, expect } from 'vitest'
import { createRing, arrivalRate } from './ring.js'

describe('createRing', () => {
  it('holds a fixed window, overwrites the oldest and never grows', () => {
    const ring = createRing(3)

    ring.push('a')
    ring.push('b')
    expect(ring.toArray()).toEqual(['a', 'b'])
    expect(ring.last()).toBe('b')
    expect(ring.size()).toBe(2)

    ring.push('c')
    ring.push('d')

    // 'a' is gone: capacity is a hard limit, not a suggestion. An unbounded tick array is
    // a memory leak with a clock on it.
    expect(ring.toArray()).toEqual(['b', 'c', 'd'])
    expect(ring.size()).toBe(3)
    expect(ring.dropped()).toBe(1)

    // A limited read returns the NEWEST entries, which is what a chart wants.
    expect(ring.toArray(2)).toEqual(['c', 'd'])
    expect(ring.toArray(0)).toEqual([])

    ring.clear()
    expect(ring.size()).toBe(0)
    expect(ring.last()).toBeUndefined()
    expect(ring.dropped()).toBe(0)

    // A nonsense capacity still yields a usable buffer.
    expect(createRing(0).capacity).toBe(1)
    expect(createRing(NaN).capacity).toBe(1)
  })
})

describe('arrivalRate', () => {
  it('measures how hot the tape is over a sliding window', () => {
    const entries = [{ ts: 100 }, { ts: 500 }, { ts: 900 }, { ts: 1500 }]

    // Cutoff at 600ms: only the 900 and 1500 prints count -> 2/s.
    expect(arrivalRate(entries, 1600, 1000)).toBe(2)
    // Widen the window and the earlier prints come back into view.
    expect(arrivalRate(entries, 1600, 2000)).toBe(2)
    expect(arrivalRate(entries, 5000, 1000)).toBe(0)

    // A half-second window scales up to a per-second figure.
    expect(arrivalRate([{ ts: 1000 }], 1200, 500)).toBe(2)

    expect(arrivalRate([], 1000)).toBe(0)
    expect(arrivalRate(null, 1000)).toBe(0)
    expect(arrivalRate(entries, NaN)).toBe(0)
    expect(arrivalRate(entries, 1000, 0)).toBe(0)
  })
})
