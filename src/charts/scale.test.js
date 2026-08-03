import { describe, it, expect } from 'vitest'
import { mapRange, priceRange, priceToY, indexToX, candleGeometry, gridLines } from './scale.js'

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
