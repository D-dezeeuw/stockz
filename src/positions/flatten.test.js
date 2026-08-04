import { describe, it, expect, beforeEach } from 'vitest'
import { closeIntent, flattenOne, flattenAll, registerFlattenActions, hasExposure } from './flatten.js'
import { ingestFill, resetPositions, flushPositions } from './store.js'
import { clearActions, dispatchAction } from '../actions/registry.js'
import { appState, tick, resetState } from '../app/engine.js'

beforeEach(() => {
  resetPositions()
  clearActions()
  resetState()
})

describe('closeIntent', () => {
  it('builds an order that cannot overshoot into a new position', () => {
    expect(closeIntent({ venue: 'okx', instrument: 'BTC-USDT', qty: 2 })).toEqual({
      venue: 'okx',
      symbol: 'BTC-USDT',
      // Opposite side, absolute size, reduce-only, market: together these make an
      // overshoot into a fresh position in the other direction impossible.
      side: 'sell',
      size: 2,
      type: 'market',
      reduceOnly: true,
    })

    expect(closeIntent({ venue: 'okx', instrument: 'BTC-USDT', qty: -2 }).side).toBe('buy')

    // A limit that does not fill is not an exit, so this is always a market order.
    expect(closeIntent({ venue: 'okx', instrument: 'BTC-USDT', qty: 2 }).type).toBe('market')

    expect(closeIntent({ instrument: 'BTC-USDT', qty: 0 })).toBeNull()
    expect(closeIntent(null)).toBeNull()
  })
})

describe('flattenOne', () => {
  it('closes exactly the position named', async () => {
    ingestFill({ venue: 'okx', instrument: 'BTC-USDT', side: 'buy', qty: 2, px: 100 })
    ingestFill({ venue: 'okx', instrument: 'ETH-USDT', side: 'sell', qty: 1, px: 10 })

    const sent = []
    expect(await flattenOne('okx:BTC-USDT', { submit: async (i) => (sent.push(i), { ok: true }) })).toEqual(
      { ok: true, reason: '' },
    )
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ symbol: 'BTC-USDT', side: 'sell', size: 2 })

    expect(await flattenOne('okx:NOPE', { submit: async () => ({ ok: true }) })).toEqual({
      ok: false,
      reason: 'no position',
    })
  })
})

describe('flattenAll', () => {
  it('closes serially, because a rate limit mid-flatten strands the tail', async () => {
    ingestFill({ venue: 'okx', instrument: 'BTC-USDT', side: 'buy', qty: 2, px: 100 })
    ingestFill({ venue: 'okx', instrument: 'ETH-USDT', side: 'sell', qty: 1, px: 10 })

    const order = []
    const result = await flattenAll({
      submit: async (intent) => {
        order.push(intent.symbol)
        return { ok: true }
      },
      now: () => 1000,
    })
    tick()

    expect(result).toEqual({ closed: 2, failed: 0 })
    expect(order).toEqual(['BTC-USDT', 'ETH-USDT'])
    expect(appState.ui.toasts.at(-1).message).toBe('flattened 2')

    // A refusal is counted and reported rather than swallowed.
    const failed = await flattenAll({
      submit: async () => ({ ok: false, reason: 'rate_limited' }),
      now: () => 2000,
    })
    expect(failed).toEqual({ closed: 0, failed: 2 })

    // Already flat: no venue round trip at all.
    resetPositions()
    let called = false
    expect(await flattenAll({ submit: async () => ((called = true), { ok: true }) })).toEqual({
      closed: 0,
      failed: 0,
    })
    expect(called).toBe(false)
  })
})

describe('registerFlattenActions', () => {
  it('exits without asking, and without needing the desk to be armed', async () => {
    const sent = []
    const names = registerFlattenActions({
      submit: async (intent) => (sent.push(intent), { ok: true }),
      now: () => 1000,
    })
    expect(names).toEqual(['positions.flatten', 'positions.flattenAll'])

    ingestFill({ venue: 'okx', instrument: 'BTC-USDT', side: 'buy', qty: 2, px: 100 })

    // Disarmed: arming controls *entering* risk, never leaving it.
    expect(dispatchAction('positions.flatten', { key: 'okx:BTC-USDT' })).toBe(true)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(sent).toHaveLength(1)

    expect(dispatchAction('positions.flattenAll', {})).toBe(true)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(sent).toHaveLength(2)

    // A venue and instrument work as well as a key.
    dispatchAction('positions.flatten', { venue: 'okx', instrument: 'BTC-USDT' })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(sent).toHaveLength(3)
  })
})

describe('hasExposure', () => {
  it('answers the question the risk chip asks', () => {
    expect(hasExposure()).toBe(false)

    ingestFill({ venue: 'okx', instrument: 'BTC-USDT', side: 'buy', qty: 1, px: 100 })
    flushPositions()
    tick()
    expect(hasExposure()).toBe(true)
  })
})
