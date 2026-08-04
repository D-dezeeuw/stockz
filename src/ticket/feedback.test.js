import { describe, it, expect, beforeEach } from 'vitest'
import {
  orderToast,
  coalesceToasts,
  playCue,
  makeAudioContext,
  announceOrder,
  resetAudio,
  CUES,
} from './feedback.js'
import { appState, setValue, tick, resetState } from '../app/engine.js'

beforeEach(() => {
  resetState()
  resetAudio()
})

/** A WebAudio double recording the tone it was asked to play. */
function fakeAudio() {
  const played = []
  return {
    played,
    currentTime: 0,
    destination: {},
    createOscillator: () => ({
      frequency: {},
      connect: () => {},
      start: (at) => played.push(['start', at]),
      stop: (at) => played.push(['stop', at]),
    }),
    createGain: () => ({ gain: {}, connect: () => {} }),
  }
}

describe('orderToast', () => {
  it('announces outcomes and stays quiet about states the order row already shows', () => {
    expect(orderToast({ state: 'filled', side: 'buy', filled: 0.5, instId: 'BTC-USDT', avgPx: 100 })).toEqual(
      { message: 'filled BUY 0.5 BTC-USDT @ 100', level: 'success', cue: 'fill' },
    )
    expect(orderToast({ state: 'rejected', reason: 'no balance' })).toMatchObject({
      level: 'error',
      cue: 'reject',
    })
    expect(orderToast({ state: 'cancelled', side: 'sell', instId: 'ETH-USDT' }).level).toBe('warn')

    // A toast per partial on a sweeping fill is pure noise; the row already says it.
    expect(orderToast({ state: 'partial' })).toBeNull()
    expect(orderToast({ state: 'live' })).toBeNull()
    expect(orderToast(null)).toBeNull()
  })
})

describe('coalesceToasts', () => {
  it('turns a burst of identical fills into one card with a counter', () => {
    let list = coalesceToasts([], { message: 'filled BUY 1', ts: 1000 })
    expect(list).toEqual([{ message: 'filled BUY 1', ts: 1000, count: 1 }])

    list = coalesceToasts(list, { message: 'filled BUY 1', ts: 1200 })
    list = coalesceToasts(list, { message: 'filled BUY 1', ts: 1400 })
    // One card, not three: a burst of identical fills is one event to the trader.
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ count: 3, ts: 1400 })

    // Far enough apart is a separate event again.
    list = coalesceToasts(list, { message: 'filled BUY 1', ts: 9000 })
    expect(list).toHaveLength(2)

    // A different message never merges, however close.
    expect(coalesceToasts(list, { message: 'rejected', ts: 9000 })).toHaveLength(3)
    expect(coalesceToasts(list, {})).toBe(list)
  })
})

describe('playCue', () => {
  it('schedules a tone per outcome, and costs nothing when the desk is silent', () => {
    const ctx = fakeAudio()

    expect(playCue('fill', { ctx, volume: 0.3 })).toBe(true)
    expect(ctx.played).toEqual([
      ['start', 0],
      ['stop', CUES.fill.ms / 1000],
    ])

    // Muted is a real setting: an open-office desk runs silent, and it must cost nothing
    // rather than playing at zero gain.
    expect(playCue('fill', { ctx, volume: 0 })).toBe(false)
    expect(playCue('nonsense', { ctx, volume: 1 })).toBe(false)
    expect(playCue('fill', { ctx: {}, volume: 1 })).toBe(false)

    // Volume comes from settings when not passed.
    setValue('settings.volume', 0.5)
    tick()
    expect(playCue('ack', { ctx })).toBe(true)
  })
})

describe('makeAudioContext', () => {
  it('creates one context per session, since browsers cap how many a page may have', () => {
    let created = 0
    const scope = {
      AudioContext: function Ctx() {
        created += 1
      },
    }

    const first = makeAudioContext(scope)
    const second = makeAudioContext(scope)
    expect(first).toBe(second)
    expect(created).toBe(1)

    // Nowhere to play is not an error — the desk just runs silent.
    resetAudio()
    expect(makeAudioContext({})).toBeNull()
  })
})

describe('announceOrder', () => {
  it('interrupts only for outcomes, through both channels at once', () => {
    const ctx = fakeAudio()
    setValue('settings.volume', 0.4)
    tick()

    const feedback = announceOrder(
      { state: 'filled', side: 'buy', filled: 1, instId: 'BTC-USDT', avgPx: 99 },
      { ctx, now: 1000 },
    )
    tick()

    expect(feedback).toMatchObject({ level: 'success', cue: 'fill' })
    expect(appState.ui.toasts).toHaveLength(1)
    expect(appState.ui.toasts[0].message).toContain('filled BUY 1 BTC-USDT')
    expect(ctx.played).toHaveLength(2)

    // A working order is described by its row; interrupting for it teaches the trader to
    // ignore interruptions.
    expect(announceOrder({ state: 'live' }, { ctx })).toBeNull()
    expect(announceOrder(null, { ctx })).toBeNull()
    tick()
    expect(appState.ui.toasts).toHaveLength(1)
  })
})

describe('resetAudio', () => {
  it('drops the shared context so a silenced desk starts clean', () => {
    const scope = { AudioContext: function Ctx() {} }
    const first = makeAudioContext(scope)

    expect(resetAudio()).toBe(true)
    expect(makeAudioContext(scope)).not.toBe(first)
  })
})
