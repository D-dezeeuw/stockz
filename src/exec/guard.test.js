import { describe, it, expect } from 'vitest'
import { deviationBps, checkSlippage, checkSize, MAX_DEVIATION_BPS } from './guard.js'

describe('deviationBps', () => {
  it('measures distance from mid in the unit a threshold can be set in', () => {
    expect(deviationBps(101, 100)).toBeCloseTo(100, 0)
    expect(deviationBps(99, 100)).toBeCloseTo(100, 0)
    expect(deviationBps(100, 100)).toBe(0)

    // An extra zero is the case this exists for.
    expect(deviationBps(1000, 100)).toBeCloseTo(90000, 0)

    expect(deviationBps(0, 100)).toBe(0)
    expect(deviationBps(100, 0)).toBe(0)
  })
})

describe('checkSlippage', () => {
  it('blocks a fat finger without blocking the first order of a session', () => {
    const market = { mid: 100, maxBps: 500, bookStatus: 'live' }

    expect(checkSlippage({ type: 'limit', price: 101 }, market)).toMatchObject({ ok: true })
    // An order 90% away from mid is not a price, it is a typo.
    expect(checkSlippage({ type: 'limit', price: 1000 }, market)).toMatchObject({ ok: false })
    expect(checkSlippage({ type: 'limit', price: 1000 }, market).reason).toContain('bps from mid')

    // A market order has no price to check; the book's health is what can be checked,
    // and it must be.
    expect(checkSlippage({ type: 'market' }, market)).toMatchObject({ ok: true })
    expect(checkSlippage({ type: 'market' }, { ...market, bookStatus: 'stale' })).toMatchObject({
      ok: false,
      reason: 'book not live',
    })

    // No mid yet: refusing here would block the first order of a session, and the book
    // check above is what covers that case honestly.
    expect(checkSlippage({ type: 'limit', price: 1000 }, { bookStatus: 'live' }).ok).toBe(true)

    // A generous ceiling is still a ceiling: 4% is 400bps and passes, 6% is 600 and
    // does not.
    expect(checkSlippage({ type: 'limit', price: 104 }, { mid: 100, maxBps: 500 }).ok).toBe(true)
    expect(checkSlippage({ type: 'limit', price: 106 }, { mid: 100, maxBps: 500 }).ok).toBe(false)
    expect(MAX_DEVIATION_BPS).toBe(500)
  })
})

describe('checkSize', () => {
  it('catches the extra zero even when the limit was set generously', () => {
    expect(checkSize(1, 10)).toEqual({ ok: true, reason: '' })
    expect(checkSize(100, 10)).toEqual({ ok: false, reason: 'size over 10' })

    // No limit configured is not a reason to refuse a legitimate order.
    expect(checkSize(1000, 0).ok).toBe(true)
    expect(checkSize(0, 10).reason).toBe('no size')
    expect(checkSize('x', 10).ok).toBe(false)
  })
})
