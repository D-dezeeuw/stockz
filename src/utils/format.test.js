import { describe, it, expect } from 'vitest'
import {
  formatPrice,
  formatQty,
  formatPct,
  formatSigned,
  formatCompact,
} from './format.js'

describe('formatPrice', () => {
  it('renders a price at tick precision and a dash for non-numbers', () => {
    expect(formatPrice(101.2, 0.01)).toBe('101.20')
    expect(formatPrice(101.236, 0.001)).toBe('101.236')
    expect(formatPrice(27384, 1)).toBe('27384')
    expect(formatPrice(1.5)).toBe('1.50')
    expect(formatPrice(NaN)).toBe('—')
    expect(formatPrice(undefined)).toBe('—')
  })
})

describe('formatQty', () => {
  it('truncates to lot precision so displayed size is never larger than real size', () => {
    expect(formatQty(1.98765, 0.001)).toBe('1.987')
    expect(formatQty(9.999, 1)).toBe('9')
    expect(formatQty(0.5, 0.1)).toBe('0.5')
    expect(formatQty(-1.98765, 0.001)).toBe('-1.987')
    expect(formatQty(3)).toBe('3')
    expect(formatQty(NaN, 0.1)).toBe('—')
  })
})

describe('formatPct', () => {
  it('signs positive moves and keeps zero and negatives unprefixed', () => {
    expect(formatPct(1.2345)).toBe('+1.23%')
    expect(formatPct(-0.4)).toBe('-0.40%')
    expect(formatPct(0)).toBe('0.00%')
    expect(formatPct(0.001)).toBe('0.00%')
    expect(formatPct(NaN)).toBe('—')
  })
})

describe('formatSigned', () => {
  it('prefixes gains with + and leaves losses and flat alone', () => {
    expect(formatSigned(12.4)).toBe('+12.40')
    expect(formatSigned(-3.1)).toBe('-3.10')
    expect(formatSigned(0)).toBe('0.00')
    expect(formatSigned(1234.5678, 3)).toBe('+1234.568')
    expect(formatSigned(Infinity)).toBe('—')
  })
})

describe('formatCompact', () => {
  it('shortens thousands, millions and billions and passes small numbers through', () => {
    expect(formatCompact(870)).toBe('870')
    expect(formatCompact(45000)).toBe('45.0K')
    expect(formatCompact(1_200_000)).toBe('1.2M')
    expect(formatCompact(3_400_000_000)).toBe('3.4B')
    expect(formatCompact(-45000)).toBe('-45.0K')
    expect(formatCompact(NaN)).toBe('—')
  })
})
