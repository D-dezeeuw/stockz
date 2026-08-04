import { describe, it, expect, beforeEach } from 'vitest'
import {
  getPosSize,
  isReducing,
  isExit,
  capFor,
  positionCheck,
  onRealizedFill,
  streakCheck,
  pauseTrading,
  clearPause,
  pauseCheck,
  recordBlock,
  pauseState,
  resetPause,
} from './position.js'
import { refreshThresholds, TRIP } from './core.js'
import { orderChecks } from './index.js'
import { appState, tick, resetState } from '../app/engine.js'

const POSITIONS = [
  { instrument: 'okx:BTC-USDT', size: 0.4 },
  { instrument: 'okx:BTC-USDT', size: 0.2 },
  { instrument: 'okx:ETH-USDT', size: -3 },
]

beforeEach(() => {
  resetPause()
  resetState()
  refreshThresholds({ maxPosition: 1 })
})

describe('getPosSize', () => {
  it('matches on the tail, because the ticket and the venue spell it differently', () => {
    expect(getPosSize('BTC-USDT', POSITIONS)).toBeCloseTo(0.6, 8)
    expect(getPosSize('okx:BTC-USDT', POSITIONS)).toBeCloseTo(0.6, 8)

    // Signed, not absolute: the direction is what makes a reduce-only exemption possible.
    expect(getPosSize('ETH-USDT', POSITIONS)).toBe(-3)

    expect(getPosSize('SOL-USDT', POSITIONS)).toBe(0)
    expect(getPosSize('', POSITIONS)).toBe(0)
  })
})

describe('isReducing', () => {
  it('knows an exit from an add, which is what lets the cap have an exemption', () => {
    expect(isReducing({ side: 'sell' }, 0.6)).toBe(true)
    expect(isReducing({ side: 'buy' }, 0.6)).toBe(false)

    expect(isReducing({ side: 'buy' }, -3)).toBe(true)
    expect(isReducing({ side: 'sell' }, -3)).toBe(false)

    // Flat: nothing to reduce.
    expect(isReducing({ side: 'sell' }, 0)).toBe(false)
  })
})

describe('isExit', () => {
  it('trusts the reduce-only flag on its own, and falls back to the sign', () => {
    const sources = { positions: POSITIONS }

    // The flag is enough: a venue honouring reduce-only cannot turn the order into an
    // opening trade whatever the book does between here and the fill.
    expect(isExit({ instrument: 'SOL-USDT', side: 'buy', reduceOnly: true }, sources)).toBe(true)

    expect(isExit({ instrument: 'BTC-USDT', side: 'sell' }, sources)).toBe(true)
    expect(isExit({ instrument: 'BTC-USDT', side: 'buy' }, sources)).toBe(false)
    expect(isExit({ instrument: 'SOL-USDT', side: 'sell' }, sources)).toBe(false)
  })
})

describe('capFor', () => {
  it('takes the per-instrument override over the desk-wide cap', () => {
    expect(capFor('BTC-USDT', {})).toBe(1)
    expect(capFor('okx:BTC-USDT', { botCapOverrides: { 'BTC-USDT': 0.25 } })).toBe(0.25)
    // Zero is a real answer: "never add to this one" is a thing to be able to say.
    expect(capFor('BTC-USDT', { botCapOverrides: { 'BTC-USDT': 0 } })).toBe(0)
  })
})

describe('positionCheck', () => {
  it('always lets an exit through, whatever the cap says', () => {
    const sources = { positions: POSITIONS }

    expect(positionCheck({ instrument: 'BTC-USDT', side: 'buy', size: 0.2 }, sources).code).toBe(
      TRIP.NONE,
    )

    const blocked = positionCheck({ instrument: 'BTC-USDT', side: 'buy', size: 0.6 }, sources)
    expect(blocked.code).toBe(TRIP.POSITION)
    expect(blocked.reason).toMatch(/position cap 1 — holding 0.6/)

    // An exit is never the thing a position limit was written to stop.
    expect(positionCheck({ instrument: 'BTC-USDT', side: 'sell', size: 99 }, sources).code).toBe(
      TRIP.NONE,
    )
    expect(positionCheck({ instrument: 'ETH-USDT', side: 'buy', size: 99 }, sources).code).toBe(
      TRIP.NONE,
    )
  })
})

