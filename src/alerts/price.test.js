import { describe, it, expect, beforeEach } from 'vitest'
import {
  createAlert,
  evalPriceCross,
  rearmAlert,
  markFired,
  alerts,
  saveAlert,
  updateAlert,
  removeAlert,
  evaluateAlerts,
  alertChips,
  publishAlertChips,
  registerAlertActions,
  DIRECTIONS,
  DEFAULT_COOLDOWN_MS,
} from './price.js'
import { ACTIONS } from '../actions/names.js'
import { dispatchAction, clearActions } from '../actions/registry.js'
import { appState, setValue, tick, resetState } from '../app/engine.js'

beforeEach(() => {
  resetState()
  clearActions()
})

describe('createAlert', () => {
  it('derives the id from what the alert is, so setting it twice replaces rather than piles up', () => {
    expect(createAlert('okx:BTC-USDT', 'above', 70000)).toMatchObject({
      id: 'okx:BTC-USDT|above|70000',
      instrument: 'okx:BTC-USDT',
      direction: 'above',
      price: 70000,
      armed: true,
      oneShot: false,
      cooldownMs: DEFAULT_COOLDOWN_MS,
    })

    // An unknown direction watches both sides rather than nothing.
    expect(createAlert('okx:BTC-USDT', 'sideways', 70000).direction).toBe('either')

    // A level of zero is an alert that fires immediately and forever.
    expect(createAlert('okx:BTC-USDT', 'above', 0)).toBeNull()
    expect(createAlert('', 'above', 70000)).toBeNull()
    expect(DIRECTIONS).toContain('either')
  })
})

describe('evalPriceCross', () => {
  it('treats a gap straight through the level as a cross, which is how fast tapes move', () => {
    const above = createAlert('x', 'above', 100)

    // 99.5 → 100.7 never prints 100. An equality test would never fire.
    expect(evalPriceCross(above, 99.5, 100.7)).toBe(true)
    expect(evalPriceCross(above, 100.7, 101)).toBe(false)
    expect(evalPriceCross(above, 101, 99)).toBe(false)

    const below = createAlert('x', 'below', 100)
    expect(evalPriceCross(below, 101, 99)).toBe(true)
    expect(evalPriceCross(below, 99, 98)).toBe(false)

    const either = createAlert('x', 'either', 100)
    expect(evalPriceCross(either, 99, 101)).toBe(true)
    expect(evalPriceCross(either, 101, 99)).toBe(true)

    // The first tick after arming would otherwise fire on whichever side price already was.
    expect(evalPriceCross(above, undefined, 200)).toBe(false)
    expect(evalPriceCross({ ...above, armed: false }, 99, 101)).toBe(false)
  })
})

describe('rearmAlert', () => {
  it('brings a repeating alert back and leaves a one-shot spent', () => {
    const spent = { armed: false, firedAt: 1000, cooldownMs: 5000, oneShot: false }

    expect(rearmAlert(spent, 4000).armed).toBe(false)
    expect(rearmAlert(spent, 6000).armed).toBe(true)

    // A one-shot never comes back on its own; that is the whole difference.
    expect(rearmAlert({ ...spent, oneShot: true }, 999999).armed).toBe(false)

    const live = { armed: true }
    expect(rearmAlert(live, 9999)).toBe(live)
  })
})

describe('markFired', () => {
  it('disarms rather than deletes, because the level that mattered will matter again', () => {
    const alert = createAlert('x', 'above', 100)
    const fired = markFired(alert, 5000)

    expect(fired).toMatchObject({ armed: false, firedAt: 5000, fires: 1 })
    expect(markFired(fired, 9000).fires).toBe(2)
  })
})

describe('alerts', () => {
  it('reads the saved list, and an empty desk as an empty list', () => {
    expect(alerts()).toEqual([])

    setValue('settings.alerts', [createAlert('x', 'above', 100)])
    tick()
    expect(alerts()).toHaveLength(1)
  })
})

describe('saveAlert', () => {
  it('replaces by id, so the same level three times is not three alerts', () => {
    saveAlert(createAlert('x', 'above', 100))
    tick()
    saveAlert(createAlert('x', 'above', 100))
    tick()

    expect(appState.settings.alerts).toHaveLength(1)

    saveAlert(createAlert('x', 'below', 100))
    tick()
    expect(appState.settings.alerts).toHaveLength(2)
    expect(saveAlert(null)).toEqual(appState.settings.alerts)
  })
})

