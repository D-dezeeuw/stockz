import { describe, it, expect, beforeEach } from 'vitest'
import {
  OKX_TIME_PATH,
  DRIFT_WARN_MS,
  clockOffset,
  clockDrift,
  setClockOffset,
  okxNow,
  syncOkxClock,
  resetClock,
} from './clock.js'

/** A fetch double that answers the public time endpoint. */
function fakeFetch(venueMs, { fail = false } = {}) {
  const calls = []
  return {
    calls,
    fetch: (url) => {
      calls.push(url)
      if (fail) return Promise.reject(new Error('offline'))
      return Promise.resolve({ json: () => Promise.resolve({ code: '0', data: [{ ts: String(venueMs) }] }) })
    },
  }
}

beforeEach(() => {
  resetClock()
})

describe('clockOffset', () => {
  it('corrects for the round trip rather than folding it into the offset', () => {
    // The venue stamped its reply somewhere in the middle of the round trip, so the browser
    // instant to compare against is the midpoint: comparing against arrival would fold the
    // whole latency in and over-correct by half the RTT on every sync.
    expect(clockOffset(1000, 0, 100)).toBe(950)
    expect(clockOffset(1000, 900, 1100)).toBe(0)
    expect(clockOffset(60000, 0, 0)).toBe(60000)

    expect(clockOffset(0, 0, 100)).toBe(0)
    expect(clockOffset('soon', 0, 100)).toBe(0)
    expect(clockOffset(1000, null, undefined)).toBe(0)
  })
})

describe('setClockOffset', () => {
  it('applies a measured offset and refuses a nonsense one', () => {
    expect(setClockOffset(4500)).toBe(4500)
    expect(clockDrift()).toBe(4500)

    // Loud past the point where the unsynced desk would already have been refused — those
    // refusals arrive as 401s and read exactly like a bad key.
    expect(setClockOffset(-DRIFT_WARN_MS - 1)).toBe(-DRIFT_WARN_MS - 1)

    expect(setClockOffset('later')).toBe(0)
    expect(setClockOffset(undefined)).toBe(0)
  })
})

describe('clockDrift', () => {
  it('reports the correction currently in force', () => {
    expect(clockDrift()).toBe(0)
    setClockOffset(-7000)
    expect(clockDrift()).toBe(-7000)
  })
})

describe('okxNow', () => {
  it('is the browser clock shifted onto the venue', () => {
    expect(okxNow(() => 1000)).toBe(1000)

    setClockOffset(2500)
    expect(okxNow(() => 1000)).toBe(3500)

    setClockOffset(-2500)
    expect(okxNow(() => 1000)).toBe(-1500)
  })
})

describe('syncOkxClock', () => {
  it('measures the drift against the venue, and keeps the old one when it cannot', async () => {
    const probe = fakeFetch(100000)
    // Probe sent at browser 0, reply read at 100, venue says 100000. The midpoint is 50, so
    // the machine is 99950ms behind — every signed request it made would have been refused.
    const stamps = [0, 100]
    expect(await syncOkxClock({ fetch: probe.fetch, now: () => stamps.shift() ?? 100 })).toBe(99950)
    expect(probe.calls[0]).toContain(OKX_TIME_PATH)
    expect(clockDrift()).toBe(99950)

    // A failed probe leaves the offset alone rather than zeroing it: a previously measured
    // correction beats none, and a failure is not evidence the clocks agree.
    expect(await syncOkxClock({ fetch: fakeFetch(0, { fail: true }).fetch, now: () => 0 })).toBe(99950)

    // An unreadable reply is the same story.
    const junk = () => Promise.resolve({ json: () => Promise.resolve({ code: '0', data: [] }) })
    expect(await syncOkxClock({ fetch: junk, now: () => 0 })).toBe(99950)

    // No fetch at all is a desk that simply cannot ask.
    expect(await syncOkxClock({ fetch: null })).toBe(99950)
  })
})

describe('resetClock', () => {
  it('forgets the measured offset', () => {
    setClockOffset(5000)
    expect(resetClock()).toBe(true)
    expect(clockDrift()).toBe(0)
    expect(okxNow(() => 42)).toBe(42)
  })
})
