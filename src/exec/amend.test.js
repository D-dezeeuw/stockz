import { describe, it, expect, beforeEach } from 'vitest'
import {
  amendDiff,
  amendRoute,
  takeLock,
  releaseLock,
  amendOrder,
  cancelReplace,
  resetAmend,
} from './amend.js'

beforeEach(() => resetAmend())

const working = (over = {}) => ({
  clientId: 'ord-1',
  venue: 'okx',
  instrument: 'BTC-USDT',
  price: 100,
  size: 1,
  ...over,
})

describe('amendDiff', () => {
  it('resolves the new values and spots an amend that changes nothing', () => {
    expect(amendDiff(working(), { price: 101 })).toEqual({ changed: true, price: 101, size: 1 })
    expect(amendDiff(working(), { size: 2 })).toEqual({ changed: true, price: 100, size: 2 })

    // A no-op amend is a wasted round trip and, on some venues, a wasted rate-limit token.
    expect(amendDiff(working(), { price: 100, size: 1 }).changed).toBe(false)
    expect(amendDiff(working(), {}).changed).toBe(false)
    expect(amendDiff(null, { price: 1 }).changed).toBe(true)
  })
})

describe('amendRoute', () => {
  it('keeps queue position where the venue can move an order in place', () => {
    // Queue position is the whole reason to care: a cancel/replace goes to the back of
    // the book, and on a maker order that is the edge.
    expect(amendRoute(working())).toEqual({ method: 'native', keepsQueue: true })
    expect(amendRoute(working({ venue: 'etoro' }))).toEqual({
      method: 'cancel-replace',
      keepsQueue: false,
    })
    expect(amendRoute(null).method).toBe('cancel-replace')
  })
})

describe('takeLock', () => {
  it('lets one amend fly and keeps only the newest of whatever piles up behind it', () => {
    expect(takeLock('ord-1')).toEqual({ ok: true, queued: false })

    // Two amends racing produce a venue state nobody predicted — the second may land
    // first, leaving the order at a price the trader already moved away from.
    expect(takeLock('ord-1', { price: 101 })).toEqual({ ok: false, queued: true })
    takeLock('ord-1', { price: 102 })

    // A trader nudging six times wants the sixth price, not all six sent in order.
    expect(releaseLock('ord-1')).toEqual({ price: 102 })
    expect(takeLock('')).toEqual({ ok: false, queued: false })
  })
})

describe('releaseLock', () => {
  it('frees the order and hands back anything queued', () => {
    takeLock('ord-1')
    expect(releaseLock('ord-1')).toBeNull()

    // Released: the next amend flies immediately.
    expect(takeLock('ord-1').ok).toBe(true)
    expect(releaseLock('nope')).toBeNull()
  })
})

describe('amendOrder', () => {
  it('moves an order in place on OKX and refuses to stack racing amends', async () => {
    const calls = []
    const deps = {
      amend: async (req) => {
        calls.push(['amend', req])
        return { ok: true }
      },
      cancel: async () => ({ ok: true }),
      submit: async () => ({ ok: true }),
    }

    const moved = await amendOrder(working(), { price: 101 }, deps)
    expect(moved).toMatchObject({ ok: true, method: 'native' })
    expect(moved.order.price).toBe(101)
    expect(calls[0][1]).toMatchObject({ clientId: 'ord-1', price: 101, size: 1 })

    // EToro has no amend: the semantics are emulated and reported as such.
    const replaced = await amendOrder(working({ venue: 'etoro' }), { price: 101 }, deps)
    expect(replaced).toMatchObject({ ok: true, method: 'cancel-replace' })
    expect(replaced.order.replaces).toBe('ord-1')

    expect(await amendOrder(working(), {}, deps)).toMatchObject({ reason: 'no change' })
    expect(await amendOrder(null, { price: 1 }, deps)).toMatchObject({ reason: 'no order' })

    // A rejected amend leaves the order as it was, and says why.
    const bad = await amendOrder(working(), { price: 102 }, {
      ...deps,
      amend: async () => ({ ok: false, reason: 'invalid_price' }),
    })
    expect(bad).toMatchObject({ ok: false, reason: 'invalid_price' })
    expect(bad.order.price).toBe(100)
  })
})

describe('cancelReplace', () => {
  it('replaces only after the cancel is acknowledged', async () => {
    const order = []
    const ok = await cancelReplace(
      working({ venue: 'etoro' }),
      { price: 101, size: 1 },
      {
        cancel: async () => {
          order.push('cancel')
          return { ok: true }
        },
        submit: async () => {
          order.push('submit')
          return { ok: true }
        },
      },
    )

    // Sending both at once risks a moment where the trader holds double the size.
    expect(order).toEqual(['cancel', 'submit'])
    expect(ok.order).toMatchObject({ price: 101, replaces: 'ord-1', clientId: 'ord-1-r' })

    // A failed cancel must not be followed by a replacement.
    const attempts = []
    const failed = await cancelReplace(working(), { price: 101, size: 1 }, {
      cancel: async () => ({ ok: false, reason: 'not live' }),
      submit: async () => {
        attempts.push('submit')
        return { ok: true }
      },
    })
    expect(failed).toMatchObject({ ok: false, reason: 'not live' })
    expect(attempts).toEqual([])
  })
})
