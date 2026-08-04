import { describe, it, expect, beforeEach } from 'vitest'
import {
  execSeverity,
  parseRejectReason,
  mapOrderEvent,
  coalescePartials,
  routeExecAlert,
  resetExecAlerts,
  REJECT_CODES,
  PARTIAL_WINDOW_MS,
} from './exec.js'
import { resetAlerts, alertLog } from './bus.js'
import { setValue, tick, resetState } from '../app/engine.js'

beforeEach(() => {
  resetExecAlerts()
  resetAlerts()
  resetState()
})

describe('execSeverity', () => {
  it('reserves the top tier for the one event where the desk did not comply', () => {
    expect(execSeverity('reject')).toBe('error')
    expect(execSeverity('rejected')).toBe('error')
    expect(execSeverity('filled')).toBe('success')
    expect(execSeverity('fill')).toBe('success')

    // Everything else is news, not a problem.
    expect(execSeverity('partial')).toBe('info')
    expect(execSeverity('cancel')).toBe('info')
    expect(execSeverity(null)).toBe('info')
  })
})

describe('parseRejectReason', () => {
  it('turns a venue code into something the trader can act on', () => {
    // '51008' tells a trader nothing; "not enough margin" tells them everything.
    expect(parseRejectReason('51008')).toBe('not enough margin')
    expect(parseRejectReason(51121)).toBe(REJECT_CODES[51121])

    // The venue's own message beats a bare code even when it is clumsy.
    expect(parseRejectReason('99999', 'Order placement failed.')).toBe('Order placement failed.')
    expect(parseRejectReason('99999')).toBe('venue code 99999')
    expect(parseRejectReason()).toBe('rejected')
  })
})

describe('mapOrderEvent', () => {
  it('says what happened, to what, at what price — in that order', () => {
    expect(
      mapOrderEvent({ type: 'fill', side: 'buy', instrument: 'BTC-USDT', qty: 2, px: 70000, ts: 5 }),
    ).toMatchObject({
      key: 'exec|fill|BTC-USDT',
      severity: 'success',
      text: 'FILL BUY 2 BTC-USDT @ 70000',
    })

    expect(mapOrderEvent({ type: 'partial', side: 'sell', instrument: 'x', qty: 1, px: 5 }).text).toMatch(
      /^PARTIAL SELL/,
    )
    expect(mapOrderEvent({ type: 'cancel', side: 'buy', instrument: 'x' }).severity).toBe('info')

    const reject = mapOrderEvent({ type: 'reject', side: 'buy', instrument: 'x', sCode: '51008' })
    expect(reject).toMatchObject({ severity: 'error', kind: 'reject' })
    expect(reject.text).toMatch(/not enough margin/)

    expect(mapOrderEvent({ type: 'acked' })).toBeNull()
    expect(mapOrderEvent(null)).toBeNull()
  })
})

describe('coalescePartials', () => {
  it('weights the merged price by size, which averaging the prices would get wrong', () => {
    const first = coalescePartials({ clientId: 'a', qty: 1, px: 100, ts: 1000 })
    expect(first).toMatchObject({ qty: 1, px: 100 })

    // 1 @ 100 plus 3 @ 200 is 4 @ 175, not 4 @ 150.
    const merged = coalescePartials({ clientId: 'a', qty: 3, px: 200, ts: 1200 })
    expect(merged).toMatchObject({ qty: 4, px: 175 })

    // Past the window it is a new order's worth of fills.
    const later = coalescePartials({ clientId: 'a', qty: 1, px: 300, ts: 1200 + PARTIAL_WINDOW_MS + 1 })
    expect(later.qty).toBe(1)

    // A different order never merges into this one.
    expect(coalescePartials({ clientId: 'b', qty: 5, px: 1, ts: 1200 }).qty).toBe(5)
    expect(coalescePartials({ qty: 2 }).qty).toBe(2)
  })
})

describe('routeExecAlert', () => {
  it('never collapses two rejects, because each is a decision to make', () => {
    expect(routeExecAlert({ type: 'fill', side: 'buy', instrument: 'x', qty: 1, px: 5, ts: 1000 })).toBeTruthy()

    // Two rejects in a row are two separate decisions; hiding the second would be the worst
    // possible thing to hide.
    expect(routeExecAlert({ type: 'reject', instrument: 'x', sCode: '51008', ts: 1000 })).toBeTruthy()
    expect(routeExecAlert({ type: 'reject', instrument: 'x', sCode: '51008', ts: 1001 })).toBeTruthy()

    // Eleven partials on one order are one alert.
    routeExecAlert({ type: 'partial', clientId: 'p', instrument: 'x', qty: 1, px: 5, ts: 2000 })
    routeExecAlert({ type: 'partial', clientId: 'p', instrument: 'x', qty: 1, px: 5, ts: 2100 })
    expect(alertLog().filter((a) => a.kind === 'partial')).toHaveLength(1)

    setValue('settings.alertToggles', { exec: { fill: false } })
    tick()
    expect(routeExecAlert({ type: 'fill', instrument: 'y', qty: 1, px: 5, ts: 9000 })).toBeNull()
    expect(routeExecAlert({ type: 'acked' })).toBeNull()
  })
})

describe('resetExecAlerts', () => {
  it('drops half-merged partials, so a new session starts from the first fill', () => {
    coalescePartials({ clientId: 'a', qty: 5, px: 100, ts: 1000 })

    expect(resetExecAlerts()).toBe(true)
    expect(coalescePartials({ clientId: 'a', qty: 1, px: 100, ts: 1100 }).qty).toBe(1)
  })
})
