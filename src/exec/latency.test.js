import { describe, it, expect, beforeEach } from 'vitest'
import {
  stampLatency,
  latencyFor,
  latencySummary,
  evictStale,
  pendingStamps,
  resetLatency,
  WINDOW,
} from './latency.js'

beforeEach(() => resetLatency())

describe('stampLatency', () => {
  it('records each leg and feeds the summary only on a completed round trip', () => {
    stampLatency('a', 'submit', 1000)
    const acked = stampLatency('a', 'ack', 1080)

    expect(acked).toEqual({ submit: 1000, ack: 1080 })
    expect(latencySummary().count).toBe(1)

    // An ack with no submit before it is not a round trip and does not skew the numbers.
    stampLatency('b', 'ack', 2000)
    expect(latencySummary().count).toBe(1)

    // Junk timestamps are ignored rather than producing negative latencies.
    expect(stampLatency('a', 'fill', NaN)).toEqual({ submit: 1000, ack: 1080 })
    expect(stampLatency('', 'submit', 1)).toEqual({})
    expect(WINDOW).toBe(100)
  })
})

describe('latencyFor', () => {
  it('splits an order\'s life into the legs that have different owners', () => {
    stampLatency('a', 'submit', 1000)
    stampLatency('a', 'ack', 1080)
    stampLatency('a', 'fill', 1200)

    // submit→ack is the venue's round trip; ack→fill is the market's.
    expect(latencyFor('a')).toEqual({ toAck: 80, toFill: 120, total: 200 })

    // A leg that has not happened yet is zero, not a guess.
    stampLatency('b', 'submit', 500)
    expect(latencyFor('b')).toEqual({ toAck: 0, toFill: 0, total: 0 })
    expect(latencyFor('nope')).toEqual({ toAck: 0, toFill: 0, total: 0 })
  })
})

describe('latencySummary', () => {
  it('reports p95, because the average hides the one submit that took a second', () => {
    for (let i = 0; i < 20; i += 1) {
      stampLatency(`o${i}`, 'submit', 0)
      stampLatency(`o${i}`, 'ack', i === 19 ? 1000 : 50)
    }

    const summary = latencySummary()
    expect(summary.count).toBe(20)
    expect(summary.p50).toBe(50)
    // The outlier is the whole story when a desk feels unreliable, and an average of
    // ~97ms would have hidden it.
    expect(summary.worst).toBe(1000)
    expect(summary.p95).toBeGreaterThan(summary.p50)

    resetLatency()
    expect(latencySummary()).toEqual({ count: 0, p50: 0, p95: 0, worst: 0 })
  })
})

describe('resetLatency', () => {
  it('clears the window, which is what a new session starts with', () => {
    stampLatency('a', 'submit', 0)
    stampLatency('a', 'ack', 100)

    expect(resetLatency()).toBe(true)
    expect(latencyFor('a')).toEqual({ toAck: 0, toFill: 0, total: 0 })
    expect(latencySummary().count).toBe(0)
  })
})

describe('evictStale', () => {
  it('sweeps only the stamps whose ack never came', () => {
    stampLatency('lost', 'submit', 0)
    stampLatency('done', 'submit', 0)
    stampLatency('done', 'ack', 50)
    stampLatency('recent', 'submit', 29000)

    expect(pendingStamps()).toBe(2)

    // A completed round trip is already in the samples; dropping it changes nothing, so
    // only the unmatched ones are swept.
    expect(evictStale(40000, 30000)).toBe(1)
    expect(pendingStamps()).toBe(1)
    expect(latencyFor('done').toAck).toBe(50)
    expect(latencyFor('lost')).toEqual({ toAck: 0, toFill: 0, total: 0 })

    expect(evictStale(NaN)).toBe(0)
    expect(evictStale(40000)).toBe(0)
  })
})

describe('pendingStamps', () => {
  it('counts what the desk is still waiting on', () => {
    expect(pendingStamps()).toBe(0)

    stampLatency('a', 'submit', 0)
    expect(pendingStamps()).toBe(1)

    stampLatency('a', 'ack', 10)
    expect(pendingStamps()).toBe(0)
  })
})
