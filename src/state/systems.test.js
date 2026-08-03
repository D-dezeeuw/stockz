// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  utcClock,
  uptimeSeconds,
  isSpreadAnomalous,
  registerSystems,
  tickClock,
  stopSystems,
  onThemeChange,
  makeSpreadWatcher,
  onThemeRepaint,
} from './systems.js'
import { appState, setValue, tick, resetState } from '../app/engine.js'
import { PATHS } from './paths.js'

/** A scheduler that records intervals instead of running them. */
function fakeTimer() {
  const intervals = []
  return {
    intervals,
    setInterval: (fn, ms) => {
      intervals.push({ fn, ms, cleared: false })
      return intervals.length - 1
    },
    clearInterval: (id) => {
      if (intervals[id]) intervals[id].cleared = true
    },
  }
}

beforeEach(() => {
  resetState()
})

afterEach(() => {
  stopSystems()
})

describe('utcClock', () => {
  it('renders UTC HH:MM:SS, the timestamp venues speak', () => {
    expect(utcClock(Date.UTC(2026, 7, 3, 14, 5, 9))).toBe('14:05:09')
    expect(utcClock(0)).toBe('00:00:00')
    expect(utcClock(NaN)).toBe('--:--:--')
    expect(utcClock(undefined)).toBe('--:--:--')
  })
})

describe('uptimeSeconds', () => {
  it('counts whole seconds since boot and never goes negative', () => {
    expect(uptimeSeconds(10_000, 4_000)).toBe(6)
    expect(uptimeSeconds(10_900, 10_000)).toBe(0)
    expect(uptimeSeconds(4_000, 10_000)).toBe(0)
    expect(uptimeSeconds(10_000, 0)).toBe(0)
    expect(uptimeSeconds(NaN, 1)).toBe(0)
  })
})

describe('isSpreadAnomalous', () => {
  it('flags books too wide to scalp, at or above the limit', () => {
    expect(isSpreadAnomalous(30)).toBe(true)
    expect(isSpreadAnomalous(25)).toBe(true)
    expect(isSpreadAnomalous(24.9)).toBe(false)
    expect(isSpreadAnomalous(-30)).toBe(true)
    expect(isSpreadAnomalous(5, 4)).toBe(true)
    expect(isSpreadAnomalous(NaN)).toBe(false)
  })
})

describe('tickClock', () => {
  it('writes the clock and uptime into state from one timestamp', () => {
    setValue(PATHS.app.bootedAt, Date.UTC(2026, 7, 3, 14, 0, 0))
    tick()

    const result = tickClock(Date.UTC(2026, 7, 3, 14, 0, 30))
    tick()

    expect(result).toEqual({ clock: '14:00:30', uptime: 30, expired: 0 })
    expect(appState.app.clock).toBe('14:00:30')
    expect(appState.app.uptime).toBe(30)
  })
})

describe('registerSystems', () => {
  it('starts the clock on a cadence and beats the heartbeat as ticks arrive', () => {
    const timer = fakeTimer()
    const { names } = registerSystems({
      now: () => Date.UTC(2026, 7, 3, 14, 0, 5),
      intervalMs: 1000,
      timer,
    })

    expect(names).toEqual(['clock', 'heartbeat', 'themeWatch', 'spreadWatch'])
    expect(timer.intervals).toHaveLength(1)
    expect(timer.intervals[0].ms).toBe(1000)

    // Driving the injected timer writes the clock — no real waiting.
    timer.intervals[0].fn()
    tick()
    expect(appState.app.clock).toBe('14:00:05')

    // The heartbeat proves the pump is alive as market ticks land.
    setValue(PATHS.market.ticks, 1)
    tick()
    expect(appState.app.heartbeat).toBeGreaterThan(0)
  })
})

describe('stopSystems', () => {
  it('undoes every registration so a reload cannot stack a second clock', () => {
    const timer = fakeTimer()
    registerSystems({ now: () => 0, timer })

    const undone = stopSystems({ timer })
    expect(undone).toBe(4)
    expect(timer.intervals[0].cleared).toBe(true)

    // Idempotent: a second teardown has nothing left to undo.
    expect(stopSystems({ timer })).toBe(0)

    // And the heartbeat no longer responds to ticks.
    const before = appState.app?.heartbeat ?? 0
    setValue(PATHS.market.ticks, 99)
    tick()
    expect(appState.app?.heartbeat ?? 0).toBe(before)
  })
})

describe('onThemeChange', () => {
  it('reports the theme now in force, tolerating a missing branch', () => {
    expect(onThemeChange({ ui: { theme: 'day' } })).toBe('day')
    expect(onThemeChange({ ui: {} })).toBe('unknown')
    expect(onThemeChange({})).toBe('unknown')
    expect(onThemeChange(null)).toBe('unknown')
  })
})

describe('makeSpreadWatcher', () => {
  it('warns on the crossing only, not on every tick while the book stays wide', () => {
    const warnings = []
    const watcher = makeSpreadWatcher({ warn: (msg) => warnings.push(msg) })

    expect(watcher({ market: { spreadBps: 5 } })).toBe(false)
    expect(warnings).toHaveLength(0)

    // Crossing into anomalous warns once...
    expect(watcher({ market: { spreadBps: 40 } })).toBe(true)
    expect(warnings).toEqual(['spread wide: 40bps'])

    // ...and staying wide stays quiet.
    watcher({ market: { spreadBps: 45 } })
    expect(warnings).toHaveLength(1)

    // Back to normal, then wide again, warns a second time.
    expect(watcher({ market: { spreadBps: 2 } })).toBe(false)
    watcher({ market: { spreadBps: 50 } })
    expect(warnings).toHaveLength(2)

    expect(watcher(null)).toBe(false)
  })
})

describe('onThemeRepaint', () => {
  it('lets canvas renderers repaint on a palette flip, and unsubscribe cleanly', () => {
    const seen = []
    const stop = onThemeRepaint((theme) => seen.push(theme))

    // A canvas drawn in phosphor green stays green on white until it is redrawn.
    onThemeChange({ ui: { theme: 'day' } })
    expect(seen).toEqual(['day'])

    onThemeChange({ ui: { theme: 'night' } })
    expect(seen).toEqual(['day', 'night'])

    stop()
    onThemeChange({ ui: { theme: 'day' } })
    expect(seen).toHaveLength(2)

    // A non-function registration is ignored rather than breaking the loop.
    expect(() => onThemeRepaint(null)()).not.toThrow()
  })
})
