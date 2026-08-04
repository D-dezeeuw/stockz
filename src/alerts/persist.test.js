import { describe, it, expect, beforeEach } from 'vitest'
import {
  sanitizeAlert,
  sanitizeOnLoad,
  portableAlert,
  migrateAlerts,
  exportAlerts,
  importAlerts,
  quotaGuard,
  rehydrateAlerts,
  registerPersistActions,
  ALERTS_VERSION,
  QUOTA_BYTES,
} from './persist.js'
import { createAlert, markFired, evalPriceCross } from './price.js'
import { resetAlerts, alertLog } from './bus.js'
import { ACTIONS } from '../actions/names.js'
import { clearActions } from '../actions/registry.js'
import { appState, setValue, tick, resetState } from '../app/engine.js'

beforeEach(() => {
  resetAlerts()
  resetState()
  clearActions()
})

describe('sanitizeAlert', () => {
  it('comes back armed, because a stale fired flag is a silent dead alert', () => {
    const spent = markFired(createAlert('okx:BTC-USDT', 'above', 70000), 1000)

    // Restored disarmed, it would sit out its cooldown against yesterday's timestamp and
    // look exactly like one that simply has not triggered.
    expect(sanitizeAlert(spent)).toMatchObject({ armed: true, firedAt: 0, fires: 1 })

    // Junk is dropped rather than repaired into something that fires constantly.
    expect(sanitizeAlert({ instrument: 'x', direction: 'above', price: 0 })).toBeNull()
    expect(sanitizeAlert({ price: 100 })).toBeNull()
    expect(sanitizeAlert(null)).toBeNull()
  })
})

describe('sanitizeOnLoad', () => {
  it('drops the duplicates a merged settings file can produce', () => {
    const alert = createAlert('okx:BTC-USDT', 'above', 70000)

    expect(sanitizeOnLoad([alert, { ...alert }, null, { price: 5 }])).toHaveLength(1)
    expect(sanitizeOnLoad(null)).toEqual([])
  })
})

describe('migrateAlerts', () => {
  it('repairs a renamed field rather than leaving alerts that look valid and never fire', () => {
    const old = {
      version: 0,
      alerts: [
        { instrument: 'okx:BTC-USDT', price: 70000, above: true },
        { instrument: 'okx:ETH-USDT', price: 4000, above: false },
      ],
    }

    const migrated = migrateAlerts(old)
    expect(migrated.version).toBe(ALERTS_VERSION)
    expect(migrated.alerts.map((a) => a.direction)).toEqual(['above', 'below'])

    // Already current: left alone apart from the sanitising pass.
    const current = { version: 1, alerts: [createAlert('x', 'below', 5)], toggles: { signals: {} } }
    expect(migrateAlerts(current).alerts[0].direction).toBe('below')
    expect(migrateAlerts(current).toggles).toEqual({ signals: {} })
    expect(migrateAlerts(null).alerts).toEqual([])
  })
})

describe('portableAlert', () => {
  it('strips what is local to one machine and keeps what describes the watch', () => {
    const spent = markFired(createAlert('okx:BTC-USDT', 'above', 70000), 1000)
    const portable = portableAlert(spent)

    expect(portable).toMatchObject({ instrument: 'okx:BTC-USDT', direction: 'above', price: 70000 })
    expect(portable).not.toHaveProperty('armed')
    expect(portable).not.toHaveProperty('firedAt')
    // A field added to the alert record later has to be decided about here rather than
    // exported by default, so the shape is an explicit pick.
    expect(Object.keys(portable).sort()).toEqual([
      'cooldownMs',
      'direction',
      'id',
      'instrument',
      'note',
      'oneShot',
      'price',
    ])
    expect(portableAlert(null)).toEqual({})
  })
})

describe('exportAlerts', () => {
  it('describes what to watch, not what happened to fire on one machine', () => {
    setValue('settings.alerts', [markFired(createAlert('okx:BTC-USDT', 'above', 70000), 1000)])
    setValue('settings.alertToggles', { signals: { 'momentum-burst': false } })
    tick()

    const payload = exportAlerts()

    expect(payload.version).toBe(ALERTS_VERSION)
    expect(payload.alerts[0]).not.toHaveProperty('firedAt')
    expect(payload.alerts[0]).not.toHaveProperty('armed')
    expect(payload.alerts[0].price).toBe(70000)
    expect(payload.toggles.signals['momentum-burst']).toBe(false)
  })
})

describe('importAlerts', () => {
  it('reports a wrong file rather than crashing on it', () => {
    const imported = importAlerts({
      version: 1,
      alerts: [{ instrument: 'okx:BTC-USDT', direction: 'above', price: 70000 }],
      toggles: { exec: { fill: false } },
    })
    tick()

    expect(imported.alerts).toHaveLength(1)
    expect(appState.settings.alerts[0].armed).toBe(true)
    expect(appState.settings.alertToggles.exec.fill).toBe(false)

    // JSON straight from a file input works too.
    expect(importAlerts(JSON.stringify({ version: 1, alerts: [] })).alerts).toEqual([])
    expect(importAlerts('not json at all')).toBeNull()
    expect(importAlerts(null)).toBeNull()
  })
})

describe('quotaGuard', () => {
  it('measures UTF-16 bytes, which counting characters understates by half', () => {
    expect(quotaGuard('ab').bytes).toBe(4)
    expect(quotaGuard({ a: 1 }).bytes).toBeGreaterThan(0)

    expect(quotaGuard('x'.repeat(100), 1000)).toMatchObject({ near: false, over: false })
    expect(quotaGuard('x'.repeat(450), 1000).near).toBe(true)
    expect(quotaGuard('x'.repeat(600), 1000).over).toBe(true)
    expect(QUOTA_BYTES).toBe(5000000)
  })
})

describe('rehydrateAlerts', () => {
  it('cannot fire a restored alert at boot, because a cross needs two prices', () => {
    const restored = rehydrateAlerts(
      [markFired(createAlert('okx:BTC-USDT', 'above', 70000), 1000)],
      5000,
    )
    tick()

    expect(restored).toHaveLength(1)
    expect(appState.settings.alerts[0].armed).toBe(true)

    // The first tick after boot has no previous price, so nothing can trigger on whichever
    // side of the level the market happened to already be.
    expect(evalPriceCross(restored[0], undefined, 99999)).toBe(false)

    // A near-full store says so while there is still room to act.
    setValue('settings.alerts', Array.from({ length: 40000 }, (_, i) => createAlert('x', 'above', i + 1)))
    tick()
    rehydrateAlerts(appState.settings.alerts, 6000)
    expect(alertLog().some((a) => a.key === 'alerts|quota')).toBe(true)
  })
})

describe('registerPersistActions', () => {
  it('wires export and import', () => {
    expect(registerPersistActions()).toBe(ACTIONS.alerts.export)
  })
})
