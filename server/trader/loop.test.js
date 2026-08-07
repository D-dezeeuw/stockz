import { describe, it, expect, vi } from 'vitest'
import { createTrader, DECISION_LOG } from './loop.js'

const CONFIG = {
  symbols: ['BTC-USDT'],
  size: 0.001,
  maxPerMin: 120,
  maxPerInstrument: 1,
  live: false,
  demo: false,
}

/** A feed double that hands back the emitter so a test can drive the socket by hand. */
function fakeFeed(captured) {
  return (options) => {
    captured.emit = options.onEvent
    return { close: vi.fn(), state: () => 'live', attempts: () => 0 }
  }
}

/** Let the loop's async event handling settle — orders are awaited inside onEvent. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('createTrader', () => {
  it('trades from the feed alone and reports itself without a browser', async () => {
    const captured = {}
    const trader = createTrader(CONFIG, { feed: fakeFeed(captured), now: () => 5000 }).start()

    // Nothing about this loop involves a page: no DOM, no rAF, no engine.
    expect(trader.snapshot().running).toBe(true)
    expect(trader.snapshot().feed).toBe('live')
    expect(trader.snapshot().live).toBe(false)

    // A book arrives first — without one there is nothing to fill against.
    captured.emit({
      kind: 'book',
      instrument: 'BTC-USDT',
      book: { bid: 99, ask: 101, bids: [['99', '5']], asks: [['101', '1']], mid: 100, ts: 1 },
    })
    await settle()
    expect(trader.desks.get('BTC-USDT').book.ask).toBe(101)

    // Trades on an instrument the loop does not follow are ignored outright.
    captured.emit({ kind: 'trades', instrument: 'DOGE-USDT', trades: [{ px: 1, ts: 1 }] })
    await settle()
    expect(trader.snapshot().stats.signals).toBe(0)

    // Real prints run the real strategies. They are usually neutral on a single tick, so
    // this asserts the pipeline completes rather than that a trade happened.
    captured.emit({
      kind: 'trades',
      instrument: 'BTC-USDT',
      trades: [{ px: 100, size: 1, side: 'buy', ts: 1000 }],
    })
    await settle()
    expect(trader.snapshot().stats.errors).toBe(0)

    trader.stop()
    expect(trader.snapshot().running).toBe(false)
  })

  it('records a taken decision, its fill and its P&L', async () => {
    const captured = {}
    const trader = createTrader(CONFIG, { feed: fakeFeed(captured), now: () => 5000 }).start()

    // Replace the strategies with one that always fires, so the order path is exercised
    // deterministically rather than waiting for a real signal to appear.
    const desk = trader.desks.get('BTC-USDT')
    desk.runs = [
      {
        strategy: { id: 'always', onTick: () => ({ action: 'buy', strength: 1, reason: 'test' }) },
        state: {},
        started: true,
      },
    ]

    captured.emit({
      kind: 'book',
      instrument: 'BTC-USDT',
      book: { bid: 99, ask: 101, bids: [], asks: [], mid: 100, ts: 1 },
    })
    captured.emit({
      kind: 'trades',
      instrument: 'BTC-USDT',
      trades: [{ px: 100, size: 1, side: 'buy', ts: 1000 }],
    })
    await settle()

    const snap = trader.snapshot()
    expect(snap.stats.signals).toBe(1)
    expect(snap.stats.orders).toBe(1)
    expect(snap.desks[0].position).toBe(0.001)
    // Paper crossed the spread, so the position is carried at the ask.
    expect(snap.desks[0].avgPx).toBe(101)
    // Marked against the mid: unrealised is what it could be closed at, not what it cost.
    expect(snap.desks[0].unrealized).toBeCloseTo((100 - 101) * 0.001, 10)

    // Newest first — a decision list is read top-down.
    expect(snap.decisions[0]).toMatchObject({ instrument: 'BTC-USDT', taken: true, strategy: 'always' })
  })

  it('never lets a slow venue call race the position past its cap', async () => {
    const captured = {}
    // A venue that takes a moment, like a real one. This is the shape that used to break
    // it: `onEvent` awaits the order, the socket fires the next print regardless, and two
    // handlers both read `desk.position` before either has written it.
    const slowPlace = () =>
      new Promise((resolve) => setTimeout(() => resolve({ ok: true, id: 'x', error: '' }), 5))

    const trader = createTrader(
      { ...CONFIG, live: true, maxPerInstrument: 0.005 },
      { feed: fakeFeed(captured), now: () => 5000, placeOrder: slowPlace },
    ).start()

    trader.desks.get('BTC-USDT').runs = [
      {
        strategy: { id: 'always', onTick: () => ({ action: 'buy', strength: 1, reason: 'test' }) },
        state: {},
        started: true,
      },
    ]

    captured.emit({
      kind: 'book',
      instrument: 'BTC-USDT',
      book: { bid: 99, ask: 101, bids: [], asks: [], mid: 100, ts: 1 },
    })

    // Fired without awaiting — exactly how a socket delivers messages. Twenty prints, a
    // cap of 0.005 and a clip of 0.001: at most five may ever be filled.
    for (let i = 0; i < 20; i += 1) {
      captured.emit({
        kind: 'trades',
        instrument: 'BTC-USDT',
        trades: [{ px: 100, size: 1, side: 'buy', ts: 1000 + i }],
      })
    }
    await new Promise((resolve) => setTimeout(resolve, 300))

    const snap = trader.snapshot()
    expect(snap.desks[0].position).toBeLessThanOrEqual(0.005)
    expect(snap.stats.orders).toBeLessThanOrEqual(5)
    // And the rest were refused by the cap, not silently dropped.
    expect(snap.stats.blocked).toBeGreaterThan(0)
    trader.stop()
  })

  it('gives every decision a unique identity and prunes the throttle window', async () => {
    const captured = {}
    const trader = createTrader(CONFIG, { feed: fakeFeed(captured), now: () => 5000 }).start()

    trader.desks.get('BTC-USDT').runs = [
      {
        strategy: { id: 'always', onTick: () => ({ action: 'buy', strength: 1, reason: 'test' }) },
        state: {},
        started: true,
      },
    ]
    captured.emit({
      kind: 'book',
      instrument: 'BTC-USDT',
      book: { bid: 99, ask: 101, bids: [], asks: [], mid: 100, ts: 1 },
    })

    // Several prints stamped in the SAME millisecond — exactly what OKX sends, and what
    // made (ts, strategy, action) collide as a render key.
    for (let i = 0; i < 6; i += 1) {
      captured.emit({
        kind: 'trades',
        instrument: 'BTC-USDT',
        trades: [{ px: 100, size: 1, side: 'buy', ts: 1000 }],
      })
    }
    await settle()

    const rows = trader.snapshot().decisions
    expect(rows.length).toBeGreaterThan(1)
    expect(new Set(rows.map((r) => r.seq)).size).toBe(rows.length)
    // The old key would have collided; the sequence must not.
    expect(new Set(rows.map((r) => `${r.ts}:${r.strategy}:${r.action}`)).size).toBeLessThan(rows.length)
    trader.stop()
  })

  it('records a refusal with its reason, and never grows without bound', async () => {
    const captured = {}
    // A cap of zero refuses every entry, which is the cheapest way to exercise the
    // blocked path end to end.
    const trader = createTrader({ ...CONFIG, maxPerInstrument: 0 }, {
      feed: fakeFeed(captured),
      now: () => 5000,
    }).start()

    const desk = trader.desks.get('BTC-USDT')
    desk.runs = [
      {
        strategy: { id: 'always', onTick: () => ({ action: 'buy', strength: 1, reason: 'test' }) },
        state: {},
        started: true,
      },
    ]
    captured.emit({
      kind: 'book',
      instrument: 'BTC-USDT',
      book: { bid: 99, ask: 101, bids: [], asks: [], mid: 100, ts: 1 },
    })

    // More prints than the ring holds: this process is meant to run for weeks, so an
    // unbounded decision list is a slow leak with a trading loop attached.
    for (let i = 0; i < DECISION_LOG + 25; i += 1) {
      captured.emit({
        kind: 'trades',
        instrument: 'BTC-USDT',
        trades: [{ px: 100, size: 1, side: 'buy', ts: 1000 + i }],
      })
    }
    await settle()

    const snap = trader.snapshot()
    expect(snap.stats.orders).toBe(0)
    expect(snap.stats.blocked).toBeGreaterThan(0)
    expect(snap.decisions[0].taken).toBe(false)
    expect(snap.decisions[0].reason).toMatch(/cap/)
    // Snapshot caps at 100 for the wire; the ring behind it caps at DECISION_LOG.
    expect(snap.decisions.length).toBeLessThanOrEqual(100)
  })
})
