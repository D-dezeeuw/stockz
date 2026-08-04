import { describe, it, expect, beforeEach } from 'vitest'
import {
  spreadBaseline,
  spreadSpike,
  latencySpike,
  formatDowntime,
  venueTransition,
  checkHealth,
  resetHealth,
  SPIKE_STREAK,
  LATENCY_WARN_MS,
} from './health.js'
import { resetAlerts, alertLog } from './bus.js'
import { setValue, tick, resetState } from '../app/engine.js'

beforeEach(() => {
  resetHealth()
  resetAlerts()
  resetState()
})

describe('spreadBaseline', () => {
  it('learns slowly, or it would stop calling a blowout a blowout within seconds', () => {
    // Seeded on the first reading: crawling up from zero would call the first minute of
    // every session a blowout.
    expect(spreadBaseline(0, 2)).toBe(2)

    // A 10× spike barely moves it at alpha 0.02.
    expect(spreadBaseline(2, 20)).toBeCloseTo(2.36, 2)
    expect(spreadBaseline(2, 20, 0.5)).toBe(11)

    expect(spreadBaseline(2, 0)).toBe(2)
    expect(spreadBaseline(2, NaN)).toBe(2)
  })
})

describe('spreadSpike', () => {
  it('needs the blowout to hold, because this is the alert most likely to be muted', () => {
    const state = {}

    expect(spreadSpike(state, 9, 2, 3)).toMatchObject({ spiking: false, streak: 1 })
    expect(spreadSpike(state, 9, 2, 3).streak).toBe(2)
    expect(spreadSpike(state, 9, 2, 3)).toMatchObject({ spiking: true, ratio: 4.5 })

    // One normal print resets it: a wide print between two normal ones is a print, not a
    // condition.
    expect(spreadSpike(state, 2, 2, 3)).toMatchObject({ spiking: false, streak: 0 })

    expect(spreadSpike(state, 9, 0, 3).spiking).toBe(false)
    expect(spreadSpike(null, 9, 2, 3).spiking).toBe(false)
    expect(SPIKE_STREAK).toBe(3)
  })
})

describe('latencySpike', () => {
  it('judges on the median, so one hiccup does not fire an hourly warning', () => {
    // One 900ms round trip among healthy ones is a hiccup.
    expect(latencySpike([40, 45, 900, 42, 41], 500)).toMatchObject({ slow: false, worst: 900 })

    // A genuinely slow feed has a slow middle.
    expect(latencySpike([600, 700, 800], 500).slow).toBe(true)

    expect(latencySpike([], 500)).toEqual({ slow: false, worst: 0 })
    expect(latencySpike(null, 500).slow).toBe(false)
    expect(LATENCY_WARN_MS).toBe(500)
  })
})

describe('formatDowntime', () => {
  it('says the gap in the unit that changes what the trader does next', () => {
    expect(formatDowntime(400)).toBe('400ms')
    expect(formatDowntime(4200)).toBe('4.2s')
    expect(formatDowntime(245000)).toBe('4m 5s')
    expect(formatDowntime(240000)).toBe('4m')

    expect(formatDowntime(-1)).toBe('unknown')
    expect(formatDowntime(NaN)).toBe('unknown')
  })
})

describe('venueTransition', () => {
  it('alerts on the change only, never on a socket repeating itself', () => {
    // The first reading is not news; there was nothing to change from.
    expect(venueTransition('okx', 'live', 1000)).toBeNull()
    expect(venueTransition('okx', 'live', 2000)).toBeNull()

    const down = venueTransition('okx', 'closed', 3000)
    expect(down).toMatchObject({ severity: 'error', kind: 'disconnect' })

    // The gap is the point: "back after 400ms" and "back after four minutes" call for
    // completely different next actions.
    const up = venueTransition('okx', 'live', 7200)
    expect(up.text).toMatch(/reconnected after 4.2s/)

    expect(venueTransition('', 'live', 1000)).toBeNull()
  })
})

describe('checkHealth', () => {
  it('warns once per condition, not once per frame', () => {
    setValue('settings.spreadSpikeK', 3)
    tick()
    const state = { spreadBase: 2 }

    // Held for three frames, then it says so.
    checkHealth(state, { spread: 20, now: 1000 })
    checkHealth(state, { spread: 20, now: 1100 })
    const raised = checkHealth(state, { spread: 20, now: 1200 })
    expect(raised[0]).toMatchObject({ kind: 'spread', severity: 'warn' })

    // The condition persists; repeating it every frame would bury the rest of the desk.
    expect(checkHealth(state, { spread: 20, now: 1300 })).toEqual([])

    const lag = checkHealth(state, { spread: 2, rtt: [600, 700, 800], now: 5000 })
    expect(lag[0]).toMatchObject({ kind: 'latency' })

    setValue('settings.alertToggles', { health: { latency: false } })
    tick()
    expect(checkHealth(state, { rtt: [900, 900, 900], now: 99000 })).toEqual([])
    expect(checkHealth(null, {})).toEqual([])
  })
})

describe('resetHealth', () => {
  it('forgets which venues were up, so the next first reading is not a transition', () => {
    venueTransition('okx', 'live', 1000)

    expect(resetHealth()).toBe(true)
    expect(venueTransition('okx', 'closed', 2000)).toBeNull()
    expect(alertLog()).toEqual([])
  })
})
