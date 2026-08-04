import { describe, it, expect } from 'vitest'
import { buildEtoroOrder, createEtoroAdapter, ETORO_CAPABILITIES } from './etoro.js'
import { makeIntent } from '../types.js'

const intentFor = (over = {}) =>
  makeIntent({ symbol: 'etoro:AAPL', size: 3, price: 190, type: 'limit', ...over }).intent

describe('buildEtoroOrder', () => {
  it('speaks EToro\'s own vocabulary, which is what an adapter exists to absorb', () => {
    expect(buildEtoroOrder(intentFor({ clientId: 'abc' }))).toEqual({
      instrumentId: 'AAPL',
      direction: 'Buy',
      units: 3,
      rate: 190,
      orderType: 'Limit',
      clientRequestId: 'abc',
    })

    // A market order carries no rate.
    const market = buildEtoroOrder(intentFor({ type: 'market', side: 'sell' }))
    expect(market).toMatchObject({ direction: 'Sell', orderType: 'Market' })
    expect(market.rate).toBeUndefined()

    expect(buildEtoroOrder(null).units).toBe(0)
  })
})

describe('createEtoroAdapter', () => {
  it('offers only what EToro can actually do, and names its rejections', async () => {
    const calls = []
    const adapter = createEtoroAdapter({
      request: async (req) => {
        calls.push(req)
        return { ok: true }
      },
    })

    expect(adapter.venue).toBe('etoro')
    // No IOC, no FOK, no post-only: the ticket must not offer them here.
    expect(adapter.capabilities()).toEqual(['market', 'limit'])
    expect(ETORO_CAPABILITIES).not.toContain('post_only')

    expect(await adapter.submit(intentFor({ clientId: 'abc' }))).toMatchObject({
      ok: true,
      clientId: 'abc',
    })
    expect(calls[0]).toMatchObject({ method: 'POST', path: '/orders' })

    expect(await adapter.cancel({ venueId: '77' })).toEqual({ ok: true })
    expect(calls[1]).toMatchObject({ method: 'DELETE', path: '/orders/77' })

    // EToro answers in prose; the reason is normalised while the words are kept.
    const bad = createEtoroAdapter({
      request: async () => ({ ok: false, error: { message: 'Insufficient balance' } }),
    })
    expect(await bad.submit(intentFor())).toMatchObject({
      ok: false,
      reason: 'insufficient_funds',
      message: 'Insufficient balance',
    })
    expect(await bad.cancel({ venueId: '1' })).toMatchObject({ ok: false })
  })
})
