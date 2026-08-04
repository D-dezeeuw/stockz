import { describe, it, expect, beforeEach } from 'vitest'
import { spreadBps, sessionPace, winRate, readHud, refreshHud, resetHud } from './state.js'
import { appState, setValue, tick, resetState } from '../app/engine.js'
import { appendRealization, resetLedger } from '../positions/ledger.js'
import { stampLatency, resetLatency } from '../exec/latency.js'
import { ingestFill, resetPositions } from '../positions/store.js'
import { resetBus } from '../pipeline/bus.js'

beforeEach(() => {
  resetHud()
  resetState()
  resetLedger()
  resetLatency()
  resetPositions()
  resetBus()
})

describe('spreadBps', () => {
  it('reports the spread in the unit a scalper compares against their edge', () => {
    setValue('market.bid', 100)
    setValue('market.ask', 100.1)
    tick()

    // A two-tick spread means something different on every instrument; bps does not.
    expect(spreadBps()).toBeCloseTo(9.995, 2)

    // A crossed or one-sided market has no spread to quote.
    setValue('market.ask', 99)
    tick()
    expect(spreadBps()).toBe(0)

    resetState()
    expect(spreadBps()).toBe(0)
  })
})

describe('sessionPace', () => {
  it('counts trades per minute, the metric overtrading shows up in first', () => {
    appendRealization({ amount: 5, ts: 99000 })
    appendRealization({ amount: -2, ts: 99500 })
    appendRealization({ amount: 3, ts: 10000 })

    const pace = sessionPace(100000)

    // Two of the three closes are inside the last minute.
    expect(pace.perMinute).toBe(2)
    expect(pace).toMatchObject({ count: 3, wins: 2 })

    // An hour later, none of them are recent any more — the pace tile shows a desk that
    // has stopped trading, which is exactly what it is for.
    expect(sessionPace(99000 + 3600000).perMinute).toBe(0)
    expect(sessionPace(99000 + 3600000).count).toBe(3)
  })
})

describe('winRate', () => {
  it('scores the day honestly, including a day with nothing closed', () => {
    expect(winRate([{ amount: 5 }, { amount: -2 }, { amount: 3 }, { amount: -1 }])).toBe(0.5)
    expect(winRate([{ amount: 5 }])).toBe(1)

    // Nothing closed is not a zero percent win rate, but zero is the only number that
    // can be shown — the count next to it is what makes it readable.
    expect(winRate([])).toBe(0)
    expect(winRate(null)).toBe(0)
  })
})

describe('readHud', () => {
  it('derives every tile from what the desk already recorded', () => {
    setValue('market.bid', 100)
    setValue('market.ask', 100.1)
    tick()

    stampLatency('a', 'submit', 0)
    stampLatency('a', 'ack', 80)
    appendRealization({ amount: 5, ts: 99000 })
    ingestFill({ venue: 'okx', instrument: 'BTC-USDT', side: 'buy', qty: 2, px: 100 })

    const hud = readHud({ now: 100000 })

    expect(hud.latencyMs).toBe(80)
    expect(hud.latencyGrade).toBe('good')
    expect(hud.spreadBps).toBeCloseTo(9.995, 2)
    expect(hud.tradesPerMin).toBe(1)
    expect(hud.winRate).toBe(1)
    expect(hud.exposure).toBe(200)

    // Smoothed across reads: the second sample moves the value part of the way, not all.
    stampLatency('b', 'submit', 0)
    stampLatency('b', 'ack', 480)
    const second = readHud({ now: 100000 })
    expect(second.latencyMs).toBeGreaterThan(80)
    expect(second.latencyMs).toBeLessThan(280)
  })
})

describe('refreshHud', () => {
  it('publishes fixed-width labels, which is what stops the tile row reflowing', () => {
    setValue('market.bid', 100)
    setValue('market.ask', 100.1)
    tick()
    stampLatency('a', 'submit', 0)
    stampLatency('a', 'ack', 84)

    refreshHud({ now: 100000 })
    tick()

    expect(appState.ui.hud).toMatchObject({
      latencyLabel: '84ms',
      latencyGrade: 'good',
      winRateLabel: '0%',
    })
    expect(appState.ui.hud.spreadLabel).toBe('10.0bp')
    expect(appState.ui.hud.exposureLabel).toBe('0.0')
  })
})

describe('resetHud', () => {
  it('forgets the smoothing, so a new session starts from its first sample', () => {
    stampLatency('a', 'submit', 0)
    stampLatency('a', 'ack', 80)
    readHud({ now: 1000 })

    expect(resetHud()).toBe(true)

    resetLatency()
    stampLatency('b', 'submit', 0)
    stampLatency('b', 'ack', 400)
    // Seeded by the new first sample rather than dragged up from the old session.
    expect(readHud({ now: 1000 }).latencyMs).toBe(400)
  })
})
