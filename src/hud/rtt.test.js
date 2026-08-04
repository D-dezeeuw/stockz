import { describe, it, expect, beforeEach } from 'vitest'
import {
  classifyRtt,
  pingOkx,
  reportRtt,
  recordRtt,
  worstRtt,
  flushRtt,
  nextProbeDelay,
  startProbe,
  resetRtt,
  RTT_TIERS,
  PROBE_MS,
} from './rtt.js'
import { appState, tick, resetState } from '../app/engine.js'

beforeEach(() => {
  resetRtt()
  resetState()
})

/** A socket double whose pong the test controls. */
function fakeSocket() {
  let pong = null
  const sent = []

  return {
    sent,
    send: (frame) => sent.push(frame),
    onPong: (fn) => {
      pong = fn
    },
    pong: () => pong?.(),
  }
}

describe('classifyRtt', () => {
  it('separates "never measured" from "slow", which look nothing alike', () => {
    expect(classifyRtt(40)).toBe('ok')
    expect(classifyRtt(150)).toBe('warn')
    expect(classifyRtt(900)).toBe('bad')

    expect(classifyRtt(RTT_TIERS.ok)).toBe('ok')
    expect(classifyRtt(RTT_TIERS.warn)).toBe('warn')

    // Showing "never measured" as bad would have every desk start its session looking
    // broken.
    expect(classifyRtt(-1)).toBe('unknown')
    expect(classifyRtt(NaN)).toBe('unknown')
  })
})

describe('pingOkx', () => {
  it('times the round trip, and reports an unanswered ping as the reading it is', async () => {
    const socket = fakeSocket()
    let clock = 1000

    const pending = pingOkx(socket, {
      clock: () => clock,
      timer: { setTimeout: () => 1, clearTimeout: () => {} },
    })
    expect(socket.sent).toEqual(['ping'])

    clock = 1084
    socket.pong()
    expect(await pending).toBe(84)

    // A timeout resolves rather than rejects: an unanswered ping *is* the measurement,
    // and it is the most important reading there is.
    const timers = []
    const timedOut = pingOkx(fakeSocket(), {
      clock: () => 0,
      timer: { setTimeout: (fn) => (timers.push(fn), 1), clearTimeout: () => {} },
    })
    timers[0]()
    expect(await timedOut).toBe(-1)

    expect(await pingOkx(null)).toBe(-1)
    expect(await pingOkx({ send: () => {} })).toBe(-1)
  })
})

describe('reportRtt', () => {
  it('records a reading and publishes it, which recordRtt alone does not', () => {
    expect(reportRtt('etoro', 100)).toEqual({ ms: 100, tier: 'warn' })
    tick()

    // The point of the pair: a caller outside the probe loop gets it on screen without
    // having to remember to flush.
    expect(appState.ui.rtt.etoro).toEqual({ ms: 100, tier: 'warn' })
    expect(appState.ui.rtt.worst.venue).toBe('etoro')

    // A failure replaces the reading outright rather than smoothing into it.
    expect(reportRtt('etoro', -1)).toEqual({ ms: -1, tier: 'unknown' })
    tick()
    expect(appState.ui.rtt.etoro.ms).toBe(-1)

    expect(reportRtt('', 50)).toEqual({ ms: -1, tier: 'unknown' })
  })
})

describe('recordRtt', () => {
  it('smooths real readings and lets a failure replace one outright', () => {
    expect(recordRtt('okx', 100)).toEqual({ ms: 100, tier: 'warn' })

    // Smoothed: the second reading moves the value part of the way.
    const second = recordRtt('okx', 200)
    expect(second.ms).toBeGreaterThan(100)
    expect(second.ms).toBeLessThan(200)

    // "Not answering" is a state, not a slow sample — it replaces rather than blends.
    expect(recordRtt('okx', -1)).toEqual({ ms: -1, tier: 'unknown' })
    // And recovery starts fresh rather than from the pre-failure average.
    expect(recordRtt('okx', 40).ms).toBe(40)

    expect(recordRtt('', 100)).toEqual({ ms: -1, tier: 'unknown' })
  })
})

describe('worstRtt', () => {
  it('treats a venue that is not answering as the worst case outright', () => {
    recordRtt('okx', 40)
    recordRtt('etoro', 300)
    expect(worstRtt()).toMatchObject({ venue: 'etoro', tier: 'bad' })

    // Whatever the other venues read, silence is worse than slow.
    recordRtt('okx', -1)
    expect(worstRtt()).toMatchObject({ venue: 'okx', tier: 'unknown' })

    resetRtt()
    expect(worstRtt()).toEqual({ venue: '', ms: -1, tier: 'unknown' })
  })
})

describe('flushRtt', () => {
  it('publishes every venue plus the one that matters', () => {
    recordRtt('okx', 40)
    recordRtt('etoro', 300)

    const snapshot = flushRtt()
    tick()

    expect(snapshot.okx).toMatchObject({ tier: 'ok' })
    expect(appState.ui.rtt.etoro).toMatchObject({ tier: 'bad' })
    expect(appState.ui.rtt.worst.venue).toBe('etoro')
  })
})

describe('nextProbeDelay', () => {
  it('jitters, so two venues never spike the uplink together', () => {
    // ±20% around the base.
    expect(nextProbeDelay(5000, () => 0)).toBe(4000)
    expect(nextProbeDelay(5000, () => 1)).toBe(6000)
    expect(nextProbeDelay(5000, () => 0.5)).toBe(5000)

    // A floor, or a probe loop becomes the network problem it is measuring.
    expect(nextProbeDelay(1, () => 0.5)).toBe(500)
    expect(PROBE_MS).toBe(5000)
  })
})

describe('startProbe', () => {
  it('loops until stopped, recording and publishing each reading', async () => {
    const timers = []
    const stop = startProbe('okx', async () => 40, {
      timer: {
        setTimeout: (fn, ms) => {
          timers.push([fn, ms])
          return timers.length
        },
        clearTimeout: () => {},
      },
      random: () => 0.5,
      baseMs: 5000,
    })

    expect(timers[0][1]).toBe(5000)
    await timers[0][0]()
    tick()
    expect(appState.ui.rtt.okx).toMatchObject({ ms: 40, tier: 'ok' })
    // Re-armed for the next reading.
    expect(timers).toHaveLength(2)

    stop()
    await timers[1][0]()
    expect(timers).toHaveLength(2)

    expect(() => startProbe('okx', null)()).not.toThrow()
    expect(() => startProbe('okx', async () => 1, { timer: null })()).not.toThrow()
  })
})

describe('resetRtt', () => {
  it('forgets every reading', () => {
    recordRtt('okx', 40)

    expect(resetRtt()).toBe(true)
    expect(worstRtt().venue).toBe('')
  })
})
