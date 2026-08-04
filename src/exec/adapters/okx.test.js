import { describe, it, expect } from 'vitest'
import { okxOrdType, buildOkxOrder, createOkxAdapter, OKX_CAPABILITIES } from './okx.js'
import { makeIntent } from '../types.js'

const intentFor = (over = {}) =>
  makeIntent({ symbol: 'okx:BTC-USDT', size: 0.5, price: 100, type: 'limit', ...over }).intent

describe('okxOrdType', () => {
  it('folds time-in-force into the order type, the way OKX models it', () => {
    expect(okxOrdType({ type: 'limit', tif: 'gtc' })).toBe('limit')
    expect(okxOrdType({ type: 'limit', tif: 'post_only' })).toBe('post_only')
    expect(okxOrdType({ type: 'limit', tif: 'ioc' })).toBe('ioc')
    expect(okxOrdType({ type: 'limit', tif: 'fok' })).toBe('fok')

    // A market order's type is just 'market'; its tif is implicit.
    expect(okxOrdType({ type: 'market', tif: 'ioc' })).toBe('market')
    expect(okxOrdType(null)).toBe('limit')
  })
})

describe('buildOkxOrder', () => {
  it('sends every number as a string, which is the whole trick with this venue', () => {
    const body = buildOkxOrder(intentFor(), { mode: 'cash' })

    expect(body).toEqual({
      symbol: 'BTC-USDT',
      tdMode: 'cash',
      side: 'buy',
      type: 'limit',
      sz: '0.5',
      px: '100',
      clientId: '',
    })
    // A JSON number here is rejected outright by OKX.
    expect(typeof body.sz).toBe('string')
    expect(typeof body.px).toBe('string')

    // A market order carries no price at all.
    expect(buildOkxOrder(intentFor({ type: 'market' })).px).toBeUndefined()
    expect(buildOkxOrder(intentFor({ reduceOnly: true })).reduceOnly).toBe('true')
    expect(buildOkxOrder(null).symbol).toBe('')
  })
})

describe('createOkxAdapter', () => {
  it('submits and cancels, turning a venue error into one named reason', async () => {
    const sent = []
    const adapter = createOkxAdapter({
      authed: () => true,
      place: async (body) => {
        sent.push(body)
        return { ok: true, order: { clientId: 'abc', state: 'live' } }
      },
      cancel: async () => ({ ok: true }),
    })

    expect(adapter.venue).toBe('okx')
    expect(adapter.capabilities()).toEqual([...OKX_CAPABILITIES])

    const ok = await adapter.submit(intentFor({ clientId: 'abc' }))
    expect(ok).toMatchObject({ ok: true, clientId: 'abc' })
    expect(sent[0]).toMatchObject({ symbol: 'BTC-USDT', sz: '0.5' })

    expect(await adapter.cancel({ instrument: 'BTC-USDT', clientId: 'abc' })).toEqual({ ok: true })

    // A venue rejection comes back in the desk's own vocabulary, with the venue's words
    // kept for the human.
    const bad = createOkxAdapter({
      authed: () => true,
      place: async () => ({ ok: false, error: { sCode: '51008', sMsg: 'Insufficient USDT' } }),
      cancel: async () => {
        throw new Error('gateway')
      },
    })
    expect(await bad.submit(intentFor())).toMatchObject({
      ok: false,
      reason: 'insufficient_funds',
      message: 'Insufficient USDT',
    })

    // A thrown transport error is a rejection too, not a crash on the order path.
    expect(await bad.cancel({ instrument: 'BTC-USDT' })).toMatchObject({ ok: false })

    // No keys is the expected state until they are entered — the public feed runs
    // without them — so it is a named rejection rather than a thrown error.
    const cold = createOkxAdapter({ authed: () => false })
    expect(await cold.submit(intentFor({ clientId: 'zz' }))).toEqual({
      ok: false,
      reason: 'not_authenticated',
      message: 'no credentials',
      clientId: 'zz',
    })
  })
})
