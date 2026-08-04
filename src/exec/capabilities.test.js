import { describe, it, expect } from 'vitest'
import {
  instrumentKind,
  capabilityFor,
  capabilityFlags,
  isEmulated,
  VENUES,
} from './capabilities.js'
import { OKX_CAPABILITIES } from './adapters/okx.js'

describe('instrumentKind', () => {
  it('tells a swap from spot, which is what changes the rules', () => {
    expect(instrumentKind('BTC-USDT-SWAP')).toBe('swap')
    expect(instrumentKind('btc-usdt-swap')).toBe('swap')
    expect(instrumentKind('BTC-USDT')).toBe('spot')
    expect(instrumentKind('')).toBe('spot')
  })
})

describe('capabilityFor', () => {
  it('merges the instrument\'s rules over the venue\'s, and knows nothing about strangers', () => {
    const swap = capabilityFor('okx', 'BTC-USDT-SWAP')
    expect(swap.tifs).toContain('post_only')
    expect(swap.reduceOnly).toBe(true)

    // Spot cannot reduce a position it does not hold as a position.
    expect(capabilityFor('okx', 'BTC-USDT').reduceOnly).toBe(false)

    // EToro has no IOC or FOK; the engine emulates them, and says so.
    const etoro = capabilityFor('etoro', 'AAPL')
    expect(etoro.tifs).toEqual(['gtc'])
    expect(etoro.brackets).toEqual({ supported: true, emulated: true })

    // An unknown venue gets the empty set: showing a control that cannot work is worse
    // than showing none.
    expect(capabilityFor('kraken').orderTypes).toEqual([])
    expect(capabilityFor(null).tifs).toEqual([])
  })
})

describe('capabilityFlags', () => {
  it('speaks the adapter contract\'s vocabulary, and matches the OKX adapter exactly', () => {
    const flags = capabilityFlags(capabilityFor('okx', 'BTC-USDT-SWAP'))

    // The adapter's list is derived from this record, not restated — two hand-written
    // lists drift, and the drift reads to the trader as the desk being broken.
    expect([...flags].sort()).toEqual([...OKX_CAPABILITIES].sort())
    expect(flags).toContain('amend')

    // gtc is the baseline every venue has and is never a flag.
    expect(flags).not.toContain('gtc')
    expect(capabilityFlags(capabilityFor('etoro'))).toEqual(['market', 'limit'])
    expect(capabilityFlags(null)).toEqual([])
  })
})

describe('isEmulated', () => {
  it('badges only what the engine runs rather than the venue', () => {
    expect(isEmulated(VENUES.etoro, 'brackets')).toBe(true)
    expect(isEmulated(VENUES.okx, 'brackets')).toBe(false)

    // Unsupported is not emulated — there is nothing to badge.
    expect(isEmulated(VENUES.etoro, 'trailing')).toBe(false)
    expect(isEmulated(null, 'brackets')).toBe(false)
  })
})
