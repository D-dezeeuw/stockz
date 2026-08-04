import { describe, it, expect } from 'vitest'
import { isAdapter, supportsIntent, ADAPTER_METHODS, CAPABILITIES } from './contract.js'

describe('isAdapter', () => {
  it('names exactly what a candidate adapter is missing', () => {
    const full = { submit: () => {}, cancel: () => {}, capabilities: () => [] }
    expect(isAdapter(full)).toEqual({ ok: true, missing: [] })

    expect(isAdapter({ submit: () => {} })).toEqual({
      ok: false,
      missing: ['cancel', 'capabilities'],
    })
    expect(isAdapter(null).missing).toEqual(ADAPTER_METHODS)
  })
})

describe('supportsIntent', () => {
  it('refuses loudly rather than downgrading an order the venue cannot honour', () => {
    const caps = ['market', 'limit', 'post_only', 'ioc']

    expect(supportsIntent({ type: 'limit', tif: 'gtc' }, caps)).toEqual({ ok: true, reason: '' })
    expect(supportsIntent({ type: 'limit', tif: 'post_only' }, caps).ok).toBe(true)

    // Silently downgrading post-only to an ordinary limit turns a maker order into a
    // taker fee nobody agreed to.
    expect(supportsIntent({ type: 'limit', tif: 'post_only' }, ['limit']).reason).toBe(
      'no post_only',
    )
    expect(supportsIntent({ type: 'market', tif: 'ioc' }, ['limit']).reason).toBe('no market orders')
    expect(supportsIntent({ type: 'limit', tif: 'gtc', reduceOnly: true }, caps).reason).toBe(
      'no reduce-only',
    )

    // gtc is the baseline every venue has, so it is never checked against capabilities.
    expect(supportsIntent({ type: 'limit', tif: 'gtc' }, ['limit']).ok).toBe(true)
    expect(supportsIntent(null, caps).reason).toBe('no intent')
    expect(CAPABILITIES).toContain('batch_cancel')
  })
})
