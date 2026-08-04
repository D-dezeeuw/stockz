// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { DEFAULT_LATENCY, latencyConfig, latencyFor, afterLatency, seedLatency } from './latency.js'
import { setValue, tick, resetState } from '../../app/engine.js'
import { PATHS } from '../../state/paths.js'

beforeEach(() => {
  resetState()
  seedLatency(1234)
})

describe('latencyConfig', () => {
  it('is off by default and clamps a jitter that would go backwards', () => {
    // Off by default: the realism is worth having, but a beginner's first ten orders
    // should not feel broken.
    expect(latencyConfig({})).toEqual(DEFAULT_LATENCY)
    expect(latencyConfig({ settings: { paperLatencyMs: 40, paperLatencyJitter: 0.5 } })).toEqual({
      ms: 40,
      jitter: 0.5,
    })

    // A jitter above 1 would produce negative delays, and an order that arrives before it
    // was sent is not realism.
    expect(latencyConfig({ settings: { paperLatencyJitter: 4 } }).jitter).toBe(1)
    expect(latencyConfig({ settings: { paperLatencyMs: -10 } }).ms).toBe(0)
    expect(latencyConfig({ settings: { paperLatencyMs: 'soon' } }).ms).toBe(0)
  })
})

describe('latencyFor', () => {
  it('varies around the base, reproducibly, and stays at zero when off', () => {
    // Symmetric around the base: real latency is not a constant, and a sim that always
    // delivered exactly 40ms would teach a rhythm the wire does not have.
    expect(latencyFor({ ms: 40, jitter: 0.5 }, () => 0)).toBe(20)
    expect(latencyFor({ ms: 40, jitter: 0.5 }, () => 1)).toBe(60)
    expect(latencyFor({ ms: 40, jitter: 0.5 }, () => 0.5)).toBe(40)
    expect(latencyFor({ ms: 40, jitter: 0 }, () => 0)).toBe(40)

    // Off is off — no jitter around zero.
    expect(latencyFor({ ms: 0, jitter: 1 }, () => 0)).toBe(0)
    expect(latencyFor({}, () => 0)).toBe(0)

    // Never negative, whatever the draw.
    expect(latencyFor({ ms: 10, jitter: 1 }, () => 0)).toBe(0)
  })
})

describe('afterLatency', () => {
  it('returns straight through when off, and waits the wire when on', async () => {
    // Zero is a *synchronous* return, not a zero-length timeout: `setTimeout(fn, 0)` would
    // push every paper fill a frame later than the click, which is exactly the latency
    // this feature exists to make optional.
    let ran = false
    const instant = afterLatency(() => ((ran = true), 'done'), { config: { ms: 0 } })
    expect(ran).toBe(true)
    expect(await instant).toBe('done')

    const scheduled = []
    const timer = { setTimeout: (fn, ms) => scheduled.push({ fn, ms }) }
    let late = false
    const delayed = afterLatency(() => ((late = true), 'landed'), {
      config: { ms: 40, jitter: 0 },
      timer,
      draw: () => 0.5,
    })

    expect(late).toBe(false)
    expect(scheduled[0].ms).toBe(40)
    scheduled[0].fn()
    expect(await delayed).toBe('landed')

    // No timer at all is a desk that simply cannot delay, not one that hangs.
    expect(await afterLatency(() => 'now', { config: { ms: 40 }, timer: {} })).toBe('now')
  })
})

describe('seedLatency', () => {
  it('makes the session reproducible from its seed', () => {
    setValue(PATHS.settings.paperLatencyMs, 40)
    tick()

    seedLatency(7)
    const first = [latencyFor({ ms: 40, jitter: 0.5 }), latencyFor({ ms: 40, jitter: 0.5 })]
    seedLatency(7)
    // A paper session with unseeded randomness could not be reproduced from its recording,
    // which would make the two halves of this desk disagree about what "the same run" is.
    expect([latencyFor({ ms: 40, jitter: 0.5 }), latencyFor({ ms: 40, jitter: 0.5 })]).toEqual(first)

    seedLatency(8)
    expect(latencyFor({ ms: 40, jitter: 0.5 })).not.toBe(first[0])
  })
})
