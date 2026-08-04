import { describe, it, expect, beforeEach } from 'vitest'
import {
  sample,
  curve,
  curveStats,
  curveRatios,
  curvePath,
  resetEquity,
  CAPACITY,
  SAMPLE_MS,
} from './equity.js'

beforeEach(() => resetEquity())

describe('sample', () => {
  it('takes the first one immediately and then paces itself', () => {
    // A curve should exist from the first frame, not five seconds into the session.
    expect(sample(10, 1000)).toBe(true)
    expect(curve()).toEqual([{ t: 1000, v: 10 }])

    // A P&L that moves with every tick would fill the buffer in a minute with a shape
    // nobody can read.
    expect(sample(11, 2000)).toBe(false)
    expect(sample(12, 1000 + SAMPLE_MS)).toBe(true)
    expect(curve()).toHaveLength(2)

    expect(sample(NaN, 99999)).toBe(false)
    expect(sample(10, NaN)).toBe(false)
    expect(CAPACITY).toBe(720)
  })
})

describe('curve', () => {
  it('keeps the session in order and bounded', () => {
    for (let i = 0; i < 5; i += 1) sample(i, i * SAMPLE_MS)

    expect(curve().map((p) => p.v)).toEqual([0, 1, 2, 3, 4])
    expect(curve()).not.toBe(curve())
  })
})

describe('curveStats', () => {
  it('measures drawdown from the running peak, not the final value', () => {
    const points = [{ v: 0 }, { v: 50 }, { v: 20 }, { v: 60 }]

    // Measuring from the end would report zero on a day that recovered — but the worst
    // moment still happened, and that is what a trader wants to know.
    expect(curveStats(points)).toEqual({
      peak: 60,
      trough: 0,
      drawdown: -30,
      last: 60,
      direction: 'up',
    })

    expect(curveStats([{ v: 10 }, { v: 5 }]).direction).toBe('down')
    expect(curveStats([{ v: 10 }, { v: 10 }]).direction).toBe('flat')
    expect(curveStats([])).toMatchObject({ peak: 0, drawdown: 0, direction: 'flat' })
  })
})

describe('curveRatios', () => {
  it('normalises to the box, and draws a flat session through the middle', () => {
    expect(curveRatios([{ v: 0 }, { v: 5 }, { v: 10 }])).toEqual([0, 0.5, 1])

    // A flat session is a flat line, not a division by zero.
    expect(curveRatios([{ v: 7 }, { v: 7 }])).toEqual([0.5, 0.5])

    // Losses normalise the same way — the shape is what matters, not the sign.
    expect(curveRatios([{ v: -10 }, { v: -5 }])).toEqual([0, 1])
    expect(curveRatios([])).toEqual([])
  })
})

describe('curvePath', () => {
  it('renders through the same geometry the watchlist sparklines use', () => {
    sample(0, 0)
    sample(10, SAMPLE_MS)
    sample(5, SAMPLE_MS * 2)

    const path = curvePath({ width: 100, height: 20 })
    expect(path).toBe('0.0,20.0 50.0,0.0 100.0,10.0')

    // One point is not a line.
    resetEquity()
    sample(1, 0)
    expect(curvePath()).toBe('')
  })
})

describe('resetEquity', () => {
  it('clears the session, and lets the next first sample land immediately', () => {
    sample(10, 1000)

    expect(resetEquity()).toBe(true)
    expect(curve()).toEqual([])
    expect(sample(20, 1001)).toBe(true)
  })
})
