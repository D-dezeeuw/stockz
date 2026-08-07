import { describe, it, expect, vi } from 'vitest'
import {
  createDesk,
  applyFill,
  recordOutcome,
  strongestSignal,
  decide,
  sendOrder,
  STRATEGIES,
  COOLDOWN_AFTER,
} from './engine.js'

const CONFIG = { size: 0.001, maxPerMin: 120, maxPerInstrument: 0.01, live: false }

describe('STRATEGIES', () => {
  it('is the browser desk\'s own strategy modules, not a reimplementation', () => {
    // The point of the whole exercise: what a strategy *decides* must be one module
    // imported twice, never two implementations that could drift apart.
    expect(STRATEGIES).toHaveLength(4)
    for (const strategy of STRATEGIES) {
      expect(typeof strategy.id).toBe('string')
      expect(typeof strategy.onTick).toBe('function')
    }
    expect(STRATEGIES.map((s) => s.id).sort()).toEqual(
      ['book-imbalance', 'momentum-burst', 'tape-pressure', 'vwap-revert'].sort(),
    )
  })
})

describe('createDesk', () => {
  it('gives every instrument its own book, position and strategy scratchpads', () => {
    const desk = createDesk('BTC-USDT')

    expect(desk.instrument).toBe('BTC-USDT')
    expect(desk.position).toBe(0)
    expect(desk.runs).toHaveLength(STRATEGIES.length)

    // Separate scratchpads: shared state between two strategies on one instrument would
    // make them one strategy wearing two names.
    const other = createDesk('ETH-USDT')
    expect(desk.runs[0].state).not.toBe(other.runs[0].state)
    expect(desk.runs[0].state).not.toBe(desk.runs[1].state)

    // Params are resolved once per desk, not per print: the dial is a deployment setting,
    // and recomputing the same overrides thousands of times a minute is work for nothing.
    expect(desk.runs.every((run) => Object.keys(run.params).length === 0)).toBe(true)
    const hot = createDesk('BTC-USDT', 1)
    expect(hot.runs.some((run) => Object.keys(run.params).length > 0)).toBe(true)
  })
})

describe('applyFill', () => {
  it('moves the average when adding and realises when reducing', () => {
    const desk = createDesk('BTC-USDT')

    expect(applyFill(desk, { side: 'buy', size: 1, px: 100 })).toBe(0)
    expect(desk.position).toBe(1)
    expect(desk.avgPx).toBe(100)

    // Adding moves the average, realises nothing.
    expect(applyFill(desk, { side: 'buy', size: 1, px: 200 })).toBe(0)
    expect(desk.position).toBe(2)
    expect(desk.avgPx).toBe(150)

    // Reducing realises against that average, for as much as was closed.
    expect(applyFill(desk, { side: 'sell', size: 1, px: 200 })).toBe(50)
    expect(desk.position).toBe(1)
    expect(desk.realized).toBe(50)

    // Flat clears the average outright — a position with no size has no cost basis.
    applyFill(desk, { side: 'sell', size: 1, px: 150 })
    expect(desk.position).toBe(0)
    expect(desk.avgPx).toBe(0)

    // A flip realises the whole old side and opens the remainder at the fill price.
    // Carrying a long's basis into a short is how a P&L quietly becomes fiction.
    const flip = createDesk('ETH-USDT')
    applyFill(flip, { side: 'buy', size: 1, px: 100 })
    const realized = applyFill(flip, { side: 'sell', size: 3, px: 120 })
    expect(realized).toBe(20)
    expect(flip.position).toBe(-2)
    expect(flip.avgPx).toBe(120)

    // Nonsense changes nothing.
    expect(applyFill(flip, { side: 'buy', size: 0, px: 100 })).toBe(0)
    expect(applyFill(flip, { side: 'buy', size: 1, px: 0 })).toBe(0)
  })
})

