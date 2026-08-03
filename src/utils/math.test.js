import { describe, it, expect } from 'vitest'
import { clamp, roundToTick, tickDecimals, bpsDiff } from './math.js'

describe('clamp', () => {
  it('bounds values into the range and falls back to min for non-numbers', () => {
    expect(clamp(5, 0, 10)).toBe(5)
    expect(clamp(-3, 0, 10)).toBe(0)
    expect(clamp(42, 0, 10)).toBe(10)
    expect(clamp(0, 0, 10)).toBe(0)
    expect(clamp(NaN, 0, 10)).toBe(0)
    expect(clamp(Infinity, 0, 10)).toBe(0)
  })
})

describe('tickDecimals', () => {
  it('derives decimal places from a step size and returns 0 for whole or bad steps', () => {
    expect(tickDecimals(0.01)).toBe(2)
    expect(tickDecimals(0.00001)).toBe(5)
    expect(tickDecimals(1)).toBe(0)
    expect(tickDecimals(5)).toBe(0)
    expect(tickDecimals(0)).toBe(0)
    expect(tickDecimals(-0.1)).toBe(0)
    expect(tickDecimals(NaN)).toBe(0)
  })
})

describe('roundToTick', () => {
  it('snaps prices to tick multiples without float drift and passes through bad ticks', () => {
    expect(roundToTick(101.237, 0.01)).toBe(101.24)
    expect(roundToTick(0.1 + 0.2, 0.01)).toBe(0.3)
    expect(roundToTick(27384.5, 0.5)).toBe(27384.5)
    expect(roundToTick(27384.7, 0.5)).toBe(27384.5)
    expect(roundToTick(99.999, 1)).toBe(100)
    expect(roundToTick(12.34, 0)).toBe(12.34)
    expect(roundToTick(12.34, NaN)).toBe(12.34)
    expect(roundToTick(NaN, 0.01)).toBe(0)
  })
})

describe('bpsDiff', () => {
  it('measures the gap in basis points and returns 0 for an unusable reference', () => {
    expect(bpsDiff(101, 100)).toBeCloseTo(100)
    expect(bpsDiff(99.5, 100)).toBeCloseTo(-50)
    expect(bpsDiff(100, 100)).toBe(0)
    expect(bpsDiff(100, 0)).toBe(0)
    expect(bpsDiff(NaN, 100)).toBe(0)
    expect(bpsDiff(100, NaN)).toBe(0)
  })
})