describe('onRealizedFill', () => {
  it('treats zero as disabling, not as "pause immediately"', () => {
    const settings = { maxConsecLosses: 3 }

    expect(onRealizedFill(-5, settings).streak).toBe(1)
    expect(onRealizedFill(-5, settings).streak).toBe(2)
    expect(onRealizedFill(4, settings).streak).toBe(0)

    onRealizedFill(-1, settings)
    onRealizedFill(-1, settings)
    expect(onRealizedFill(-1, settings)).toMatchObject({ streak: 3 })
    expect(pauseState().paused).toBe(true)

    // A limit of zero meaning "pause immediately" would be unusable for anyone who left
    // the field blank.
    resetPause()
    onRealizedFill(-1, { maxConsecLosses: 0 })
    expect(pauseState().paused).toBe(false)
    expect(onRealizedFill(0, settings).streak).toBe(1)
  })
})

describe('streakCheck', () => {
  it('binds on the trader’s own number, and not at all when they set none', () => {
    onRealizedFill(-1, { maxConsecLosses: 99 })
    onRealizedFill(-1, { maxConsecLosses: 99 })

    expect(streakCheck({ maxConsecLosses: 2 }).code).toBe(TRIP.LOSS_STREAK)
    expect(streakCheck({ maxConsecLosses: 5 }).code).toBe(TRIP.NONE)
    expect(streakCheck({ maxConsecLosses: 0 }).code).toBe(TRIP.NONE)
    expect(streakCheck({}).code).toBe(TRIP.NONE)
  })
})

describe('pauseTrading', () => {
  it('publishes the pause and the streak that caused it', () => {
    onRealizedFill(-1, { maxConsecLosses: 99 })

    expect(pauseTrading()).toBe(true)
    tick()
    expect(appState.breaker.paused).toBe(true)
    expect(appState.breaker.lossStreak).toBe(1)
  })
})

describe('clearPause', () => {
  it('clears the streak with the pause, so the next loss starts from one', () => {
    onRealizedFill(-1, { maxConsecLosses: 1 })
    expect(pauseState().paused).toBe(true)

    expect(clearPause()).toBe(true)
    tick()
    expect(pauseState()).toEqual({ streak: 0, paused: false })
    expect(clearPause()).toBe(false)
  })
})

describe('pauseCheck', () => {
  it('stops entries and never an exit, or the trader is trapped by their own net', () => {
    const sources = { positions: POSITIONS }
    expect(pauseCheck({ instrument: 'BTC-USDT', side: 'buy' }, sources).code).toBe(TRIP.NONE)

    onRealizedFill(-1, { maxConsecLosses: 1 })

    expect(pauseCheck({ instrument: 'BTC-USDT', side: 'buy' }, sources).code).toBe(TRIP.LOSS_STREAK)
    // Trading through a bad run turns a bad hour into a bad week — but being unable to
    // close is worse than either.
    expect(pauseCheck({ instrument: 'BTC-USDT', side: 'sell' }, sources).code).toBe(TRIP.NONE)
  })
})

describe('recordBlock', () => {
  it('counts the saves, which is what says whether the cap is doing anything', () => {
    recordBlock('position cap 1', 1000)
    tick()
    recordBlock('position cap 1', 2000)
    tick()

    expect(appState.breaker.blocked).toBe(2)
    expect(appState.breaker.lastBlock).toMatchObject({ reason: 'position cap 1', at: 2000 })
  })
})

describe('pauseState', () => {
  it('reads the streak and the pause back together', () => {
    onRealizedFill(-1, { maxConsecLosses: 99 })
    expect(pauseState()).toEqual({ streak: 1, paused: false })
  })
})

describe('resetPause', () => {
  it('forgets both, so a fresh session starts clean', () => {
    onRealizedFill(-1, { maxConsecLosses: 1 })

    expect(resetPause()).toBe(true)
    expect(pauseState()).toEqual({ streak: 0, paused: false })
  })
})

describe('orderChecks', () => {
  it('blocks this order and leaves the desk running, unlike a trip', () => {
    // Nothing held: the caps read from the live store, which is empty here.
    expect(orderChecks({ instrument: 'BTC-USDT', side: 'buy', size: 0.5 }, { now: 1000 }).code).toBe(
      TRIP.NONE,
    )

    onRealizedFill(-1, { maxConsecLosses: 1 })
    const paused = orderChecks({ instrument: 'BTC-USDT', side: 'buy', size: 0.1 }, { now: 2000 })
    tick()

    expect(paused.code).toBe(TRIP.LOSS_STREAK)
    // A cap breach is a typo far more often than an emergency; flattening the book over one
    // would be a cure worse than the mistake.
    expect(appState.breaker.blocked).toBe(1)
    expect(appState.breaker.lastBlock.at).toBe(2000)

    // With nothing held, a sell is a new short rather than an exit — and a pause is
    // exactly about not opening anything new, whichever way it points.
    expect(orderChecks({ instrument: 'BTC-USDT', side: 'sell', size: 0.1 }, {}).code).toBe(
      TRIP.LOSS_STREAK,
    )
  })
})