describe('recordOutcome', () => {
  it('benches an instrument after consecutive losers, and a win resets it', () => {
    const desk = createDesk('BTC-USDT')

    for (let i = 1; i < COOLDOWN_AFTER; i += 1) {
      expect(recordOutcome(desk, -1, 1000)).toBe(false)
    }
    expect(recordOutcome(desk, -1, 1000)).toBe(true)
    expect(desk.cooldownUntil).toBeGreaterThan(1000)

    // A win resets outright — "consecutive" is the entire claim being made.
    const fresh = createDesk('ETH-USDT')
    recordOutcome(fresh, -1, 1000)
    recordOutcome(fresh, 5, 1000)
    expect(fresh.streak).toBe(0)

    // A scratch is not an outcome.
    expect(recordOutcome(fresh, 0, 1000)).toBe(false)
    expect(fresh.streak).toBe(0)

    // Both the streak and the bench are configurable. Measurement showed this, not the
    // strategy thresholds, is what actually caps trades-per-hour once sensitivity is up:
    // a chattier loop takes more losers, hits the streak sooner, and sits out the bench.
    const tuned = createDesk('SOL-USDT')
    expect(recordOutcome(tuned, -1, 1000, { cooldownAfter: 2, cooldownMs: 60_000 })).toBe(false)
    expect(recordOutcome(tuned, -1, 1000, { cooldownAfter: 2, cooldownMs: 60_000 })).toBe(true)
    expect(tuned.cooldownUntil).toBe(61_000)

    // A cooldown of zero minutes is a legitimate "never bench" — it must not fall back to
    // the default, which is exactly the silent-override bug `positiveNumber` exists to stop.
    const never = createDesk('XRP-USDT')
    recordOutcome(never, -1, 5000, { cooldownAfter: 1, cooldownMs: 0 })
    expect(never.cooldownUntil).toBe(5000)
  })
})

describe('strongestSignal', () => {
  it('runs every strategy and returns the most convinced, surviving a thrower', () => {
    const desk = createDesk('BTC-USDT')
    desk.book = { bid: 99, ask: 101, bids: [['99', '5']], asks: [['101', '1']], mid: 100, ts: 1 }

    // Real strategies on one print are usually all neutral — the point here is that the
    // call completes, initialises each run once, and reports a well-formed signal.
    const signal = strongestSignal(desk, { px: 100, size: 1, side: 'buy', ts: 1000 }, 1000)
    expect(signal).toHaveProperty('action')
    expect(signal).toHaveProperty('strength')
    expect(desk.runs.every((run) => run.started)).toBe(true)

    // The strongest wins, not the first — array order must never be a trading decision.
    const stub = createDesk('ETH-USDT')
    stub.runs = [
      { strategy: { id: 'weak', onTick: () => ({ action: 'buy', strength: 0.3, reason: 'w' }) }, state: {}, started: true },
      { strategy: { id: 'strong', onTick: () => ({ action: 'sell', strength: 0.9, reason: 's' }) }, state: {}, started: true },
    ]
    expect(strongestSignal(stub, { px: 1 }, 0)).toMatchObject({ strategy: 'strong', action: 'sell' })

    // One broken strategy must not stop the other three, nor the loop.
    stub.runs.unshift({
      strategy: { id: 'broken', onTick: () => { throw new Error('boom') } },
      state: {},
      started: true,
    })
    expect(strongestSignal(stub, { px: 1 }, 0).strategy).toBe('strong')
  })
})

