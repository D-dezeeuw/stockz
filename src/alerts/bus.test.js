import { describe, it, expect, beforeEach } from 'vitest'
import {
  makeAlert,
  isDuplicate,
  emitAlert,
  onAlert,
  alertLog,
  flushAlerts,
  alertEnabled,
  resetAlerts,
  SEVERITIES,
  ALERT_LOG_SIZE,
  DEFAULT_DEBOUNCE_MS,
} from './bus.js'
import { appState, setValue, tick, resetState } from '../app/engine.js'

beforeEach(() => {
  resetAlerts()
  resetState()
})

describe('makeAlert', () => {
  it('refuses an alert with nothing to say, which costs attention and returns none', () => {
    expect(makeAlert({ source: 'signal', text: 'BUY BTC', severity: 'warn', ts: 5 })).toEqual({
      key: 'signal|BUY BTC',
      source: 'signal',
      severity: 'warn',
      text: 'BUY BTC',
      instrument: '',
      ts: 5,
    })

    // An unrecognised severity is info, not a crash and not an escalation.
    expect(makeAlert({ text: 'x', severity: 'catastrophe' }).severity).toBe('info')
    expect(makeAlert({ text: '   ' })).toBeNull()
    expect(makeAlert(null)).toBeNull()
    expect(SEVERITIES).toEqual(['info', 'success', 'warn', 'error'])
  })
})

describe('isDuplicate', () => {
  it('collapses a source repeating itself, which is what makes the stack readable', () => {
    emitAlert({ text: 'BUY BTC', key: 'k', ts: 1000 })

    expect(isDuplicate({ key: 'k', ts: 1500 })).toBe(true)
    expect(isDuplicate({ key: 'k', ts: 1000 + DEFAULT_DEBOUNCE_MS })).toBe(false)

    // A different key is a different alert however fast it arrives.
    expect(isDuplicate({ key: 'other', ts: 1001 })).toBe(false)
    expect(isDuplicate({ ts: 1001 })).toBe(false)
  })
})

describe('emitAlert', () => {
  it('reaches every listener once, and a suppressed one not at all', () => {
    const heard = []
    onAlert((a) => heard.push(a.text))

    expect(emitAlert({ text: 'BUY BTC', key: 'k', ts: 1000 })).toMatchObject({ text: 'BUY BTC' })
    expect(emitAlert({ text: 'BUY BTC', key: 'k', ts: 1100 })).toBeNull()
    expect(heard).toEqual(['BUY BTC'])

    expect(emitAlert({ text: '' })).toBeNull()
    expect(emitAlert({ text: 'BUY BTC', key: 'k', ts: 9000 })).toBeTruthy()
  })
})

describe('onAlert', () => {
  it('unsubscribes cleanly, so a torn-down output stops being fed', () => {
    const heard = []
    const off = onAlert((a) => heard.push(a.text))

    emitAlert({ text: 'one', key: 'a', ts: 1 })
    off()
    emitAlert({ text: 'two', key: 'b', ts: 2 })

    expect(heard).toEqual(['one'])
    expect(() => onAlert(null)()).not.toThrow()
  })
})

describe('alertLog', () => {
  it('is bounded, so a screaming source cannot eat the session', () => {
    for (let i = 0; i < ALERT_LOG_SIZE + 10; i += 1) {
      emitAlert({ text: `a${i}`, key: `k${i}`, ts: i })
    }

    expect(alertLog()).toHaveLength(ALERT_LOG_SIZE)
    expect(alertLog().at(-1).text).toBe(`a${ALERT_LOG_SIZE + 9}`)
    expect(alertLog(3)).toHaveLength(3)
  })
})

describe('flushAlerts', () => {
  it('publishes newest first, which is where the eye already is', () => {
    emitAlert({ text: 'older', key: 'a', ts: 1 })
    emitAlert({ text: 'newer', key: 'b', ts: 2 })

    const rows = flushAlerts()
    tick()

    expect(rows[0].text).toBe('newer')
    expect(appState.alerts.log[0].text).toBe('newer')
    expect(appState.alerts.fired.text).toBe('newer')
  })
})

describe('alertEnabled', () => {
  it('defaults on, because opting out is a decision and opting in should not be', () => {
    expect(alertEnabled('signals', 'momentum-burst')).toBe(true)

    setValue('settings.alertToggles', { signals: { 'momentum-burst': false } })
    tick()

    expect(alertEnabled('signals', 'momentum-burst')).toBe(false)
    // A strategy nobody has touched is still on.
    expect(alertEnabled('signals', 'vwap-revert')).toBe(true)
  })
})

describe('resetAlerts', () => {
  it('drops the log, the debounce memory and every listener', () => {
    const heard = []
    onAlert((a) => heard.push(a))
    emitAlert({ text: 'one', key: 'a', ts: 1 })

    expect(resetAlerts()).toBe(true)
    expect(alertLog()).toEqual([])

    emitAlert({ text: 'two', key: 'b', ts: 2 })
    expect(heard).toHaveLength(1)
  })
})
