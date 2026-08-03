import { describe, it, expect } from 'vitest'
import {
  WS_STATE,
  OKX_PUBLIC_URL,
  subscribeFrame,
  parseFrame,
  isStale,
  createOkxSocket,
} from './socket.js'

/** A socket double: records what was sent, lets the test drive every lifecycle event. */
function fakeSocket() {
  const sent = []
  const sock = {
    sent,
    closed: false,
    send: (frame) => sent.push(frame),
    close: () => {
      sock.closed = true
    },
  }
  return sock
}

/** A timer double that captures scheduled reconnects instead of waiting for them. */
function fakeTimer() {
  const scheduled = []
  return {
    scheduled,
    setTimeout: (fn, ms) => {
      scheduled.push({ fn, ms })
      return scheduled.length
    },
  }
}

describe('subscribeFrame', () => {
  it('builds a subscribe op and returns nothing when there is nothing to ask for', () => {
    expect(subscribeFrame([{ channel: 'tickers', instId: 'BTC-USDT' }])).toEqual({
      op: 'subscribe',
      args: [{ channel: 'tickers', instId: 'BTC-USDT' }],
    })

    expect(subscribeFrame([{ instId: 'X' }])).toBeNull()
    expect(subscribeFrame([])).toBeNull()
    expect(subscribeFrame(null)).toBeNull()
  })
})

describe('parseFrame', () => {
  it('sorts pongs, acks, errors and data pushes off one socket', () => {
    expect(parseFrame('pong')).toEqual({ kind: 'pong' })
    expect(parseFrame('{"event":"login"}')).toEqual({ kind: 'login' })
    expect(parseFrame('{"event":"error","code":"60009","msg":"bad key"}')).toEqual({
      kind: 'error',
      code: '60009',
      msg: 'bad key',
    })
    expect(parseFrame('{"event":"subscribe","arg":{"channel":"tickers"}}')).toEqual({
      kind: 'subscribed',
      channel: 'tickers',
    })

    const data = parseFrame(
      '{"arg":{"channel":"trades","instId":"BTC-USDT"},"action":"update","data":[{"px":"1"}]}',
    )
    expect(data).toMatchObject({ kind: 'data', channel: 'trades', instId: 'BTC-USDT' })
    expect(data.data).toHaveLength(1)

    // One malformed frame drops that frame, never the session.
    expect(parseFrame('{oops')).toEqual({ kind: 'unknown' })
    expect(parseFrame(undefined)).toEqual({ kind: 'unknown' })
  })
})

describe('isStale', () => {
  it('flags a socket that is open but silent — the failure that looks like calm', () => {
    expect(isStale(1000, 20000)).toBe(true)
    expect(isStale(1000, 5000)).toBe(false)
    expect(isStale(1000, 3000, 1000)).toBe(true)

    // Nothing has arrived yet is not the same as gone quiet.
    expect(isStale(0, 99999)).toBe(false)
    expect(isStale(NaN, 99999)).toBe(false)
  })
})

describe('createOkxSocket', () => {
  it('reconnects with backoff and resubscribes, so a recovered feed is not frozen', () => {
    const timer = fakeTimer()
    const sockets = []
    const states = []
    const frames = []

    const client = createOkxSocket({
      url: OKX_PUBLIC_URL,
      factory: () => {
        const sock = fakeSocket()
        sockets.push(sock)
        return sock
      },
      onFrame: (frame) => frames.push(frame),
      onState: (state) => states.push(state),
      timer,
    })

    client.connect()
    expect(client.state()).toBe(WS_STATE.connecting)

    sockets[0].onopen()
    expect(client.state()).toBe(WS_STATE.live)

    client.subscribe([{ channel: 'tickers', instId: 'BTC-USDT' }])
    expect(JSON.parse(sockets[0].sent.at(-1)).args).toHaveLength(1)

    // Duplicate subscriptions do not stack.
    client.subscribe([{ channel: 'tickers', instId: 'BTC-USDT' }])
    expect(JSON.parse(sockets[0].sent.at(-1)).args).toHaveLength(1)

    sockets[0].onmessage({ data: 'pong' })
    expect(frames.at(-1)).toEqual({ kind: 'pong' })

    // The venue drops the connection: reconnect is scheduled with backoff.
    sockets[0].onclose()
    expect(client.state()).toBe(WS_STATE.connecting)
    expect(timer.scheduled[0].ms).toBe(250)

    timer.scheduled[0].fn()
    sockets[1].onopen()

    // The new socket resubscribes on its own — a reconnected socket that forgot its
    // channels shows a frozen book, which reads as a quiet market.
    expect(JSON.parse(sockets[1].sent[0])).toEqual({
      op: 'subscribe',
      args: [{ channel: 'tickers', instId: 'BTC-USDT' }],
    })
    expect(client.attempts()).toBe(0)

    // Sending only works while live.
    expect(client.send({ op: 'ping' })).toBe(true)
    client.close()
    expect(sockets[1].closed).toBe(true)
    expect(client.state()).toBe(WS_STATE.dead)
    expect(client.send({ op: 'ping' })).toBe(false)

    // A close we asked for must not trigger a reconnect.
    sockets[1].onclose()
    expect(timer.scheduled).toHaveLength(1)
    expect(states).toContain(WS_STATE.live)

    // A socket error is logged, never thrown at the caller.
    expect(() => sockets[1].onerror(new Error('boom'))).not.toThrow()

    // Defaults: no callbacks supplied, and the built-in factory reaching for the global
    // WebSocket. Driving the lifecycle proves the no-op defaults are safe to rely on.
    const built = []
    globalThis.WebSocket = function FakeWebSocket(target) {
      built.push(target)
      return fakeSocket()
    }
    const bare = createOkxSocket({ timer })
    const bareSocket = bare.connect()

    expect(built).toEqual([OKX_PUBLIC_URL])
    expect(() => {
      bareSocket.onopen()
      bareSocket.onmessage({ data: 'pong' })
    }).not.toThrow()
    expect(bare.state()).toBe(WS_STATE.live)

    bare.close()
    delete globalThis.WebSocket
  })
})
