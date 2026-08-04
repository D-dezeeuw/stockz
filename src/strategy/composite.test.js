import { describe, it, expect, beforeEach } from 'vitest'
import {
  normalizeWeights,
  composeSignals,
  voteThreshold,
  compositeTtl,
  compositeWeights,
  setWeight,
  publishWeights,
  refreshComposite,
  compositeStrategy,
  DEFAULT_DEAD_ZONE,
} from './composite.js'
import { DIR } from './signal.js'
import { appState, setValue, tick, resetState } from '../app/engine.js'

/** A live member signal. */
function member(dir, strength, ts = 0, ttl = 30000) {
  return { dir, strength, ts, ttl, action: dir === DIR.LONG ? 'buy' : 'sell', reason: '' }
}

beforeEach(() => {
  resetState()
})

describe('normalizeWeights', () => {
  it('reads all-zero as no preference rather than as nobody voting', () => {
    expect(normalizeWeights({ a: 1, b: 3 })).toEqual({ a: 0.25, b: 0.75 })
    expect(normalizeWeights({ a: 2, b: 2 })).toEqual({ a: 0.5, b: 0.5 })

    // An equal split is the only reading that leaves the blend usable while the trader is
    // still dragging sliders.
    expect(normalizeWeights({ a: 0, b: 0 })).toEqual({ a: 0.5, b: 0.5 })
    // A negative weight is not a vote against — that is what the direction is for.
    expect(normalizeWeights({ a: -5, b: 5 })).toEqual({ a: 0, b: 1 })
    expect(normalizeWeights({})).toEqual({})
    expect(normalizeWeights(null)).toEqual({})
  })
})

describe('composeSignals', () => {
  it('lets a quiet strategy fall silent instead of carrying the blend', () => {
    const signals = {
      a: member(DIR.LONG, 1, 0),
      b: member(DIR.SHORT, 0.5, 0),
    }

    // 1×1×0.5 + (-1)×0.5×0.5 = 0.25
    expect(composeSignals(signals, { a: 1, b: 1 }, 100)).toEqual({
      score: 0.25,
      voters: 2,
      contributors: ['a', 'b'],
    })

    // Expired members do not vote: a last opinion from twenty minutes ago is not evidence.
    expect(composeSignals(signals, { a: 1, b: 1 }, 40000).contributors).toEqual([])

    // Flat and zero-conviction are abstentions, not votes.
    expect(composeSignals({ a: member(DIR.FLAT, 1, 0) }, { a: 1 }, 0).voters).toBe(0)
    expect(composeSignals({ a: member(DIR.LONG, 0, 0) }, { a: 1 }, 0).voters).toBe(0)
    expect(composeSignals({}, { a: 1 }, 0).score).toBe(0)
  })
})

describe('voteThreshold', () => {
  it('holds flat through the noise band, which is where a blend loses money', () => {
    expect(voteThreshold(0.5)).toBe(DIR.LONG)
    expect(voteThreshold(-0.5)).toBe(DIR.SHORT)

    // A blend landing at 0.02 then -0.02 would otherwise flip long, short, long — two
    // spreads and a fee each time.
    expect(voteThreshold(0.02)).toBe(DIR.FLAT)
    expect(voteThreshold(-0.02)).toBe(DIR.FLAT)
    expect(voteThreshold(DEFAULT_DEAD_ZONE)).toBe(DIR.FLAT)

    expect(voteThreshold(0.1, 0.05)).toBe(DIR.LONG)
    expect(voteThreshold(NaN)).toBe(DIR.FLAT)
  })
})

describe('compositeTtl', () => {
  it('expires with its shakiest member, because a consensus is only as current as that', () => {
    const signals = {
      a: member(DIR.LONG, 1, 0, 30000),
      b: member(DIR.SHORT, 1, 0, 5000),
    }

    expect(compositeTtl(signals, ['a', 'b'], 1000)).toBe(4000)
    expect(compositeTtl(signals, ['a'], 1000)).toBe(29000)

    // A member with no expiry neither extends the blend's life nor shortens it.
    expect(compositeTtl({ c: member(DIR.LONG, 1, 0, 0) }, ['c'], 0)).toBe(0)
    expect(compositeTtl(signals, [], 0)).toBe(0)
    expect(compositeTtl(null, ['a'], 0)).toBe(0)
  })
})

describe('compositeWeights', () => {
  it('reads the saved recipe back normalised, whatever was stored', () => {
    setValue('settings.strategyParams', { composite: { weights: { a: 3, b: 1 } } })
    tick()

    expect(compositeWeights()).toEqual({ a: 0.75, b: 0.25 })
    resetState()
    expect(compositeWeights()).toEqual({})
  })
})

describe('setWeight', () => {
  it('stores raw and normalises on read, so the sliders never fight the hand', () => {
    setWeight('a', 75)
    tick()
    const weights = setWeight('b', 25)
    tick()

    // Raw on disk: storing the normalised value would rewrite every other slider, and the
    // next drag would renormalise against numbers nobody chose.
    expect(appState.settings.strategyParams.composite.weights).toEqual({ a: 75, b: 25 })
    // Normalised on the way out.
    expect(weights).toEqual({ a: 0.75, b: 0.25 })
    expect(setWeight('', 5)).toEqual({ a: 0.75, b: 0.25 })
  })
})

describe('publishWeights', () => {
  it('never lets the blend vote on itself', () => {
    setValue('settings.strategyParams', { composite: { weights: { 'a@x': 1 } } })
    tick()

    const rows = publishWeights([
      { key: 'a@x', strategyId: 'a', name: 'Mean Rev', instrument: 'okx:BTC-USDT' },
      // A composite whose own last signal fed the next one would ratchet, agreeing with
      // itself more strongly every tick.
      { key: 'composite@x', strategyId: 'composite', name: 'Weighted vote' },
    ])
    tick()

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ key: 'a@x', weight: 1, pct: 100 })
    expect(appState.ui.compositeWeights).toHaveLength(1)
  })
})

describe('refreshComposite', () => {
  it('turns four opinions into one decision, with the reason spelled out', () => {
    setValue('settings.strategyParams', { composite: { weights: { a: 1, b: 1 } } })
    setValue('strategy.signals', {
      a: member(DIR.LONG, 1, 0),
      b: member(DIR.LONG, 1, 0),
    })
    tick()

    const signal = refreshComposite({ now: 1000 })

    expect(signal.action).toBe('buy')
    expect(signal.strength).toBe(1)
    expect(signal.reason).toMatch(/2 of 2 agree/)
    // The blend expires with its shakiest member.
    expect(signal.ttl).toBe(29000)

    // Disagreement inside the dead zone is flat, not a coin toss.
    setValue('strategy.signals', { a: member(DIR.LONG, 1, 0), b: member(DIR.SHORT, 0.9, 0) })
    tick()
    expect(refreshComposite({ now: 1000 }).action).toBe('flat')
  })
})

describe('compositeStrategy', () => {
  it('is an ordinary strategy, so nothing downstream special-cases it', () => {
    expect(compositeStrategy.id).toBe('composite')
    expect(Object.isFrozen(compositeStrategy)).toBe(true)
    expect(compositeStrategy.params.deadZone.default).toBe(DEFAULT_DEAD_ZONE)
    // The tick budget was merged in by defineStrategy like any other strategy's.
    expect(compositeStrategy.params.budgetMs).toBeTruthy()

    expect(compositeStrategy.init()).toEqual({ blended: 0 })
    expect(compositeStrategy.onTick({ now: 0 }, { ts: 1000 }).action).toBe('flat')
    expect(compositeStrategy.onCandle()).toBeNull()
  })
})
