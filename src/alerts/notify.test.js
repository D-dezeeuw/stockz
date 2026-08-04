import { describe, it, expect, beforeEach } from 'vitest'
import {
  permissionState,
  requestPermission,
  visibilityGate,
  sendNotification,
  routeNative,
  registerNotifyActions,
  wireNativeAlerts,
  NATIVE_DEFAULTS,
} from './notify.js'
import { ACTIONS } from '../actions/names.js'
import { clearActions } from '../actions/registry.js'
import { appState, tick, resetState } from '../app/engine.js'

/** A Notification API double that records what it was asked to show. */
function fakeNotify(permission = 'granted') {
  const sent = []

  function NotificationDouble(title, opts) {
    sent.push({ title, ...opts })
    this.close = () => {}
  }
  NotificationDouble.permission = permission
  NotificationDouble.requestPermission = async () => 'granted'

  return { NotificationDouble, sent }
}

beforeEach(() => {
  resetState()
  clearActions()
})

describe('permissionState', () => {
  it('tells "nobody asked" apart from "they said no"', () => {
    const { NotificationDouble } = fakeNotify('default')

    expect(permissionState({ Notification: NotificationDouble })).toBe('default')
    tick()
    expect(appState.ui.notifyPermission).toBe('default')

    // The UI offers the enable button in one of these and not the other.
    expect(permissionState({})).toBe('unsupported')
    expect(permissionState({ Notification: fakeNotify('denied').NotificationDouble })).toBe('denied')
  })
})

describe('requestPermission', () => {
  it('asks the browser and records the answer, whatever it is', async () => {
    const { NotificationDouble } = fakeNotify('default')

    expect(await requestPermission({ Notification: NotificationDouble })).toBe('granted')
    tick()
    expect(appState.ui.notifyPermission).toBe('granted')

    // A browser with no API at all just reports what it has.
    expect(await requestPermission({})).toBe('unsupported')

    // One that throws is one that would not deliver either; reading the state back is
    // more honest than guessing.
    const throwing = function Throwing() {}
    throwing.permission = 'denied'
    throwing.requestPermission = () => {
      throw new Error('nope')
    }
    expect(await requestPermission({ Notification: throwing })).toBe('denied')
  })
})

describe('visibilityGate', () => {
  it('leaves the foreground to the toast, which already has it covered', () => {
    // A native notification for something already on screen is a duplicate that steals
    // focus.
    expect(visibilityGate(false, 'error')).toBe(false)

    expect(visibilityGate(true, 'error')).toBe(true)
    expect(visibilityGate(true, 'warn')).toBe(true)
    // An info-level native ping is how a trading app ends up permanently blocked.
    expect(visibilityGate(true, 'info')).toBe(false)
    expect(NATIVE_DEFAULTS.info).toBe(false)

    // An explicit setting always wins over the default.
    expect(visibilityGate(true, 'info', { alertToggles: { native: { info: true } } })).toBe(true)
    expect(visibilityGate(true, 'error', { alertToggles: { native: { error: false } } })).toBe(false)
  })
})

describe('sendNotification', () => {
  it('tags per instrument, so tabbing back finds one current alert and not forty stale ones', () => {
    const { NotificationDouble, sent } = fakeNotify('granted')
    const scope = { Notification: NotificationDouble, focus: () => {} }

    const sentOne = sendNotification(
      { text: 'REJECT BUY BTC-USDT', instrument: 'BTC-USDT', severity: 'error' },
      { scope },
    )
    expect(sentOne).toBeTruthy()
    expect(sent[0]).toMatchObject({ title: 'BTC-USDT', body: 'REJECT BUY BTC-USDT', tag: 'stockz|BTC-USDT' })

    // Clicking focuses the tab and jumps to the instrument — a shortcut rather than an
    // interruption.
    let clicked = null
    const withClick = sendNotification({ text: 'x', instrument: 'ETH-USDT' }, { scope, onClick: (a) => (clicked = a) })
    withClick.onclick()
    tick()
    expect(clicked.instrument).toBe('ETH-USDT')
    expect(appState.market.focus).toBe('ETH-USDT')

    expect(sendNotification({ text: '' }, { scope })).toBeNull()
    expect(sendNotification({ text: 'x' }, { scope: { Notification: fakeNotify('denied').NotificationDouble } })).toBeNull()
    expect(sendNotification({ text: 'x' }, { scope: {} })).toBeNull()
  })
})

describe('routeNative', () => {
  it('falls through to the toast rather than treating a denial as a failure', () => {
    const { NotificationDouble } = fakeNotify('granted')
    const scope = { Notification: NotificationDouble, focus: () => {} }

    expect(routeNative({ text: 'x', severity: 'error' }, { scope, hidden: true })).toBe('native')
    // Visible tab: the toast owns it.
    expect(routeNative({ text: 'x', severity: 'error' }, { scope, hidden: false })).toBe('')

    // Denied is not a failure — the alert was going to a toast anyway.
    const denied = { Notification: fakeNotify('denied').NotificationDouble }
    expect(routeNative({ text: 'x', severity: 'error' }, { scope: denied, hidden: true })).toBe('')
  })
})

describe('registerNotifyActions', () => {
  it('puts permission behind an explicit click, never behind page load', () => {
    // A page that fires the prompt in its first second gets "block" from most people, and
    // that answer is permanent and silent.
    expect(registerNotifyActions()).toBe(ACTIONS.alerts.enableNative)
  })
})

describe('wireNativeAlerts', () => {
  it('takes one subscription, like every other output on the bus', () => {
    const heard = []
    const off = wireNativeAlerts((fn) => {
      heard.push(fn)
      return () => heard.pop()
    })

    expect(heard).toHaveLength(1)
    expect(() => heard[0]({ text: 'x', severity: 'error' })).not.toThrow()
    off()
    expect(heard).toHaveLength(0)
    expect(() => wireNativeAlerts(null)()).not.toThrow()
  })
})
