import { describe, it, expect, beforeEach } from 'vitest'
import {
  getOpenSize,
  exposureFor,
  capFor,
  capGate,
  cappedInstruments,
  refreshCaps,
  DEFAULT_CAP,
} from './caps.js'
import { appState, setValue, tick, resetState } from '../app/engine.js'

const POSITIONS = [
  { instrument: 'okx:BTC-USDT', size: 0.4 },
  { instrument: 'okx:BTC-USDT', size: -0.2 },
  { instrument: 'okx:ETH-USDT', size: 3 },
]

const ORDERS = [
  { instrument: 'BTC-USDT', size: 0.3, filled: 0.1, origin: 'bot' },
  { instrument: 'BTC-USDT', size: 5, filled: 0, origin: 'ticket' },
]

beforeEach(() => {
  resetState()
})

describe('getOpenSize', () => {
  it('counts a short as exposure, because a cap is about how much is at risk', () => {
    expect(getOpenSize('BTC-USDT', POSITIONS)).toBeCloseTo(0.6, 8)
    expect(getOpenSize('ETH-USDT', POSITIONS)).toBe(3)

    expect(getOpenSize('SOL-USDT', POSITIONS)).toBe(0)
    expect(getOpenSize('', POSITIONS)).toBe(0)
    expect(getOpenSize('BTC-USDT', null)).toBe(0)
  })
})

describe('exposureFor', () => {
  it('counts what is in flight, or a burst all passes the same cap at once', () => {
    const exposure = exposureFor('BTC-USDT', { positions: POSITIONS, orders: ORDERS })

    // 0.6 held plus the bot's 0.2 still working.
    expect(exposure).toMatchObject({ open: 0.6, pending: 0.2 })
    expect(exposure.total).toBeCloseTo(0.8, 8)

    // A hand-placed order is the trader's decision and must not consume the bot's
    // allowance — it counts once it fills, which is where it belongs.
    expect(exposure.pending).not.toBe(5.2)
    expect(exposureFor('SOL-USDT', { positions: POSITIONS, orders: ORDERS }).total).toBe(0)
  })
})

describe('capFor', () => {
  it('lets one instrument have its own limit without changing the rest', () => {
    expect(capFor('BTC-USDT', {})).toBe(DEFAULT_CAP)
    expect(capFor('BTC-USDT', { botMaxPerInstrument: 2 })).toBe(2)

    expect(
      capFor('BTC-USDT', { botMaxPerInstrument: 2, botCapOverrides: { 'BTC-USDT': 0.5 } }),
    ).toBe(0.5)
    // Zero is a real override — "never trade this one" is a thing to be able to say.
    expect(capFor('BTC-USDT', { botCapOverrides: { 'BTC-USDT': 0 } })).toBe(0)
  })
})

describe('capGate', () => {
  it('reports the numbers, not just that it refused', () => {
    setValue('settings.botMaxPerInstrument', 1)
    tick()
    const sources = { positions: POSITIONS, orders: ORDERS }

    // 0.8 exposed with a cap of 1: another 0.1 fits.
    expect(capGate({ instrument: 'okx:BTC-USDT' }, { size: 0.1, sources }).pass).toBe(true)

    const blocked = capGate({ instrument: 'okx:BTC-USDT' }, { size: 0.5, sources })
    expect(blocked.pass).toBe(false)
    // "Position cap" alone leaves the trader guessing whether it was one lot over or ten.
    expect(blocked.reason).toMatch(/cap 1 — holding 0.6 \+ 0.2 working/)

    expect(capGate({ instrument: '' }, { size: 0.1, sources }).pass).toBe(false)
  })
})

describe('cappedInstruments', () => {
  it('lists what is maxed out, so the trader knows why nothing is firing', () => {
    setValue('settings.botMaxPerInstrument', 1)
    tick()

    const capped = cappedInstruments({ sources: { positions: POSITIONS, orders: [] } })

    // ETH at 3 is over a cap of 1; BTC at 0.6 is not.
    expect(capped.map((r) => r.instrument)).toEqual(['ETH-USDT'])
    expect(capped[0]).toMatchObject({ exposure: 3, cap: 1 })
  })
})

describe('refreshCaps', () => {
  it('publishes the list for the block', () => {
    setValue('settings.botMaxPerInstrument', 1)
    tick()

    const rows = refreshCaps({ sources: { positions: POSITIONS, orders: [] } })
    tick()

    expect(rows).toHaveLength(1)
    expect(appState.bot.capped[0].instrument).toBe('ETH-USDT')
  })
})
