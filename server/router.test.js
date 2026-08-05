// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { EventEmitter } from 'node:events'
import { Buffer } from 'node:buffer'
import {
  filterHeaders,
  readBody,
  proxyTarget,
  sendJson,
  relay,
  MAX_BODY_BYTES,
} from './router.js'

/** A response double that records what was written. */
function fakeRes() {
  const res = {
    status: 0,
    headers: {},
    body: '',
    writeHead(status, headers) {
      res.status = status
      res.headers = headers ?? {}
    },
    end(chunk) {
      res.body = chunk === undefined ? '' : String(chunk)
    },
  }
  return res
}

/** A request double that streams the given chunks. */
function fakeReq(chunks, extra = {}) {
  const req = new EventEmitter()
  req.method = extra.method ?? 'POST'
  req.headers = extra.headers ?? {}
  req.url = extra.url ?? '/'
  req.destroy = () => req.emit('error', new Error('destroyed'))
  queueMicrotask(() => {
    for (const chunk of chunks) req.emit('data', Buffer.from(chunk))
    req.emit('end')
  })
  return req
}

describe('filterHeaders', () => {
  it('drops hop-by-hop, host and cookies; keeps the signing headers', () => {
    const out = filterHeaders({
      host: 'stockz.example',
      connection: 'keep-alive',
      cookie: 'stockz.session=secret',
      'accept-encoding': 'br',
      'ok-access-key': 'k',
      'ok-access-sign': 's',
      'content-type': 'application/json',
      'x-simulated-trading': ['1', '1'],
    })

    expect(out).toEqual({
      'ok-access-key': 'k',
      'ok-access-sign': 's',
      'content-type': 'application/json',
      'x-simulated-trading': '1, 1',
    })
    expect(filterHeaders(undefined)).toEqual({})
  })
})

describe('readBody', () => {
  it('buffers a body and destroys anything over the limit', async () => {
    await expect(readBody(fakeReq(['{"a":', '1}']))).resolves.toEqual(Buffer.from('{"a":1}'))

    // One byte over the limit kills the request instead of buffering a flood.
    await expect(readBody(fakeReq(['xx']), 1)).rejects.toThrow(/exceeds 1 bytes/)
    expect(MAX_BODY_BYTES).toBe(1024 * 1024)
  })
})

describe('proxyTarget', () => {
  it('maps a prefixed url onto the venue with the prefix stripped', () => {
    expect(proxyTarget('/okx-eea/api/v5/account/config', '/okx-eea', 'https://eea.okx.com')).toBe(
      'https://eea.okx.com/api/v5/account/config',
    )
    // The query string rides along — it is part of what was signed.
    expect(proxyTarget('/okx/api/v5/market/tickers?instType=SPOT', '/okx', 'https://www.okx.com')).toBe(
      'https://www.okx.com/api/v5/market/tickers?instType=SPOT',
    )
    expect(proxyTarget('/okx-eea', '/okx-eea', 'https://eea.okx.com')).toBe('https://eea.okx.com/')

    // Prefix means path segment, not string prefix: /okx-eea must not catch /okx.
    expect(proxyTarget('/okx-eea/api', '/okx', 'https://www.okx.com')).toBeNull()
    expect(proxyTarget('/api/v5/x', '/okx', 'https://www.okx.com')).toBeNull()
  })
})

describe('sendJson', () => {
  it('writes a no-store JSON reply', () => {
    const res = fakeRes()
    sendJson(res, 401, { msg: 'no' })
    expect(res.status).toBe(401)
    expect(res.headers['content-type']).toMatch(/application\/json/)
    expect(res.headers['cache-control']).toBe('no-store')
    expect(JSON.parse(res.body)).toEqual({ msg: 'no' })
  })
})

describe('relay', () => {
  it('forwards method, filtered headers and body; relays status and payload; never throws', async () => {
    const seen = []
    const fetchImpl = async (url, init) => {
      seen.push({ url, init })
      return {
        status: 401,
        headers: { get: (k) => (k === 'content-type' ? 'application/json' : null) },
        arrayBuffer: async () => Buffer.from('{"code":"50119"}'),
      }
    }

    const res = fakeRes()
    const req = fakeReq(['{"instId":"BTC-USDT"}'], {
      method: 'post',
      headers: { 'ok-access-sign': 'mac', cookie: 'stockz.session=tok', host: 'me' },
    })
    await relay(req, res, 'https://eea.okx.com/api/v5/trade/order', { fetch: fetchImpl })

    expect(seen[0].url).toBe('https://eea.okx.com/api/v5/trade/order')
    expect(seen[0].init.method).toBe('POST')
    // The session cookie must never reach the venue; the signing header must.
    expect(seen[0].init.headers).toEqual({ 'ok-access-sign': 'mac' })
    expect(String(seen[0].init.body)).toBe('{"instId":"BTC-USDT"}')
    // The venue's own status and body pass through for the client's envelope reader.
    expect(res.status).toBe(401)
    expect(res.body).toBe('{"code":"50119"}')

    // GET sends no body at all.
    const getRes = fakeRes()
    await relay(fakeReq([], { method: 'GET' }), getRes, 'https://x/api', { fetch: fetchImpl })
    expect(seen[1].init.body).toBeUndefined()

    // A dead venue becomes a 502 the client can read, never an exception.
    const deadRes = fakeRes()
    await relay(fakeReq([], { method: 'GET' }), deadRes, 'https://x/api', {
      fetch: async () => {
        throw new Error('offline')
      },
    })
    expect(deadRes.status).toBe(502)
    expect(JSON.parse(deadRes.body).msg).toMatch(/relay failed: offline/)
  })
})
