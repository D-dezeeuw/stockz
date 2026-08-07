import { describe, it, expect, vi } from 'vitest'
import {
  feedUrl,
  backoffFor,
  subscribeFrame,
  parseFeedFrame,
  startFeed,
  PUBLIC_WS_URL,
  DEMO_WS_URL,
  BACKOFF_MS,
} from './feed.js'

describe('feedUrl', () => {
  it('sends demo to its own host, because the header trick is REST-only', () => {
    expect(feedUrl(false)).toBe(PUBLIC_WS_URL)
    expect(feedUrl(undefined)).toBe(PUBLIC_WS_URL)
    // A desk that flipped the REST header and kept the live socket would authenticate its
    // orders and then read a book from the other universe.
    expect(feedUrl(true)).toBe(DEMO_WS_URL)
  })
})

describe('backoffFor', () => {
  it('backs off and then holds at the cap, so a long outage still retries', () => {
    expect(backoffFor(0)).toBe(BACKOFF_MS[0])
    expect(backoffFor(2)).toBe(BACKOFF_MS[2])
    // Held at the cap rather than growing forever: a venue that returns after an hour
    // should be picked up in seconds, not in another hour.
    expect(backoffFor(99)).toBe(BACKOFF_MS.at(-1))
    expect(backoffFor(-5)).toBe(BACKOFF_MS[0])
  })
})

describe('subscribeFrame', () => {
  it('asks for the tape and the book on every instrument', () => {
    const frame = subscribeFrame(['BTC-USDT', 'ETH-USDT'])
    expect(frame.op).toBe('subscribe')
    expect(frame.args).toHaveLength(4)
    expect(frame.args).toContainEqual({ channel: 'trades', instId: 'BTC-USDT' })
    expect(frame.args).toContainEqual({ channel: 'books5', instId: 'ETH-USDT' })

    // Nothing to ask for is null, not an empty subscribe the venue would reject.
    expect(subscribeFrame([])).toBeNull()
    expect(subscribeFrame(undefined)).toBeNull()
  })
})

describe('parseFeedFrame', () => {
  it('sorts the one socket into trades, books and noise', () => {
    expect(parseFeedFrame('pong')).toEqual({ kind: 'pong' })
    expect(parseFeedFrame('{oops')).toEqual({ kind: 'unknown' })
    expect(parseFeedFrame(JSON.stringify({ event: 'subscribe' })).kind).toBe('subscribed')
    expect(parseFeedFrame(JSON.stringify({ event: 'error', msg: 'bad' }))).toEqual({
      kind: 'error',
      message: 'bad',
    })

    const trades = parseFeedFrame(
      JSON.stringify({
        arg: { channel: 'trades', instId: 'BTC-USDT' },
        data: [{ px: '60000', sz: '0.1', side: 'buy', ts: '1700' }],
      }),
    )
    expect(trades.kind).toBe('trades')
    expect(trades.trades[0]).toEqual({
      instrument: 'BTC-USDT',
      px: 60000,
      sz: 0.1,
      side: 'buy',
      ts: 1700,
    })

    const book = parseFeedFrame(
      JSON.stringify({
        arg: { channel: 'books5', instId: 'BTC-USDT' },
        data: [{ bids: [['100', '2'], ['99', '1']], asks: [['101', '3']], ts: '1700' }],
      }),
    )
    expect(book.kind).toBe('book')
    expect(book.book).toMatchObject({ bid: 100, ask: 101, mid: 100.5, bidSize: 3, askSize: 3 })
    // The raw ladders survive: book-imbalance reads levels off the tick itself and would
    // see a flat book if only the touch were carried.
    expect(book.book.bids).toEqual([['100', '2'], ['99', '1']])

    // A book with no data rows is not a book.
    expect(parseFeedFrame(JSON.stringify({ arg: { channel: 'books5' }, data: [] })).kind).toBe('unknown')
  })
})

describe('startFeed', () => {
  it('subscribes on open and reconnects on close, forever', () => {
    const sockets = []
    const timers = []
    const events = []

    const feed = startFeed({
      symbols: ['BTC-USDT'],
      onEvent: (e) => events.push(e),
      factory: (url) => {
        const socket = { url, sent: [], send: (f) => socket.sent.push(f), close: vi.fn() }
        sockets.push(socket)
        return socket
      },
      timer: { setTimeout: (fn, ms) => timers.push([fn, ms]) },
    })

    expect(feed.state()).toBe('connecting')
    sockets[0].onopen()
    expect(feed.state()).toBe('live')
    // Resubscribed immediately: a socket that reconnects but forgets its channels reads as
    // a quiet market rather than as missing data.
    expect(JSON.parse(sockets[0].sent[0]).args).toHaveLength(2)

    sockets[0].onmessage({ data: JSON.stringify({ arg: { channel: 'trades', instId: 'BTC-USDT' }, data: [{ px: '1' }] }) })
    expect(events.at(-1).kind).toBe('trades')

    // A drop schedules a reconnect rather than ending the session.
    sockets[0].onclose()
    expect(feed.state()).toBe('connecting')
    expect(timers).toHaveLength(1)
    timers[0][0]()
    expect(sockets).toHaveLength(2)

    // Closing by us is final — no reconnect storm after a deliberate stop.
    feed.close()
    expect(feed.state()).toBe('dead')
    sockets[1].onclose()
    expect(timers).toHaveLength(1)
  })
})