describe('updateAlert', () => {
  it('re-arms on any edit, since a moved level is meant to be live', () => {
    const alert = markFired(createAlert('x', 'above', 100), 1000)
    setValue('settings.alerts', [alert])
    tick()

    const updated = updateAlert(alert.id, { price: 105 })
    tick()

    expect(updated).toMatchObject({ price: 105, armed: true })
    expect(updateAlert('nope', { price: 1 })).toBeNull()
  })
})

describe('removeAlert', () => {
  it('deletes one and says whether it found it', () => {
    const alert = createAlert('x', 'above', 100)
    setValue('settings.alerts', [alert])
    tick()

    expect(removeAlert(alert.id)).toBe(true)
    tick()
    expect(appState.settings.alerts).toEqual([])
    expect(removeAlert(alert.id)).toBe(false)
  })
})

describe('evaluateAlerts', () => {
  it('folds every fire into one write, because setValue lands next tick', () => {
    setValue('settings.alerts', [
      createAlert('okx:BTC-USDT', 'above', 100),
      createAlert('okx:BTC-USDT', 'above', 102),
      createAlert('okx:ETH-USDT', 'above', 100),
    ])
    tick()

    // One gap through both levels fires both — a write per alert would have the second read
    // a list missing the first.
    const fired = evaluateAlerts('okx:BTC-USDT', 99, 105, 5000)
    tick()

    expect(fired).toHaveLength(2)
    expect(appState.settings.alerts.filter((a) => a.armed === false)).toHaveLength(2)
    // The other instrument was untouched.
    expect(appState.settings.alerts.find((a) => a.instrument === 'okx:ETH-USDT').armed).toBe(true)

    // Still inside the cooldown, so the same move fires nothing.
    expect(evaluateAlerts('okx:BTC-USDT', 99, 105, 6000)).toEqual([])
    expect(evaluateAlerts('', 99, 105, 5000)).toEqual([])
  })
})

describe('alertChips', () => {
  it('shows a spent alert as spent rather than as one that simply has not fired', () => {
    setValue('settings.alerts', [
      createAlert('x', 'above', 100),
      markFired(createAlert('x', 'below', 90), 1000),
      createAlert('y', 'above', 50),
    ])
    tick()

    const chips = alertChips('x')
    expect(chips).toHaveLength(2)
    expect(chips[0]).toMatchObject({ label: '↑ 100', tone: 'armed' })
    expect(chips[1]).toMatchObject({ label: '↓ 90', tone: 'spent' })
  })
})

describe('publishAlertChips', () => {
  it('publishes the focused instrument’s chips, defaulting to whatever is on screen', () => {
    setValue('settings.alerts', [createAlert('okx:BTC-USDT', 'above', 100)])
    setValue('market.focus', 'okx:BTC-USDT')
    tick()

    expect(publishAlertChips()).toHaveLength(1)
    tick()
    expect(appState.ui.alertChips[0].label).toBe('↑ 100')
    expect(publishAlertChips('okx:ETH-USDT')).toEqual([])
  })
})

describe('registerAlertActions', () => {
  it('wires create, update and remove to the form', () => {
    expect(registerAlertActions()).toBe(ACTIONS.alerts.create)

    dispatchAction(ACTIONS.alerts.create, { instrument: 'okx:BTC-USDT', direction: 'above', price: 70000 })
    tick()
    expect(appState.settings.alerts).toHaveLength(1)

    // The form binds its fields with data-model, so the action reads the draft too rather
    // than depending on how the engine assembles a submit payload.
    setValue('market.focus', 'okx:ETH-USDT')
    setValue('ui.alertDraft', 4000)
    setValue('ui.alertDirection', 'below')
    tick()
    dispatchAction(ACTIONS.alerts.create, {})
    tick()
    expect(appState.settings.alerts).toHaveLength(2)

    dispatchAction(ACTIONS.alerts.update, { id: 'okx:BTC-USDT|above|70000', value: 71000 })
    tick()
    const found = appState.settings.alerts.find((a) => a.id === 'okx:BTC-USDT|above|70000')
    expect(found.price).toBe(71000)

    dispatchAction(ACTIONS.alerts.remove, { id: 'okx:BTC-USDT|above|70000' })
    tick()
    expect(appState.settings.alerts.map((a) => a.instrument)).toEqual(['okx:ETH-USDT'])
  })
})
