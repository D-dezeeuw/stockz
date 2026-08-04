// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { SOURCES, setFeedSource, isPlayback, feedNow, resetSource } from './source.js'
import { appState, setValue, tick, resetState } from '../app/engine.js'
import { PATHS } from '../state/paths.js'

const WALL = 1785999999999
const RECORDED = 1785000000000

/** A live feed double that records being muted and restored. */
function fakeFeed() {
  const calls = []
  return { calls, stop: () => calls.push('stop'), start: () => calls.push('start') }
}

beforeEach(() => {
  resetState()
  resetSource()
})

describe('setFeedSource', () => {
  it('mutes the live feed entering playback and restores it on the way out', () => {
    const feed = fakeFeed()

    expect(setFeedSource('playback', { feed })).toBe('playback')
    tick()
    expect(appState.playback.source).toBe('playback')
    // Muted rather than left running: live ticks arriving underneath a replay would
    // interleave with the recorded ones and corrupt the thing being studied.
    expect(feed.calls).toEqual(['stop'])

    // Setting the same source again is not a second mute.
    expect(setFeedSource('playback', { feed })).toBe('playback')
    expect(feed.calls).toEqual(['stop'])

    expect(setFeedSource('live')).toBe('live')
    tick()
    // Restored on the way out, so leaving replay returns a working desk rather than a
    // silent one that needs a reload.
    expect(feed.calls).toEqual(['stop', 'start'])

    // An unknown source is live, never an unrecognised third state.
    expect(setFeedSource('nonsense', { feed })).toBe('live')
    expect(SOURCES).toEqual(['live', 'playback'])
  })
})

describe('isPlayback', () => {
  it('answers false unless the desk is explicitly showing a recording', () => {
    expect(isPlayback({})).toBe(false)
    expect(isPlayback({ playback: {} })).toBe(false)
    expect(isPlayback({ playback: { source: 'live' } })).toBe(false)
    expect(isPlayback({ playback: { source: 'playback' } })).toBe(true)
  })
})

describe('feedNow', () => {
  it('reads the recorded moment during playback and the wall clock otherwise', () => {
    expect(feedNow({}, () => WALL)).toBe(WALL)

    // A session clock reading 14:05 over a book from yesterday morning is the single most
    // confusing thing this desk could show.
    expect(feedNow({ playback: { source: 'playback', at: RECORDED } }, () => WALL)).toBe(RECORDED)

    // Playback with no tick played yet still needs a number, so it falls back to the wall.
    expect(feedNow({ playback: { source: 'playback', at: 0 } }, () => WALL)).toBe(WALL)
  })
})

describe('resetSource', () => {
  it('forgets the suspended feed', () => {
    setFeedSource('playback', { feed: fakeFeed() })
    expect(resetSource()).toBe(true)

    // With nothing suspended, going live is a no-op rather than a throw.
    setValue(PATHS.playback.source, 'playback')
    tick()
    expect(setFeedSource('live')).toBe('live')
  })
})
