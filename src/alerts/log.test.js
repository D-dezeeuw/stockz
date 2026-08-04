import { describe, it, expect, beforeEach } from 'vitest'
import {
  formatTs,
  filterLog,
  logChips,
  unreadCount,
  refreshLog,
  toggleFilter,
  markLogSeen,
  registerLogActions,
  LOG_ROWS,
} from './log.js'
import { emitAlert, resetAlerts } from './bus.js'
import { ACTIONS } from '../actions/names.js'
import { dispatchAction, clearActions } from '../actions/registry.js'
import { appState, setValue, tick, resetState } from '../app/engine.js'

beforeEach(() => {
  resetAlerts()
  resetState()
  clearActions()
})

describe('formatTs', () => {
  it('reads in UTC, so a session across a timezone change does not jump an hour', () => {
    expect(formatTs(Date.UTC(2026, 7, 4, 13, 45, 6, 78))).toBe('13:45:06.078')

    // Nothing recorded reads as nothing, not as midnight.
    expect(formatTs(0)).toBe('--:--:--')
    expect(formatTs(NaN)).toBe('--:--:--')
  })
})

describe('filterLog', () => {
  it('reads an empty filter as everything, which is what a filter bar starts as', () => {
    const rows = [
      { severity: 'error', source: 'exec' },
      { severity: 'info', source: 'signal' },
      { severity: 'error', source: 'health' },
    ]

    // A filter UI that starts empty and shows an empty list reads as a broken log.
    expect(filterLog(rows)).toHaveLength(3)
    expect(filterLog(rows, { severity: 'error' })).toHaveLength(2)
    expect(filterLog(rows, { source: 'exec' })).toHaveLength(1)
    expect(filterLog(rows, { severity: 'error', source: 'health' })).toHaveLength(1)
    expect(filterLog(null)).toEqual([])
  })
})

describe('logChips', () => {
  it('carries counts, so nobody has to click each filter to find out what fired', () => {
    const rows = [
      { severity: 'error', source: 'exec' },
      { severity: 'error', source: 'exec' },
      { severity: 'info', source: 'signal' },
    ]

    const chips = logChips(rows, { severity: 'error' })
    const error = chips.find((c) => c.value === 'error')

    expect(error).toMatchObject({ kind: 'severity', count: 2, active: true })
    expect(chips.find((c) => c.value === 'exec')).toMatchObject({ kind: 'source', count: 2 })
    // Every severity gets a chip even at zero: a filter that appears only once it has
    // something to show is one nobody learns.
    expect(chips.filter((c) => c.kind === 'severity')).toHaveLength(4)
    expect(logChips(null)).toHaveLength(4)
  })
})

describe('unreadCount', () => {
  it('counts what arrived since the trader last looked, not since the session began', () => {
    const rows = [{ ts: 1000 }, { ts: 2000 }, { ts: 3000 }]

    expect(unreadCount(rows, 1500)).toBe(2)
    expect(unreadCount(rows, 0)).toBe(3)
    expect(unreadCount(rows, 9000)).toBe(0)
    expect(unreadCount(null, 0)).toBe(0)
  })
})

describe('refreshLog', () => {
  it('publishes newest first with the row limit applied', () => {
    for (let i = 1; i <= LOG_ROWS + 10; i += 1) {
      emitAlert({ text: `a${i}`, key: `k${i}`, source: 'signal', ts: i * 1000 })
    }

    const published = refreshLog(99999)
    tick()

    expect(published.rows).toHaveLength(LOG_ROWS)
    expect(published.rows[0].text).toBe(`a${LOG_ROWS + 10}`)
    expect(published.rows[0].time).toMatch(/^\d\d:\d\d:\d\d\./)
    expect(appState.ui.alertPanel.total).toBeGreaterThan(LOG_ROWS)
  })
})

describe('toggleFilter', () => {
  it('clears on a second click, or people leave the log filtered by accident', () => {
    expect(toggleFilter('severity', 'error')).toEqual({ severity: 'error', source: '' })
    tick()

    expect(toggleFilter('severity', 'error').severity).toBe('')
    tick()
    expect(toggleFilter('source', 'exec').source).toBe('exec')
  })
})

describe('markLogSeen', () => {
  it('moves the unread mark to now', () => {
    expect(markLogSeen(5000)).toBe(5000)
    tick()
    expect(appState.ui.logSeenAt).toBe(5000)
  })
})

describe('registerLogActions', () => {
  it('makes a row the way back to the thing that happened', () => {
    expect(registerLogActions()).toBe(ACTIONS.alerts.filterLog)

    dispatchAction(ACTIONS.alerts.filterLog, { kind: 'severity', value: 'error' })
    tick()
    expect(appState.ui.logFilter.severity).toBe('error')

    // The log's job is to be the way back, not a list to read.
    dispatchAction(ACTIONS.alerts.jumpTo, { instrument: 'okx:ETH-USDT' })
    tick()
    expect(appState.market.focus).toBe('okx:ETH-USDT')

    emitAlert({ text: 'x', key: 'k', ts: 1000 })
    setValue('ui.logFilter', { severity: '', source: '' })
    tick()
    dispatchAction(ACTIONS.alerts.clearLog, {})
    tick()
    expect(appState.ui.alertPanel.rows).toEqual([])
  })
})
