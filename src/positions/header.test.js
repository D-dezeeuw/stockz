import { describe, it, expect, beforeEach } from 'vitest'
import {
  dayPnl,
  pnlDirection,
  compactPnl,
  refreshDayPnl,
  expirePulse,
  resetPnlHeader,
  PULSE_MS,
} from './header.js'
import { appState, setValue, tick, resetState } from '../app/engine.js'

beforeEach(() => {
  resetPnlHeader()
  resetState()
})

describe('dayPnl', () => {
  it('adds both halves, because either alone tells a lie', () => {
    // Realised only makes a session look flat while a losing position runs; floating
    // only forgets everything already booked.
    expect(dayPnl({ net: 100 }, { unrealized: -30 })).toBe(70)
    expect(dayPnl({ net: 0 }, { unrealized: 12.5 })).toBe(12.5)
    expect(dayPnl({ net: 100 }, {})).toBe(100)
    expect(dayPnl(null, null)).toBe(0)
  })
})

describe('pnlDirection', () => {
  it('ignores the wobble that would make the header strobe', () => {
    expect(pnlDirection(101, 100)).toBe('up')
    expect(pnlDirection(99, 100)).toBe('down')

    // A mark that moves a cent is not a move; pulsing on it teaches the trader to stop
    // seeing the header.
    expect(pnlDirection(100.001, 100)).toBe('flat')
    expect(pnlDirection(100, 100)).toBe('flat')

    expect(pnlDirection(100, null)).toBe('flat')
    expect(pnlDirection(NaN, 100)).toBe('flat')
  })
})

describe('compactPnl', () => {
  it('keeps the header from reflowing as the number grows', () => {
    expect(compactPnl(12.4)).toBe('+12.40')
    expect(compactPnl(-340.5)).toBe('−340.50')

    // A header that changes width drags the whole nav around with it.
    expect(compactPnl(1234)).toBe('+1.2K')
    expect(compactPnl(-2500000)).toBe('−2.5M')

    expect(compactPnl(0)).toBe('0.00')
    expect(compactPnl(NaN)).toBe('—')
  })
})

describe('refreshDayPnl', () => {
  it('publishes the number and pulses only on a real move', () => {
    setValue('trade.score', { net: 100 })
    setValue('trade.pnl', { unrealized: -30 })
    tick()

    // The first read has nothing to compare against, so it does not pulse.
    expect(refreshDayPnl({ now: 1000 })).toEqual({ value: 70, label: '+70.00', direction: 'flat' })
    tick()
    expect(appState.trade.dayTotal).toBe(70)
    expect(appState.trade.dayLabel).toBe('+70.00')
    expect(appState.ui.pnlPulse).toBe('')

    setValue('trade.pnl', { unrealized: 20 })
    tick()
    expect(refreshDayPnl({ now: 2000 }).direction).toBe('up')
    tick()
    expect(appState.ui.pnlPulse).toBe('up')
    expect(appState.ui.pnlPulseAt).toBe(2000)

    setValue('trade.pnl', { unrealized: -50 })
    tick()
    expect(refreshDayPnl({ now: 3000 }).direction).toBe('down')
  })
})

describe('expirePulse', () => {
  it('clears a pulse once it has run, and not before', () => {
    setValue('ui.pnlPulse', 'up')
    setValue('ui.pnlPulseAt', 1000)
    tick()

    expect(expirePulse(1000 + PULSE_MS - 1)).toBe(false)
    expect(expirePulse(1000 + PULSE_MS)).toBe(true)
    tick()
    expect(appState.ui.pnlPulse).toBe('')

    // Nothing pulsing is nothing to expire.
    expect(expirePulse(9999)).toBe(false)
  })
})

describe('resetPnlHeader', () => {
  it('forgets the last value, so a new session starts without a direction', () => {
    setValue('trade.score', { net: 100 })
    tick()
    refreshDayPnl({ now: 1000 })

    expect(resetPnlHeader()).toBe(true)
    setValue('trade.score', { net: 500 })
    tick()
    // First read after a reset does not pulse, however far the number moved.
    expect(refreshDayPnl({ now: 2000 }).direction).toBe('flat')
  })
})