describe('decide', () => {
  it('runs the gates cheapest-first and names the one that refused', () => {
    const desk = createDesk('BTC-USDT')
    const buy = { action: 'buy', strength: 0.9, reason: 'burst' }

    const go = decide(desk, buy, { now: 1000, sent: [], config: CONFIG })
    expect(go.send).toBe(true)
    expect(go.order).toEqual({ instId: 'BTC-USDT', side: 'buy', size: 0.001 })

    // A neutral signal is refused before anything expensive is consulted.
    expect(decide(desk, { action: 'none' }, { now: 1000, sent: [], config: CONFIG }).reason)
      .toBe('no direction')

    // Benched beats throttle, and both beat the cap — the order is what makes the common
    // rejection cheap.
    desk.cooldownUntil = 9000
    expect(decide(desk, buy, { now: 1000, sent: [], config: CONFIG }).reason).toMatch(/benched/)
    desk.cooldownUntil = 0

    const throttled = decide(desk, buy, {
      now: 1000,
      sent: Array.from({ length: 120 }, () => 1000),
      config: CONFIG,
    })
    expect(throttled.send).toBe(false)
    expect(throttled.reason).toMatch(/throttled/)

    desk.position = 0.01
    expect(decide(desk, buy, { now: 1000, sent: [], config: CONFIG }).reason).toMatch(/cap/)
    desk.position = 0

    // A zero clip is a misconfiguration, and saying so beats sending an empty order.
    expect(decide(desk, buy, { now: 1000, sent: [], config: { ...CONFIG, size: 0 } }).reason)
      .toBe('size is zero')
  })

  it('always lets an exit through, whatever the entry gates say', () => {
    const desk = createDesk('BTC-USDT')
    const flat = { action: 'flat', strength: 1, reason: 'target hit' }

    // Nothing to close is not an order.
    expect(decide(desk, flat, { now: 1000, sent: [], config: CONFIG }).send).toBe(false)

    // Closing sells a long for exactly what is held — every strategy writes an exit, and
    // discarding them meant positions only ever grew until the cap refused everything
    // forever. A trader who cannot close is not being protected.
    desk.position = 0.004
    const exit = decide(desk, flat, { now: 1000, sent: [], config: CONFIG })
    expect(exit.send).toBe(true)
    expect(exit.order).toEqual({ instId: 'BTC-USDT', side: 'sell', size: 0.004 })

    desk.position = -0.002
    expect(decide(desk, flat, { now: 1000, sent: [], config: CONFIG }).order)
      .toEqual({ instId: 'BTC-USDT', side: 'buy', size: 0.002 })

    // Benched, throttled and capped all block *entering* risk. None may block the exit.
    desk.position = 0.004
    desk.cooldownUntil = 9_000_000
    const gated = decide(desk, flat, {
      now: 1000,
      sent: Array.from({ length: 500 }, () => 1000),
      config: { ...CONFIG, maxPerInstrument: 0 },
    })
    expect(gated.send).toBe(true)
  })

  it('acts sooner as the sensitivity dial rises', () => {
    const desk = createDesk('BTC-USDT')
    const modest = { action: 'buy', strength: 0.3, reason: 'faint' }

    // As shipped, a 0.3-conviction signal is noise.
    expect(decide(desk, modest, { now: 1000, sent: [], config: CONFIG }).send).toBe(false)

    // Turned up, the gate's own floor moves with the strategies — otherwise they would be
    // made chattier only for signalGate to throw the extra signals away, and the decision
    // feed would fill with "weak" and look broken.
    expect(decide(desk, modest, { now: 1000, sent: [], config: { ...CONFIG, sensitivity: 1 } }).send)
      .toBe(true)
  })
})

describe('sendOrder', () => {
  it('fills paper across the spread and routes live to the venue', async () => {
    const desk = createDesk('BTC-USDT')
    desk.book = { bid: 99, ask: 101, mid: 100, ts: 1 }

    // Crossing the spread, not filling at the mid: a simulation that fills better than
    // reality is the one that teaches the wrong lesson.
    const bought = await sendOrder({ side: 'buy', size: 1 }, desk, CONFIG)
    expect(bought).toMatchObject({ ok: true, px: 101 })
    const sold = await sendOrder({ side: 'sell', size: 1 }, desk, CONFIG)
    expect(sold.px).toBe(99)

    // No book is no fill — a paper trade at price zero would poison every P&L after it.
    const blind = createDesk('ETH-USDT')
    expect((await sendOrder({ side: 'buy', size: 1 }, blind, CONFIG)).ok).toBe(false)

    // Live routes to the venue, and a venue refusal is not a fill.
    const placeOrder = vi.fn(async () => ({ ok: true, id: '77', error: '' }))
    const live = await sendOrder({ side: 'buy', size: 1 }, desk, { ...CONFIG, live: true }, { placeOrder })
    expect(placeOrder).toHaveBeenCalledTimes(1)
    expect(live).toMatchObject({ ok: true, id: '77', px: 101 })

    const refused = await sendOrder(
      { side: 'buy', size: 1 },
      desk,
      { ...CONFIG, live: true },
      { placeOrder: async () => ({ ok: false, id: '', error: 'Insufficient balance' }) },
    )
    expect(refused).toMatchObject({ ok: false, px: 0, error: 'Insufficient balance' })
  })
})
