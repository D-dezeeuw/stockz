// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { ingest, setVenueState, markStaleFeeds, setBlockFeedStatus, feedStats, resetFeed } from './feed.js'
import { resetBus, recentTrades } from './bus.js'
import { candles, resetCandles } from './candles.js'
import { appState, tick as engineTick, resetState } from '../app/engine.js'
import { commitBlocks, currentBlocks } from '../blocks/registry.js'

beforeEach(() => {
  resetState()
  resetBus()
  resetCandles()
  resetFeed()
  globalThis.requestAnimationFrame = (fn) => fn()
})

describe('ingest', () => {
  it('is the single door every feed goes through — live, polled or replayed', () => {
    expect(ingest({ venue: 'okx', symbol: 'BTC-USDT', bid: 100, ask: 101, ts: 1000 })).toBe(true)
    engineTick()

    expect(appState.market.bid).toBe(100)

    // A print also builds candles and the tape.
    ingest({ venue: 'okx', symbol: 'BTC-USDT', px: 100.5, sz: 1, ts: 1200 })
    expect(recentTrades('BTC-USDT')).toHaveLength(1)
    expect(candles('BTC-USDT', '1s')).toHaveLength(1)

    expect(ingest({})).toBe(false)
  })
})

describe('setVenueState', () => {
  it('records connection state where the header LEDs read it', () => {
    setVenueState('okx', 'live')
    engineTick()
    expect(appState.market.venues.okx.state).toBe('live')

    setVenueState('etoro', 'connecting')
    engineTick()
    expect(appState.market.venues.okx.state).toBe('live')
    expect(appState.market.venues.etoro.state).toBe('connecting')
  })
})

describe('markStaleFeeds', () => {
  it('catches the open-but-silent socket, which otherwise reads as a calm market', () => {
    setVenueState('okx', 'live')
    ingest({ venue: 'okx', symbol: 'X', bid: 1, ask: 2, ts: 1000 })
    engineTick()

    expect(markStaleFeeds(5000)).toEqual([])

    expect(markStaleFeeds(20000)).toEqual(['okx'])
    engineTick()
    expect(appState.market.venues.okx.state).toBe('stale')

    // Already stale: not marked twice.
    expect(markStaleFeeds(30000)).toEqual([])
  })
})

describe('setBlockFeedStatus', () => {
  it('makes a block say stale rather than lying quietly', () => {
    commitBlocks([{ id: 'chart', order: 0, status: 'ready' }])
    engineTick()

    setBlockFeedStatus('chart', 'error', 'feed lost')
    engineTick()

    expect(currentBlocks()[0]).toMatchObject({ status: 'error', error: 'feed lost' })
  })
})

describe('feedStats', () => {
  it('reports throughput and per-venue liveness for the HUD', () => {
    ingest({ venue: 'okx', symbol: 'X', bid: 1, ask: 2, ts: 1000 })

    const stats = feedStats()
    expect(stats.received).toBe(1)
    expect(stats.lastSeen.okx).toBe(1000)
  })
})

describe('resetFeed', () => {
  it('forgets feed timing on reconnect', () => {
    ingest({ venue: 'okx', symbol: 'X', bid: 1, ask: 2, ts: 1000 })
    resetFeed()
    expect(feedStats().lastSeen).toEqual({})
  })
})
