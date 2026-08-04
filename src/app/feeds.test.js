import { describe, it, expect, beforeEach } from 'vitest'
import { shouldConnect, connectFeeds, feedOptions } from './feeds.js'
import { appState, setValue, tick, resetState } from './engine.js'

beforeEach(() => resetState())

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

describe('shouldConnect', () => {
  it('opens a socket only where one exists and the boot asked for it', () => {
    expect(shouldConnect({ feeds: true }, { WebSocket: function WS() {} })).toBe(true)

    // Opt-in, not opt-out: Node ships a global WebSocket, so a bare boot must not dial
    // the venue — otherwise every test in the suite would open a real socket.
    expect(shouldConnect({}, { WebSocket: function WS() {} })).toBe(false)

    // Asked for, but nothing to connect with.
    expect(shouldConnect({ feeds: true }, {})).toBe(false)
    expect(shouldConnect({ feeds: true }, null)).toBe(false)

    // An injected transport is a test or a mock supplying its own.
    expect(shouldConnect({ socketFactory: () => {} }, {})).toBe(true)
    // And an explicit opt-out wins over everything.
    expect(shouldConnect({ feeds: false, socketFactory: () => {} }, {})).toBe(false)
  })
})

describe('feedOptions', () => {
  it('reads the desk\'s current preferences for the focused instrument', () => {
    setValue('market.focus', 'okx:BTC-USDT')
    setValue('settings.tapeFloors', { 'okx:BTC-USDT': 5 })
    setValue('settings.whaleMultiplier', 6)
    setValue('settings.bookDepth', 20)
    tick()

    expect(feedOptions()).toEqual({ minSize: 5, multiplier: 6, depth: 20 })

    // An instrument with no floor of its own shows everything.
    setValue('market.focus', 'okx:ETH-USDT')
    tick()
    expect(feedOptions().minSize).toBe(0)

    // Unset preferences fall back rather than passing NaN into the filter chain.
    resetState()
    expect(feedOptions()).toEqual({ minSize: 0, multiplier: 4, depth: 10 })
  })
})

describe('connectFeeds', () => {
  it('starts the feed on the focus and re-subscribes when the trader switches', () => {
    const socket = fakeSocket()
    const frames = []

    setValue('market.focus', 'okx:BTC-USDT')
    tick()

    const feeds = connectFeeds({ socket, raf: (fn) => frames.push(fn) })

    expect(socket.calls[0]).toEqual(['connect'])
    expect(socket.calls[1][1][0]).toEqual({ channel: 'trades', instId: 'BTC-USDT' })
    expect(feeds.authenticated).toBe(false)

    // Switching instrument re-subscribes without a reconnect.
    setValue('market.focus', 'okx:ETH-USDT')
    tick()
    expect(socket.calls[2][1][0]).toEqual({ channel: 'trades', instId: 'ETH-USDT' })
    // Re-subscribe, not reconnect: the socket is opened exactly once.
    expect(socket.calls.filter(([call]) => call === 'connect')).toHaveLength(1)

    feeds.stop()
    expect(socket.calls.at(-1)).toEqual(['close'])
    // Unwatched: a later focus change does not resurrect a stopped feed.
    setValue('market.focus', 'okx:SOL-USDT')
    tick()
    expect(socket.calls.at(-1)).toEqual(['close'])

    // No transport available is not an error; the desk simply runs without live prices.
    const none = connectFeeds({ feeds: false })
    expect(none.okx).toBeNull()
    expect(() => none.stop()).not.toThrow()
    expect(appState.market.focus).toBe('okx:SOL-USDT')
  })
})
