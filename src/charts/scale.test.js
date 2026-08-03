import { describe, it, expect } from 'vitest'
import {
  mapRange,
  priceRange,
  priceToY,
  yToPrice,
  timeToX,
  xToTime,
  autoRange,
  formatPrice,
  decimalsOf,
  composeTransform,
  applyTransform,
  indexToX,
  candleGeometry,
  gridLines,
} from './scale.js'

describe('mapRange', () => {
  it('maps between ranges and centres when the input has no span', () => {
    expect(mapRange(5, 0, 10, 0, 100)).toBe(50)
    expect(mapRange(0, 0, 10, 0, 100)).toBe(0)
    expect(mapRange(10, 0, 10, 100, 0)).toBe(0)

    // A flat series must not divide by zero.
    expect(mapRange(5, 5, 5, 0, 100)).toBe(50)
    expect(mapRange(NaN, 0, 10, 0, 100)).toBe(0)
  })
})

describe('priceRange', () => {
  it('pads the range so the line never rides the edge', () => {
    const range = priceRange([100, 110])
    expect(range.min).toBeLessThan(100)
    expect(range.max).toBeGreaterThan(110)

    // A flat series still gets a visible band.
    expect(priceRange([50, 50])).toEqual({ min: 49.5, max: 50.5 })
    expect(priceRange([])).toEqual({ min: 0, max: 1 })
    expect(priceRange(null)).toEqual({ min: 0, max: 1 })
  })
})

describe('priceToY', () => {
  it('inverts the axis, because canvas grows down and prices grow up', () => {
    const range = { min: 100, max: 200 }

    expect(priceToY(200, range, 50)).toBe(0)
    expect(priceToY(100, range, 50)).toBe(50)
    expect(priceToY(150, range, 50)).toBe(25)
  })
})

describe('yToPrice', () => {
  it('reads a price back off a pixel, inverting priceToY exactly', () => {
    const range = { min: 100, max: 200 }

    expect(yToPrice(0, range, 50)).toBe(200)
    expect(yToPrice(50, range, 50)).toBe(100)
    expect(yToPrice(25, range, 50)).toBe(150)

    // A zero-height plot has no pixels to read; the floor is the honest answer.
    expect(yToPrice(10, range, 0)).toBe(100)

    // A missing range falls back to the unit band, matching priceToY's default.
    expect(yToPrice(10, null, 50)).toBeCloseTo(0.8, 10)
  })
})

describe('timeToX', () => {
  it('pins the newest edge of the window to the right of the plot', () => {
    const window = { from: 1000, to: 2000 }

    expect(timeToX(1000, window, 200)).toBe(0)
    expect(timeToX(2000, window, 200)).toBe(200)
    expect(timeToX(1500, window, 200)).toBe(100)

    // A collapsed or missing window means "now", which lives at the right edge.
    expect(timeToX(1500, { from: 2000, to: 2000 }, 200)).toBe(200)
    expect(timeToX(1500, null, 200)).toBe(200)
  })
})

describe('xToTime', () => {
  it('maps a cursor column back to the millisecond it covers', () => {
    const window = { from: 1000, to: 2000 }

    expect(xToTime(0, window, 200)).toBe(1000)
    expect(xToTime(200, window, 200)).toBe(2000)
    expect(xToTime(50, window, 200)).toBe(1250)

    // Without a plot to measure, the cursor can only be at the present.
    expect(xToTime(50, window, 0)).toBe(2000)
    expect(xToTime(50, null, 200)).toBe(0)
  })
})

describe('autoRange', () => {
  it('frames the slice and snaps the edges onto tradable prices', () => {
    const snapped = autoRange([100, 110], 1)
    expect(snapped.min).toBe(99)
    expect(snapped.max).toBe(111)

    // Every snapped edge must still contain the padded range it came from.
    const padded = priceRange([100, 110])
    expect(snapped.min).toBeLessThanOrEqual(padded.min)
    expect(snapped.max).toBeGreaterThanOrEqual(padded.max)

    // No tick size to snap to leaves the padded range untouched.
    expect(autoRange([100, 110], 0)).toEqual(padded)
    expect(autoRange([], 1)).toEqual({ min: 0, max: 1 })
  })
})

