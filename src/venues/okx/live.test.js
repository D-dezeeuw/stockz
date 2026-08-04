import { describe, it, expect, beforeEach } from 'vitest'
import {
  channelsFor,
  routeFrame,
  flushFeed,
  startOkxFeed,
  onFeedFrame,
  onFeedState,
  feedHandlers,
} from './live.js'
import { appState, tick, resetState } from '../../app/engine.js'
import { resetBus, recentTrades } from '../../pipeline/bus.js'
import { resetFeed } from '../../pipeline/feed.js'
import { resetCandles } from '../../pipeline/candles.js'
import { resetBooks, bookFor } from '../../book/state.js'
import { resetImbalance } from '../../book/imbalance.js'

beforeEach(() => {
  resetState()
  resetBus()
  resetFeed()
  resetCandles()
  resetBooks()
  resetImbalance()
})

/** A socket double recording what the feed asks of it. */
function fakeSocket() {
  const calls = []
  return {
    calls,
    connect: () => calls.push(['connect']),
    subscribe: (channels) => calls.push(['subscribe', channels]),
    close: () => calls.push(['close']),
    send: () => true,
    state: () => 'live',
  }
}

describe('channelsFor', () => {
  it('subscribes the three channels the desk actually renders', () => {
    expect(channelsFor('okx:BTC-USDT')).toEqual([
      { channel: 'trades', instId: 'BTC-USDT' },
      { channel: 'books5', instId: 'BTC-USDT' },
      { channel: 'tickers', instId: 'BTC-USDT' },
    ])

    // An unqualified symbol works too — the venue prefix is optional here.
    expect(channelsFor('ETH-USDT')[0].instId).toBe('ETH-USDT')
    expect(channelsFor('')).toEqual([])
    expect(channelsFor(null)).toEqual([])
  })
})

describe('routeFrame', () => {
  it('routes trades to the pipeline and depth to the book, ignoring the rest', () => {
    expect(
      routeFrame({
        kind: 'data',
        channel: 'trades',
        instId: 'BTC-USDT',
        data: [{ px: '100.5', sz: '2', side: 'sell', ts: '1000' }],
      }),
    ).toBe('trades')
    expect(recentTrades('BTC-USDT')).toHaveLength(1)
    expect(recentTrades('BTC-USDT')[0]).toMatchObject({ px: 100.5, side: 'sell' })

    expect(
      routeFrame({
        kind: 'data',
        channel: 'books5',
        instId: 'BTC-USDT',
        action: 'update',
        data: [{ bids: [['100', '2']], asks: [['100.5', '1']], ts: '1000' }],
      }),
    ).toBe('book')
    // books5 is a snapshot channel whatever the frame's action says, so the book is
    // replaced rather than merged — no deltas to lose, no sequence to keep.
    expect(bookFor('BTC-USDT').bids).toEqual([[100, 2]])
    tick()
    expect(appState.market.bookStatus).toBe('live')

    expect(
      routeFrame({
        kind: 'data',
        channel: 'tickers',
        instId: 'BTC-USDT',
        data: [{ bidPx: '99.9', askPx: '100.1' }],
      }),
    ).toBe('ticker')
    tick()
    expect(appState.market.bid).toBe(99.9)
    expect(appState.market.ask).toBe(100.1)

    // Everything that is not data passes through named but unhandled.
    expect(routeFrame({ kind: 'pong' })).toBe('pong')
    expect(routeFrame({ kind: 'data', channel: 'candle1s', data: [] })).toBe('candle1s')
    expect(routeFrame(null)).toBe('unknown')
  })
})

describe('flushFeed', () => {
  it('publishes book, tape and imbalance together, once', () => {
    routeFrame({
      kind: 'data',
      channel: 'trades',
      instId: 'BTC-USDT',
      data: [{ px: '100', sz: '3', side: 'buy', ts: '1000' }],
    })
    routeFrame({
      kind: 'data',
      channel: 'books5',
      instId: 'BTC-USDT',
      data: [{ bids: [['100', '9']], asks: [['100.5', '1']], ts: '1000' }],
    })

    expect(flushFeed('okx:BTC-USDT')).toBe(true)
    tick()

    // The book reaches state; the ladder derives off it (registerDerived's own test).
    expect(appState.market.book.bids).toEqual([[100, 9]])
    expect(appState.market.tape).toHaveLength(1)
    expect(appState.market.tape[0]).toMatchObject({ px: 100, side: 'buy' })
    // Nine bid against one offer is heavily bid, and the gauge says so.
    expect(appState.market.imbalance.side).toBe('bid')

    // Nothing new since the last flush: no second book write.
    expect(flushFeed('okx:BTC-USDT')).toBe(false)
    expect(flushFeed('')).toBe(false)
  })
})

describe('startOkxFeed', () => {
  it('connects, subscribes the focus, and pumps one flush per frame', () => {
    const socket = fakeSocket()
    const frames = []

    const feed = startOkxFeed({
      socket,
      raf: (fn) => frames.push(fn),
      focus: () => 'okx:BTC-USDT',
    })

    expect(socket.calls[0]).toEqual(['connect'])
    expect(socket.calls[1][1]).toHaveLength(3)
    expect(socket.calls[1][1][0]).toEqual({ channel: 'trades', instId: 'BTC-USDT' })

    // Re-focusing the same symbol does not re-subscribe.
    expect(feed.focusOn('okx:BTC-USDT')).toBe('okx:BTC-USDT')
    expect(socket.calls).toHaveLength(2)

    // A different symbol does, and re-arms the frame pump.
    feed.focusOn('okx:ETH-USDT')
    expect(socket.calls[2][1][0]).toEqual({ channel: 'trades', instId: 'ETH-USDT' })

    // One rAF armed at start; each pump re-arms exactly one more.
    expect(frames).toHaveLength(1)
    frames.shift()()
    expect(frames).toHaveLength(1)

    feed.stop()
    expect(socket.calls.at(-1)).toEqual(['close'])
    // Stopped: the pump does not re-arm, so a closed feed costs nothing.
    frames.shift()()
    expect(frames).toHaveLength(0)
  })
})

describe('onFeedFrame', () => {
  it('parses and routes one wire message, which is the whole path in', () => {
    const raw = JSON.stringify({
      arg: { channel: 'trades', instId: 'BTC-USDT' },
      data: [{ px: '100', sz: '1', side: 'buy', ts: '1000' }],
    })

    expect(onFeedFrame(raw, () => 'okx:BTC-USDT')).toBe('trades')
    expect(recentTrades('BTC-USDT')).toHaveLength(1)

    // A malformed frame drops that frame, never the session.
    expect(onFeedFrame('not json', () => '')).toBe('unknown')
    expect(onFeedFrame('pong', null)).toBe('pong')
  })
})

describe('onFeedState', () => {
  it('puts the socket state where the header LEDs can read it', () => {
    onFeedState('live')
    tick()
    expect(appState.market.venues.okx.state).toBe('live')

    onFeedState('dead')
    tick()
    expect(appState.market.venues.okx.state).toBe('dead')
  })
})

describe('feedHandlers', () => {
  it('binds the two callbacks the socket needs to the desk\'s focus', () => {
    const handlers = feedHandlers(() => 'okx:BTC-USDT')

    expect(typeof handlers.onFrame).toBe('function')
    expect(handlers.onState).toBe(onFeedState)

    handlers.onFrame(
      JSON.stringify({
        arg: { channel: 'tickers', instId: 'BTC-USDT' },
        data: [{ bidPx: '99', askPx: '101', ts: '5' }],
      }),
    )
    tick()
    expect(appState.market.bid).toBe(99)
  })
})
