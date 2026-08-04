import { describe, it, expect, beforeEach } from 'vitest'
import {
  scheduleTone,
  playSound,
  soundForAlert,
  unlockAudio,
  resumeAudio,
  soundAlert,
  wireAlertSounds,
  SOUNDS,
  SEVERITY_SOUNDS,
} from './sounds.js'
import { resetAudio } from '../ticket/feedback.js'
import { setValue, tick, resetState } from '../app/engine.js'

/** An AudioContext double that records what was scheduled. */
function fakeCtx() {
  const scheduled = []
  let resumed = 0

  return {
    scheduled,
    currentTime: 10,
    state: 'suspended',
    destination: {},
    resume: () => {
      resumed += 1
      return Promise.resolve()
    },
    get resumed() {
      return resumed
    },
    createOscillator: () => {
      const osc = { frequency: {}, connect: () => {}, start: (t) => scheduled.push(t), stop: () => {} }
      return osc
    },
    createGain: () => ({
      gain: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} },
      connect: () => {},
    }),
  }
}

beforeEach(() => {
  resetAudio()
  resetState()
})

describe('scheduleTone', () => {
  it('ramps the envelope down, because a hard stop on an oscillator clicks', () => {
    const ctx = fakeCtx()

    expect(scheduleTone(ctx, SOUNDS.buy[0], 10, 0.5)).toBe(true)
    expect(ctx.scheduled).toEqual([10])

    // The offset places the second tone after the first: an interval, not a chord.
    scheduleTone(ctx, SOUNDS.buy[1], 10, 0.5)
    expect(ctx.scheduled[1]).toBeCloseTo(10.055, 3)

    expect(scheduleTone(null, SOUNDS.buy[0], 10, 0.5)).toBe(false)
    expect(scheduleTone(ctx, null, 10, 0.5)).toBe(false)
  })
})

describe('playSound', () => {
  it('costs nothing when muted, rather than playing at zero gain', () => {
    const ctx = fakeCtx()

    expect(playSound('buy', { ctx, volume: 0.3 })).toBe(2)
    expect(playSound('error', { ctx, volume: 0.3 })).toBe(1)

    // A desk in an open office runs silent, and that must be free.
    expect(playSound('buy', { ctx, volume: 0 })).toBe(0)
    expect(playSound('nope', { ctx, volume: 0.3 })).toBe(0)
    expect(playSound('buy', { ctx: {}, volume: 0.3 })).toBe(0)

    // Volume falls back to the setting, and a context with no clock starts at zero rather
    // than scheduling at NaN — which silently plays nothing at all.
    setValue('settings.volume', 0.4)
    tick()
    const clockless = { ...fakeCtx(), currentTime: undefined }
    expect(playSound('buy', { ctx: clockless })).toBe(2)
    expect(clockless.scheduled[0]).toBe(0)

    // No context available at all — a headless environment.
    expect(playSound('buy', { volume: 0.3 })).toBe(0)
  })
})

describe('soundForAlert', () => {
  it('maps direction to the interval nobody has to memorise', () => {
    expect(soundForAlert({ kind: 'buy' })).toBe('buy')
    expect(soundForAlert({ kind: 'sell' })).toBe('sell')
    expect(soundForAlert({ kind: 'fill' })).toBe('buy')

    // An error must not be mistakable for a fill.
    expect(soundForAlert({ kind: 'reject' })).toBe('error')
    expect(soundForAlert({ kind: 'disconnect' })).toBe('error')

    // Anything with no direction falls back to its severity.
    expect(soundForAlert({ severity: 'warn' })).toBe('alert')
    expect(soundForAlert({ severity: 'error' })).toBe(SEVERITY_SOUNDS.error)
    expect(soundForAlert({})).toBe('')
  })
})

describe('resumeAudio', () => {
  it('swallows a rejected resume, because the next click will try again', () => {
    const rejecting = {
      AudioContext: function AudioContextDouble() {
        return { ...fakeCtx(), resume: () => Promise.reject(new Error('no gesture yet')) }
      },
    }

    expect(resumeAudio(rejecting)).toBe(true)
    tick()

    // No AudioContext at all — a headless environment, or a browser with audio disabled.
    expect(resumeAudio({})).toBe(false)
  })
})

describe('unlockAudio', () => {
  it('waits for a gesture, because a browser refuses audio before one', () => {
    const handlers = new Map()
    const scope = {
      AudioContext: function AudioContextDouble() {
        return fakeCtx()
      },
      document: {
        addEventListener: (name, fn) => handlers.set(name, fn),
        removeEventListener: (name) => handlers.delete(name),
      },
    }

    const off = unlockAudio(scope)
    expect(handlers.has('pointerdown')).toBe(true)

    // A trader who reaches for a hotkey before the mouse must not have a silent desk.
    expect(handlers.has('keydown')).toBe(true)

    handlers.get('keydown')()
    tick()
    // Both listeners go once one has fired: the unlock only has to happen once.
    expect(handlers.size).toBe(0)

    off()
    expect(() => unlockAudio({})).not.toThrow()
  })
})

describe('soundAlert', () => {
  it('has its own mute, because wanting the toast without the noise is the common case', () => {
    const ctx = fakeCtx()

    expect(soundAlert({ kind: 'buy', severity: 'info' }, { ctx, volume: 0.3 })).toBe('buy')

    setValue('settings.alertToggles', { sound: { info: false } })
    tick()
    expect(soundAlert({ kind: 'buy', severity: 'info' }, { ctx, volume: 0.3 })).toBe('')
    // A different severity is still audible: the mute is per tier, not all-or-nothing.
    expect(soundAlert({ kind: 'reject', severity: 'error' }, { ctx, volume: 0.3 })).toBe('error')

    expect(soundAlert({}, { ctx, volume: 0.3 })).toBe('')
  })
})

describe('wireAlertSounds', () => {
  it('takes one subscription, like every other output on the bus', () => {
    const heard = []
    const off = wireAlertSounds((fn) => {
      heard.push(fn)
      return () => heard.pop()
    })

    expect(heard).toHaveLength(1)
    // The callback is the wire: it must reach soundAlert without throwing on a headless
    // environment that has no AudioContext.
    expect(() => heard[0]({ kind: 'buy', severity: 'info' })).not.toThrow()

    off()
    expect(heard).toHaveLength(0)
    expect(() => wireAlertSounds(null)()).not.toThrow()
  })
})