describe('formatPrice', () => {
  it('derives decimals from the tick size so no impossible price renders', () => {
    expect(formatPrice(63421.0374, 0.1)).toBe('63421.0')
    expect(formatPrice(63421.0374, 0.001)).toBe('63421.037')
    expect(formatPrice(63421.0374, 1)).toBe('63421')

    // No usable tick size falls back to cents rather than to full float noise.
    expect(formatPrice(1.23456, 0)).toBe('1.23')
    expect(formatPrice(NaN, 0.1)).toBe('—')
  })
})

describe('decimalsOf', () => {
  it('counts decimals in both plain and exponential tick sizes', () => {
    expect(decimalsOf(0.001)).toBe(3)
    expect(decimalsOf(1)).toBe(0)
    expect(decimalsOf(0.5)).toBe(1)

    // Small ticks arrive from JSON in exponential form; the exponent is the answer.
    expect(decimalsOf(1e-8)).toBe(8)
  })
})

describe('composeTransform', () => {
  it('nests pan inside zoom, so a drag after a zoom moves by the zoomed distance', () => {
    expect(composeTransform({ offset: 10, scale: 2 }, { offset: 5, scale: 3 })).toEqual({
      offset: 20,
      scale: 6,
    })

    // Identity in either slot leaves the other untouched.
    expect(composeTransform({ offset: 10, scale: 2 }, {})).toEqual({ offset: 10, scale: 2 })
    expect(composeTransform(null, null)).toEqual({ offset: 0, scale: 1 })
  })
})

describe('applyTransform', () => {
  it('scales then offsets, and treats a missing transform as identity', () => {
    expect(applyTransform(10, { offset: 5, scale: 2 })).toBe(25)
    expect(applyTransform(10, { scale: 0.5 })).toBe(5)

    expect(applyTransform(10, null)).toBe(10)
    expect(applyTransform(NaN, { scale: 2 })).toBe(0)
  })
})

describe('indexToX', () => {
  it('spreads a series across the width and pins a single point to the right edge', () => {
    expect(indexToX(0, 5, 100)).toBe(0)
    expect(indexToX(4, 5, 100)).toBe(100)
    expect(indexToX(2, 5, 100)).toBe(50)

    // One point has nowhere to spread; the newest price belongs at the right edge.
    expect(indexToX(0, 1, 100)).toBe(100)
    expect(indexToX(0, 0, 100)).toBe(100)
  })
})

describe('candleGeometry', () => {
  it('places body and wicks, and keeps a doji visible', () => {
    const range = { min: 100, max: 200 }
    const box = { x: 10, width: 4, height: 100 }

    const up = candleGeometry({ o: 120, h: 190, l: 110, c: 180 }, range, box)
    expect(up.up).toBe(true)
    expect(up.bodyTop).toBe(20)
    expect(up.bodyHeight).toBe(60)
    expect(up.wickTop).toBe(10)
    expect(up.wickBottom).toBe(90)

    expect(candleGeometry({ o: 180, h: 190, l: 110, c: 120 }, range, box).up).toBe(false)

    // A doji has no body height — one pixel keeps it on screen.
    expect(candleGeometry({ o: 150, h: 150, l: 150, c: 150 }, range, box).bodyHeight).toBe(1)
    expect(candleGeometry({}, range, box).width).toBe(4)
  })
})

describe('gridLines', () => {
  it('snaps to round numbers a trader can read at a glance', () => {
    expect(gridLines({ min: 0, max: 100 }, 4)).toEqual([0, 25, 50, 75, 100])
    expect(gridLines({ min: 100, max: 110 }, 5)).toContain(102)

    expect(gridLines({ min: 10, max: 10 })).toEqual([])
    expect(gridLines(null)).toEqual([])
    expect(gridLines({ min: 0, max: 10 }, 0)).toEqual([])
  })
})
