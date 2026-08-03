// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { buildRow, buildRows, resetRowMemory, sparklinePoints, sparklinePath } from './rows.js'
import { publishTick, resetBus } from '../pipeline/bus.js'

beforeEach(() => {
  resetBus()
  resetRowMemory()
})

describe('buildRow', () => {
  it('derives everything a row shows, and flags a symbol with no data', () => {
    publishTick({ symbol: 'okx:BTC-USDT', last: 27384.5, open24h: 27000, ask: 27385, bid: 27384, vol24h: 12000 })

    const row = buildRow('okx:BTC-USDT')

    expect(row).toMatchObject({ venue: 'okx', symbol: 'BTC-USDT', last: 27384.5 })
    expect(row.price).toBe('27384.50')
    expect(row.change).toBe('+1.42%')
    expect(row.changeClass).toBe('is-profit')
    expect(row.spread).toBeCloseTo(1)
    expect(row.volume).toBe('12.0K')
    expect(row.stale).toBe(false)

    // No tick at all: the row says so rather than showing a confident zero.
    expect(buildRow('okx:NOTHING').stale).toBe(true)
  })
})

describe('buildRows', () => {
  it('pulses against the previous frame, not the previous tick', () => {
    publishTick({ symbol: 'okx:A', last: 100, open24h: 100 })

    // First frame has no previous price, so nothing pulses — a page load must not flash.
    expect(buildRows(['okx:A'])[0].pulse).toBe('')

    publishTick({ symbol: 'okx:A', last: 101, open24h: 100 })
    expect(buildRows(['okx:A'])[0].pulse).toBe('tick-up')

    publishTick({ symbol: 'okx:A', last: 99, open24h: 100 })
    expect(buildRows(['okx:A'])[0].pulse).toBe('tick-down')

    // Unchanged price does not pulse.
    expect(buildRows(['okx:A'])[0].pulse).toBe('')
    expect(buildRows(null)).toEqual([])
  })
})

describe('resetRowMemory', () => {
  it('forgets prices so the next frame does not pulse against stale data', () => {
    publishTick({ symbol: 'okx:A', last: 100 })
    buildRows(['okx:A'])

    resetRowMemory()
    publishTick({ symbol: 'okx:A', last: 200 })
    expect(buildRows(['okx:A'])[0].pulse).toBe('')
  })
})

describe('sparklinePoints', () => {
  it('scales prints into a 0..1 box and handles a flat series', () => {
    for (const px of [100, 102, 101, 104]) publishTick({ symbol: 'okx:A', px, sz: 1 })

    const points = sparklinePoints('okx:A')
    expect(points).toHaveLength(4)
    expect(Math.min(...points)).toBe(0)
    expect(Math.max(...points)).toBe(1)

    // A flat series draws a centred line rather than dividing by zero.
    resetBus()
    publishTick({ symbol: 'okx:B', px: 50, sz: 1 })
    publishTick({ symbol: 'okx:B', px: 50, sz: 1 })
    expect(sparklinePoints('okx:B')).toEqual([0.5, 0.5])

    expect(sparklinePoints('okx:NOTHING')).toEqual([])
  })
})

describe('sparklinePath', () => {
  it('emits SVG points with y inverted, since SVG grows downward', () => {
    expect(sparklinePath([0, 1], 10, 10)).toBe('0.0,10.0 10.0,0.0')
    expect(sparklinePath([0.5, 0.5, 0.5], 20, 10)).toBe('0.0,5.0 10.0,5.0 20.0,5.0')

    expect(sparklinePath([0.5])).toBe('')
    expect(sparklinePath(null)).toBe('')
  })
})
