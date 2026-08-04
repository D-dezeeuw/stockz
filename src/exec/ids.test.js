import { describe, it, expect, beforeEach } from 'vitest'
import { setPrefix, issueId, isReused, claimId, dedupeOnReconnect, resetIds } from './ids.js'

beforeEach(() => resetIds())

describe('setPrefix', () => {
  it('keeps the prefix inside the venue\'s charset', () => {
    expect(setPrefix('desk1')).toBe('desk1')
    expect(issueId(1000).startsWith('desk1')).toBe(true)

    // OKX allows letters and digits only, and caps the length.
    expect(setPrefix('a-b_c!d')).toBe('abcd')
    expect(setPrefix('waytoolongaprefix')).toBe('waytoolo')
    // Nothing usable leaves the current prefix alone rather than blanking it.
    expect(setPrefix('!!!')).toBe('waytoolo')
  })
})

describe('issueId', () => {
  it('never repeats, and sorts by the moment it was issued', () => {
    const a = issueId(1700000000000)
    const b = issueId(1700000000000)

    expect(a).not.toBe(b)
    expect(issueId(1700000001000) > a).toBe(true)
    // OKX caps clOrdId length; a session's worth of ids must stay well inside it.
    expect(a.length).toBeLessThanOrEqual(32)
    expect(a).toMatch(/^[a-z0-9]+$/)
  })
})

describe('isReused', () => {
  it('remembers every id this session issued', () => {
    const id = issueId(1000)

    expect(isReused(id)).toBe(true)
    expect(isReused('never-seen')).toBe(false)
    expect(isReused(null)).toBe(false)
  })
})

describe('claimId', () => {
  it('refuses a duplicate before any network call', () => {
    expect(claimId('mine-1')).toEqual({ ok: true, reason: '' })

    // A duplicate id at the venue is either a rejection or, worse, a second order.
    expect(claimId('mine-1')).toEqual({ ok: false, reason: 'duplicate id' })
    expect(claimId('')).toEqual({ ok: false, reason: 'no id' })
  })
})

describe('dedupeOnReconnect', () => {
  it('resubmits only what the venue does not already have', () => {
    const pending = [{ clientId: 'a' }, { clientId: 'b' }, { clientId: 'c' }]
    const open = [{ clOrdId: 'b' }, { clOrdId: 'zz' }]

    const plan = dedupeOnReconnect(pending, open)

    // 'b' is already working: resubmitting would double the position, which is the one
    // bug here that costs real money silently.
    expect(plan.resubmit.map((o) => o.clientId)).toEqual(['a', 'c'])
    expect(plan.alreadyLive).toEqual(['b'])

    // Orders the venue holds that this session never sent are usually another tab —
    // adopting them silently would let two desks fight over one position.
    expect(plan.orphans).toEqual(['zz'])

    expect(dedupeOnReconnect(null, null)).toEqual({
      resubmit: [],
      alreadyLive: [],
      orphans: [],
    })
  })
})

describe('resetIds', () => {
  it('forgets the session, which is what a fresh tab is', () => {
    const id = issueId(1000)
    setPrefix('desk1')

    expect(resetIds()).toBe(true)
    expect(isReused(id)).toBe(false)
    expect(issueId(1000).startsWith('stkz')).toBe(true)
  })
})
