import { describe, it, expect, beforeEach } from 'vitest'
import {
  RATE_LIMITS,
  OKX_REST_BASE,
  withinRateLimit,
  recordCall,
  resetRateLimits,
  readEnvelope,
  okxRequest,
  placeOrder,
  cancelOrder,
  fetchPositions,
} from './rest.js'
import { setKeys, clearKeys } from '../vault.js'
import { webcrypto } from 'node:crypto'

const OKX = { apiKey: 'ak', secretKey: 'sk', passphrase: 'pp' }

/** A fetch double returning a canned envelope and recording the request. */
function fakeFetch(body, calls = []) {
  return async (url, init) => {
    calls.push({ url, init })
    return { json: async () => body }
  }
}

beforeEach(() => {
  clearKeys()
  resetRateLimits()
})

describe('withinRateLimit', () => {
  it('refuses a call before the venue does, because a 429 mid-scalp costs a fill', () => {
    const path = '/api/v5/account/balance'

    for (let i = 0; i < RATE_LIMITS[path]; i += 1) {
      expect(withinRateLimit(path, 1000)).toBe(true)
      recordCall(path, 1000)
    }
    expect(withinRateLimit(path, 1000)).toBe(false)

    // The window slides: the same calls are forgotten once they age out.
    expect(withinRateLimit(path, 4000)).toBe(true)

    // An endpoint with no published limit is never blocked.
    expect(withinRateLimit('/api/v5/unlisted', 1000)).toBe(true)
  })
})

describe('recordCall', () => {
  it('counts calls inside the window', () => {
    expect(recordCall('/api/v5/trade/order', 1000)).toBe(1)
    expect(recordCall('/api/v5/trade/order', 1001)).toBe(2)
  })
})

describe('resetRateLimits', () => {
  it('clears history, which is what a reconnect wants', () => {
    const path = '/api/v5/account/balance'
    for (let i = 0; i < RATE_LIMITS[path]; i += 1) recordCall(path, 1000)
    expect(withinRateLimit(path, 1000)).toBe(false)

    resetRateLimits()
    expect(withinRateLimit(path, 1000)).toBe(true)
  })
})

describe('readEnvelope', () => {
  it('reads OKX business failures that arrive as HTTP success', () => {
    expect(readEnvelope({ code: '0', data: [{ ordId: '1' }] })).toEqual({
      ok: true,
      data: [{ ordId: '1' }],
    })

    // code '1' with HTTP 200 is a failure; the per-item sCode is the real reason.
    const rejected = readEnvelope({
      code: '1',
      data: [{ sCode: '51008', sMsg: 'no balance' }],
    })
    expect(rejected.ok).toBe(false)
    expect(rejected.error).toMatch(/Insufficient balance/)

    const envelopeError = readEnvelope({ code: '50011', msg: 'too many requests', data: [] })
    expect(envelopeError.error).toMatch(/Rate limited/)
    expect(readEnvelope({}).ok).toBe(false)
  })
})

describe('okxRequest', () => {
  it('signs, calls and returns a result object instead of ever throwing', async () => {
    // Without credentials it refuses rather than sending an unsigned request.
    expect(await okxRequest({ path: '/api/v5/account/balance' })).toEqual({
      ok: false,
      error: 'No OKX credentials — add keys to trade',
    })

    setKeys('okx', OKX)
    const calls = []
    const ok = await okxRequest({
      path: '/api/v5/account/balance',
      ts: 1000,
      fetch: fakeFetch({ code: '0', data: [{ bal: '1' }] }, calls),
      subtle: webcrypto.subtle,
    })

    expect(ok).toEqual({ ok: true, data: [{ bal: '1' }] })
    expect(calls[0].url).toBe(`${OKX_REST_BASE}/api/v5/account/balance`)
    expect(calls[0].init.headers['OK-ACCESS-KEY']).toBe('ak')

    // A network failure becomes an error result, never an exception: an exception on the
    // order path leaves the trader unsure whether the order went.
    const dead = await okxRequest({
      path: '/api/v5/account/positions',
      ts: 1000,
      fetch: async () => {
        throw new Error('offline')
      },
      subtle: webcrypto.subtle,
    })
    expect(dead.ok).toBe(false)
    expect(dead.error).toMatch(/OKX unreachable: offline/)
  })
})

describe('placeOrder', () => {
  it('sends the venue order shape and maps the response back', async () => {
    setKeys('okx', OKX)
    const calls = []

    const result = await placeOrder(
      { symbol: 'BTC-USDT', side: 'buy', type: 'limit', px: 27384, sz: 0.01, clientId: 'c1' },
      { ts: 1000, fetch: fakeFetch({ code: '0', data: [{ ordId: '99', clOrdId: 'c1' }] }, calls), subtle: webcrypto.subtle },
    )

    const sent = JSON.parse(calls[0].init.body)
    expect(sent).toMatchObject({ instId: 'BTC-USDT', side: 'buy', sz: '0.01', clOrdId: 'c1' })
    expect(result.ok).toBe(true)
    expect(result.order).toMatchObject({ id: '99', symbol: 'BTC-USDT' })

    const rejected = await placeOrder(
      { symbol: 'BTC-USDT', side: 'buy', sz: 99 },
      { ts: 1000, fetch: fakeFetch({ code: '1', data: [{ sCode: '51008' }] }), subtle: webcrypto.subtle },
    )
    expect(rejected.ok).toBe(false)
    expect(rejected.error).toMatch(/Insufficient balance/)
  })
})

describe('cancelOrder', () => {
  it('cancels by venue id or client id and reports failure plainly', async () => {
    setKeys('okx', OKX)
    const calls = []

    expect(
      await cancelOrder(
        { symbol: 'BTC-USDT', id: '99' },
        { ts: 1000, fetch: fakeFetch({ code: '0', data: [{}] }, calls), subtle: webcrypto.subtle },
      ),
    ).toEqual({ ok: true })
    expect(JSON.parse(calls[0].init.body).ordId).toBe('99')

    const failed = await cancelOrder(
      { symbol: 'BTC-USDT', id: 'gone' },
      { ts: 1000, fetch: fakeFetch({ code: '1', data: [{ sCode: '51400' }] }), subtle: webcrypto.subtle },
    )
    expect(failed.error).toMatch(/already cancelled/)
  })
})

describe('fetchPositions', () => {
  it('maps venue positions into the internal shape', async () => {
    setKeys('okx', OKX)

    const result = await fetchPositions({
      ts: 1000,
      fetch: fakeFetch({
        code: '0',
        data: [{ instId: 'BTC-USDT', pos: '-0.5', avgPx: '27000' }, { pos: '1' }],
      }),
      subtle: webcrypto.subtle,
    })

    expect(result.ok).toBe(true)
    // The entry without an instrument is dropped rather than becoming a phantom position.
    expect(result.positions).toHaveLength(1)
    expect(result.positions[0]).toMatchObject({ side: 'short', sz: 0.5 })

    const failed = await fetchPositions({
      ts: 1000,
      fetch: fakeFetch({ code: '50011' }),
      subtle: webcrypto.subtle,
    })
    expect(failed.ok).toBe(false)
  })
})
