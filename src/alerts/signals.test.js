import { describe, it, expect, beforeEach } from 'vitest'
import {
  signalSeverity,
  mapSignalToAlert,
  routeSignalAlert,
  setAlertToggle,
  toggleRows,
  publishToggles,
  SIGNAL_DEBOUNCE_MS,
} from './signals.js'
import { resetAlerts, alertLog } from './bus.js'
import { appState, setValue, tick, resetState } from '../app/engine.js'

/** A normalised signal, as the strategy engine publishes them. */
function signal(overrides = {}) {
  return {
    action: 'buy',
    strength: 0.5,
    reason: 'stretched',
    instrument: 'okx:BTC-USDT',
    ts: 1000,
    ...overrides,
  }
}

beforeEach(() => {
  resetAlerts()
  resetState()
})

describe('signalSeverity', () => {
  it('lets the strategy’s own conviction pick the tier', () => {
    expect(signalSeverity(signal({ strength: 0.5 }))).toBe('info')
    expect(signalSeverity(signal({ strength: 0.9 }))).toBe('warn')

    // An exit is a success in the plain sense that the position is off.
    expect(signalSeverity(signal({ action: 'flat' }))).toBe('success')
    expect(signalSeverity(signal({ action: 'none' }))).toBe('info')
    expect(signalSeverity(null)).toBe('info')
  })
})

describe('mapSignalToAlert', () => {
  it('carries the reason, because the trader has about a second to judge it', () => {
    const alert = mapSignalToAlert(signal(), { strategyId: 'mean-rev', name: 'Mean Reversion' })

    expect(alert).toMatchObject({
      key: 'signal|mean-rev|okx:BTC-USDT|buy',
      source: 'signal',
      strategyId: 'mean-rev',
      severity: 'info',
      instrument: 'okx:BTC-USDT',
    })
    expect(alert.text).toBe('Mean Reversion BUY okx:BTC-USDT — stretched')

    // An exit reads as an exit rather than as 'FLAT'.
    expect(mapSignalToAlert(signal({ action: 'flat' }), { strategyId: 'a' }).text).toMatch(/EXIT/)

    // 'none' is a strategy having no opinion; alerting on it would mean alerting constantly.
    expect(mapSignalToAlert(signal({ action: 'none' }))).toBeNull()
    expect(mapSignalToAlert(null)).toBeNull()
  })
})

describe('routeSignalAlert', () => {
  it('honours the mute, and collapses a strategy repeating itself', () => {
    const first = routeSignalAlert(signal(), { strategyId: 'mean-rev', name: 'Mean Rev' })
    expect(first).toBeTruthy()

    // The same call again inside the window is one alert.
    expect(routeSignalAlert(signal({ ts: 1100 }), { strategyId: 'mean-rev' })).toBeNull()
    // The same strategy flipping side is a new one.
    expect(routeSignalAlert(signal({ action: 'sell', ts: 1100 }), { strategyId: 'mean-rev' })).toBeTruthy()

    setValue('settings.alertToggles', { signals: { 'mean-rev': false } })
    tick()
    expect(
      routeSignalAlert(signal({ ts: 1000 + SIGNAL_DEBOUNCE_MS * 2 }), { strategyId: 'mean-rev' }),
    ).toBeNull()

    expect(alertLog()).toHaveLength(2)
  })
})

describe('setAlertToggle', () => {
  it('mutes one source without disturbing the rest of the map', () => {
    setAlertToggle('signals', 'a', false)
    tick()
    setAlertToggle('signals', 'b', false)
    tick()
    setAlertToggle('signals', 'a', true)
    tick()

    expect(appState.settings.alertToggles.signals).toEqual({ a: true, b: false })
    expect(setAlertToggle('', 'a', false)).toBeTruthy()
  })
})

describe('toggleRows', () => {
  it('shows an untouched source as on, matching what it actually does', () => {
    setValue('settings.alertToggles', { signals: { b: false } })
    tick()

    const rows = toggleRows('signals', [{ id: 'a', name: 'Alpha' }, { id: 'b', name: 'Beta' }])

    expect(rows[0]).toEqual({ group: 'signals', key: 'a', label: 'Alpha', enabled: true })
    expect(rows[1].enabled).toBe(false)
    expect(toggleRows('signals', null)).toEqual([])
  })
})

describe('publishToggles', () => {
  it('publishes a row per strategy for the settings drawer', () => {
    const rows = publishToggles([{ id: 'a', name: 'Alpha' }])
    tick()

    expect(rows).toHaveLength(1)
    expect(appState.ui.alertToggles[0].label).toBe('Alpha')
  })
})
