import { describe, it, expect, vi } from 'vitest'
import {
  decisionBreakdown,
  toTraderView,
  traderSummary,
  pollTrader,
  startTraderMirror,
  TRADER_ENDPOINT,
  TRADER_OFF,
} from './mirror.js'
import { appState, tick, resetState } from '../app/engine.js'

describe('toTraderView', () => {
  it('defaults every field, so an older server never renders as a broken binding', () => {
    expect(toTraderView(null)).toEqual({ ...TRADER_OFF })
    expect(toTraderView('nonsense')).toEqual({ ...TRADER_OFF })

    // A server that predates a field must render as "nothing yet", never as undefined
    // leaking into the template.
    const partial = toTraderView({ running: true })
    expect(partial.running).toBe(true)
    expect(partial.stats).toEqual({ signals: 0, orders: 0, blocked: 0, errors: 0 })
    expect(partial.desks).toEqual([])
    expect(partial.decisions).toEqual([])

    const full = toTraderView({
      running: true,
      live: true,
      feed: 'live',
      uptimeMs: 5000,
      symbols: ['BTC-USDT'],
      stats: { signals: 10, orders: 2, blocked: 8, errors: 0 },
      decisions: [{ seq: 7, ts: 1_700_000_000_000, instrument: 'BTC-USDT', strategy: 'momentum-burst', action: 'buy', taken: true, reason: 'burst', px: 60000 }],
      desks: [{ instrument: 'BTC-USDT', position: 0.001, avgPx: 60000, realized: 1.5, unrealized: -0.2, benchedFor: 0 }],
    })
    expect(full.stats.signals).toBe(10)
    expect(full.desks[0]).toMatchObject({ instrument: 'BTC-USDT', position: 0.001, benched: false })
    // Rendered clock-time, because a decision list is scanned for "when", not parsed.
    expect(full.decisions[0].time).toMatch(/^\d{2}:\d{2}:\d{2}$/)
    // The server's sequence is the row identity. A timestamp is not one — OKX stamps
    // several prints in the same millisecond, which is what made the render key collide.
    expect(full.decisions[0].seq).toBe(7)
    const noSeq = toTraderView({ decisions: [{ ts: 1 }, { ts: 1 }] })
    expect(noSeq.decisions[0].seq).not.toBe(noSeq.decisions[1].seq)

    expect(toTraderView({ desks: [{ benchedFor: 5000 }] }).desks[0].benched).toBe(true)
  })
})

describe('decisionBreakdown', () => {
  it('drops the non-event that would otherwise be the biggest slice', () => {
    // `noop` is a flat signal with nothing to close. It is the most frequent line the loop
    // produces and it is not a trade passed on — left in, it is the largest wedge on the
    // chart and means nothing at all.
    const rows = decisionBreakdown({ entry: 3, exit: 2, benched: 40, weak: 5, noop: 900 })
    expect(rows.some((r) => r.key === 'noop')).toBe(false)
    expect(rows.reduce((sum, r) => sum + r.count, 0)).toBe(50)

    // Taken first, so "did it trade" is answered before "what stopped it".
    expect(rows[0].key).toBe('entry')
    expect(rows[0].taken).toBe(true)
    expect(rows.find((r) => r.key === 'benched').taken).toBe(false)

    // Shares sum to one and the percentages are pre-rendered — a percentage is read, not
    // computed in a template.
    expect(rows.reduce((sum, r) => sum + r.share, 0)).toBeCloseTo(1, 10)
    expect(rows.find((r) => r.key === 'benched').pct).toBe('80%')

    // Categories that never happened are absent rather than zero rows cluttering a legend.
    expect(rows.some((r) => r.key === 'cap')).toBe(false)

    // Nothing at all is an empty list, which the block renders as "nothing yet".
    expect(decisionBreakdown({})).toEqual([])
    expect(decisionBreakdown({ noop: 500 })).toEqual([])
    expect(decisionBreakdown(undefined)).toEqual([])
  })
})

describe('traderSummary', () => {
  it('says what the loop is doing in one line', () => {
    expect(traderSummary(TRADER_OFF)).toBe('server trader: off')
    expect(traderSummary(undefined)).toBe('server trader: off')

    const paper = traderSummary({ running: true, live: false, stats: { orders: 3, signals: 40, blocked: 37 } })
    expect(paper).toBe('server paper · 3 sent · 40 signals · 37 blocked')

    // LIVE is upper-case on purpose: it is the one word that means real money.
    expect(traderSummary({ running: true, live: true, stats: { orders: 1, signals: 2, blocked: 1 } }))
      .toMatch(/^server LIVE/)
  })
})

describe('pollTrader', () => {
  it('publishes what the server said, and an honest "off" when it cannot ask', async () => {
    resetState()

    const calls = []
    await pollTrader({
      fetch: async (url) => {
        calls.push(url)
        return { json: async () => ({ running: true, live: false, feed: 'live', symbols: ['BTC-USDT'], stats: { orders: 2 } }) }
      },
    })
    tick()

    expect(calls[0]).toBe(TRADER_ENDPOINT)
    expect(appState.trader.view.running).toBe(true)
    expect(appState.trader.summary).toMatch(/server paper/)

    // A 401 is its own answer, not a failed request: the session died (usually a backend
    // restart with an ephemeral signing secret) and the loop is almost certainly still
    // trading on the host. Reporting "off" would send somebody to the server logs to look
    // for a loop that never stopped.
    await pollTrader({ fetch: async () => ({ status: 401, json: async () => ({ msg: 'not signed in' }) }) })
    tick()
    expect(appState.trader.view.signedOut).toBe(true)
    expect(appState.trader.view.running).toBe(false)
    expect(appState.trader.summary).toMatch(/signed out/i)

    // An unreachable server is "off", not an error to dismiss — the desk is a viewer, and
    // a failed poll is fixed by the next one.
    await pollTrader({
      fetch: async () => {
        throw new Error('offline')
      },
    })
    tick()
    expect(appState.trader.view.running).toBe(false)
    expect(appState.trader.view.signedOut).toBe(false)
    expect(appState.trader.summary).toBe('server trader: off')
  })
})

describe('startTraderMirror', () => {
  it('asks immediately and then on the interval, and stops cleanly', () => {
    const poll = vi.fn(async () => ({}))
    const scheduled = []
    const stop = startTraderMirror({
      poll,
      everyMs: 2000,
      timer: {
        setInterval: (fn, ms) => {
          scheduled.push([fn, ms])
          return 7
        },
        clearInterval: (h) => scheduled.push(['cleared', h]),
      },
    })

    // Immediately, not after the first interval: a dashboard showing "off" for two seconds
    // after every load has people reaching for the logs.
    expect(poll).toHaveBeenCalledTimes(1)
    expect(scheduled[0][1]).toBe(2000)

    scheduled[0][0]()
    expect(poll).toHaveBeenCalledTimes(2)

    stop()
    expect(scheduled.at(-1)).toEqual(['cleared', 7])
  })
})
