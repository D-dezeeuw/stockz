import { describe, it, expect } from 'vitest'
import { applyTif, downgradeTif, iocTransitions, intentWithTif } from './tif.js'
import { makeIntent } from './types.js'

const base = (over = {}) =>
  makeIntent({ symbol: 'okx:BTC-USDT', size: 1, price: 100, type: 'limit', ...over }).intent

describe('applyTif', () => {
  it('sets a time-in-force, and refuses post-only where there is nothing to rest at', () => {
    expect(applyTif(base(), 'ioc').intent.tif).toBe('ioc')
    expect(applyTif(base(), 'post_only').intent.tif).toBe('post_only')

    // Post-only is a promise to rest; a market order can only ever take.
    expect(applyTif(base({ type: 'market' }), 'post_only').reason).toBe(
      'post-only needs a limit price',
    )

    expect(applyTif(base(), 'yolo').reason).toBe('unknown tif')
    expect(applyTif(null, 'ioc').reason).toBe('no intent')
  })
})

describe('downgradeTif', () => {
  it('uses the venue\'s own TIF where it exists and marks an emulation as one', () => {
    expect(downgradeTif('ioc', 'okx', 'BTC-USDT')).toEqual({
      tif: 'ioc',
      emulated: false,
      cancelAfterMs: 0,
    })

    // EToro has no IOC: a resting limit plus a cancel is not the same guarantee — the
    // order is live for the round trip — so it is marked emulated.
    expect(downgradeTif('ioc', 'etoro', 'AAPL')).toEqual({
      tif: 'gtc',
      emulated: true,
      cancelAfterMs: 250,
    })
    expect(downgradeTif('fok', 'etoro').cancelAfterMs).toBe(0)

    // Post-only cannot be emulated at all — there is no way to ask a venue to refuse a
    // crossing order afterwards — so it is *not* claimed as emulated.
    expect(downgradeTif('post_only', 'etoro')).toEqual({
      tif: 'gtc',
      emulated: false,
      cancelAfterMs: 0,
    })

    expect(downgradeTif('gtc', 'okx').emulated).toBe(false)
  })
})

describe('iocTransitions', () => {
  it('keeps the fill and the kill as separate events', () => {
    expect(iocTransitions({ filled: 0, size: 1 })).toEqual(['cancelled'])
    expect(iocTransitions({ filled: 1, size: 1 })).toEqual(['filled'])

    // Collapsing a partial IOC to 'cancelled' would lose the fill that happened.
    expect(iocTransitions({ filled: 0.4, size: 1 })).toEqual(['partial', 'cancelled'])
    expect(iocTransitions(null)).toEqual(['cancelled'])
  })
})

describe('intentWithTif', () => {
  it('builds a venue-ready intent, carrying the emulation forward where there is one', () => {
    const native = intentWithTif({ symbol: 'okx:BTC-USDT', size: 1, price: 100 }, 'ioc')
    expect(native).toMatchObject({ ok: true, emulated: false })
    expect(native.intent).toMatchObject({ tif: 'ioc', cancelAfterMs: 0 })

    const emu = intentWithTif({ symbol: 'etoro:AAPL', size: 1, price: 100 }, 'ioc')
    expect(emu.emulated).toBe(true)
    // The cancel timer travels with the intent, so the engine knows what to schedule.
    expect(emu.intent).toMatchObject({ tif: 'gtc', cancelAfterMs: 250, emulated: true })

    expect(intentWithTif({ symbol: 'okx:BTC-USDT', size: 0 }, 'ioc').reason).toBe('no size')
    expect(intentWithTif({ symbol: 'okx:BTC-USDT', size: 1, type: 'market' }, 'post_only').ok).toBe(
      false,
    )
  })
})
