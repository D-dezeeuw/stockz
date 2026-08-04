import { describe, it, expect, beforeEach } from 'vitest'
import {
  nextTrailStop,
  bestPrice,
  startTrail,
  advanceTrail,
  trailFor,
  stopTrail,
  resetTrails,
  TRAIL_DEFAULTS,
} from './trail.js'

beforeEach(() => resetTrails())

const config = (over = {}) => ({
  distanceTicks: 10,
  stepTicks: 2,
  tickSize: 0.1,
  side: 'buy',
  ...over,
})

describe('nextTrailStop', () => {
  it('only ever tightens — a stop that can loosen is not a stop', () => {
    // First stop: one distance below the best price seen.
    expect(nextTrailStop(100, 0, config())).toBe(99)

    // Price improved by more than a step: the stop follows.
    expect(nextTrailStop(101, 99, config())).toBe(100)

    // Price improved, but by less than a step: no amend, because an amend per tick is a
    // rate limit waiting to happen.
    expect(nextTrailStop(100.1, 99, config())).toBe(99)

    // Price fell back. This is the case that matters: the stop must not follow it down.
    expect(nextTrailStop(95, 99, config())).toBe(99)

    // A short trails the other way, tightening downward.
    expect(nextTrailStop(100, 0, config({ side: 'sell' }))).toBe(101)
    expect(nextTrailStop(99, 101, config({ side: 'sell' }))).toBe(100)
    expect(nextTrailStop(105, 101, config({ side: 'sell' }))).toBe(101)

    expect(nextTrailStop(0, 99, config())).toBe(99)
    expect(nextTrailStop(100, 99, config({ tickSize: 0 }))).toBe(99)
  })
})

describe('bestPrice', () => {
  it('knows that the best price for a short is the lowest one', () => {
    expect(bestPrice(100, 101, 'buy')).toBe(101)
    expect(bestPrice(100, 99, 'buy')).toBe(100)

    expect(bestPrice(100, 99, 'sell')).toBe(99)
    expect(bestPrice(100, 101, 'sell')).toBe(100)

    // The first mark seeds it, whichever way the trade points.
    expect(bestPrice(0, 50, 'sell')).toBe(50)
    expect(bestPrice(100, 0, 'buy')).toBe(100)
  })
})

describe('startTrail', () => {
  it('seeds the stop from the mark it was started at', () => {
    const trail = startTrail('pos-1', { mark: 100, ...config() })

    expect(trail).toMatchObject({ id: 'pos-1', side: 'buy', best: 100, stop: 99 })
    expect(trailFor('pos-1').stop).toBe(99)

    // Defaults apply when the caller says nothing.
    expect(startTrail('pos-2', { mark: 100, tickSize: 0.1 }).distanceTicks).toBe(
      TRAIL_DEFAULTS.distanceTicks,
    )

    expect(startTrail('', { mark: 100 })).toBeNull()
    expect(startTrail('pos-3', { mark: 0 })).toBeNull()
  })
})

describe('advanceTrail', () => {
  it('ratchets on improvement and fires on a breach of the live price', () => {
    startTrail('pos-1', { mark: 100, ...config() })

    // A rise ratchets the stop up.
    expect(advanceTrail('pos-1', 101)).toEqual({ stop: 100, moved: true, breached: false })

    // A fall does not move it back down — that is the entire point.
    expect(advanceTrail('pos-1', 100.5)).toEqual({ stop: 100, moved: false, breached: false })

    // Through the stop: breach is measured against the live price, not the best seen.
    expect(advanceTrail('pos-1', 99.9)).toMatchObject({ breached: true, stop: 100 })

    // A short breaches upward.
    startTrail('short-1', { mark: 100, ...config({ side: 'sell' }) })
    expect(advanceTrail('short-1', 99)).toMatchObject({ stop: 100, moved: true })
    expect(advanceTrail('short-1', 100.5)).toMatchObject({ breached: true })

    expect(advanceTrail('nope', 100)).toBeNull()
  })
})

describe('trailFor', () => {
  it('answers with the record or nothing', () => {
    startTrail('pos-1', { mark: 100, ...config() })

    expect(trailFor('pos-1').best).toBe(100)
    expect(trailFor('nope')).toBeNull()
  })
})

describe('stopTrail', () => {
  it('stops trailing, and says whether there was anything to stop', () => {
    startTrail('pos-1', { mark: 100, ...config() })

    expect(stopTrail('pos-1')).toBe(true)
    expect(trailFor('pos-1')).toBeNull()
    expect(stopTrail('pos-1')).toBe(false)
  })
})

describe('resetTrails', () => {
  it('drops every trail', () => {
    startTrail('pos-1', { mark: 100, ...config() })

    expect(resetTrails()).toBe(true)
    expect(trailFor('pos-1')).toBeNull()
  })
})
