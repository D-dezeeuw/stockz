import { describe, it, expect, beforeEach } from 'vitest'
import {
  linkOco,
  siblingOf,
  resolveFill,
  resolveOcoRace,
  closePair,
  linkBracketExits,
  allPairs,
  resetOco,
} from './oco.js'
import { makeBracket } from './bracket.js'

beforeEach(() => resetOco())

describe('linkOco', () => {
  it('links both directions, so the sibling is an O(1) lookup on the fill path', () => {
    const { ok, pairId } = linkOco('tp-1', 'sl-1')

    expect(ok).toBe(true)
    expect(siblingOf('tp-1')).toBe('sl-1')
    expect(siblingOf('sl-1')).toBe('tp-1')
    expect(allPairs()).toEqual([{ pairId, aId: 'tp-1', bId: 'sl-1', status: 'working' }])

    expect(linkOco('tp-1', '').reason).toBe('two ids required')
    expect(linkOco('tp-1', 'tp-1').reason).toBe('cannot pair with itself')
  })
})

describe('siblingOf', () => {
  it('answers nothing for an unpaired order rather than guessing', () => {
    linkOco('a', 'b')

    expect(siblingOf('a')).toBe('b')
    expect(siblingOf('lonely')).toBe('')
    expect(siblingOf(null)).toBe('')
  })
})

describe('resolveFill', () => {
  it('kills the sibling on a full fill and shrinks it on a partial', () => {
    linkOco('tp-1', 'sl-1')

    expect(resolveFill('tp-1', { filled: 1, size: 1 })).toEqual({
      action: 'cancel',
      target: 'sl-1',
      size: 0,
    })

    // The remainder of the position still needs protecting; cancelling would leave it
    // naked.
    expect(resolveFill('tp-1', { filled: 0.4, size: 1 })).toEqual({
      action: 'amend',
      target: 'sl-1',
      size: 0.6,
    })

    expect(resolveFill('unpaired', { filled: 1, size: 1 }).action).toBe('none')
  })
})

describe('resolveOcoRace', () => {
  it('reads a cancel that lost the race as both legs filling, not as an error', () => {
    const { pairId } = linkOco('tp-1', 'sl-1')

    // Both legs filling in the same instant is not an error state — the cancel lost a
    // race it was always going to lose sometimes, and both fills are real.
    expect(resolveOcoRace(pairId, { reason: 'order already filled' })).toEqual({
      raced: true,
      status: 'both-filled',
    })
    expect(allPairs()[0].status).toBe('both-filled')

    expect(resolveOcoRace(pairId, { message: 'order does not exist' }).raced).toBe(true)

    // A real failure is still a real failure.
    expect(resolveOcoRace(pairId, { reason: 'rate_limited' })).toEqual({
      raced: false,
      status: 'cancel-failed',
    })
    expect(resolveOcoRace('nope', {}).status).toBe('cancel-failed')
  })
})

describe('closePair', () => {
  it('unlinks both sides so a stale sibling can never be cancelled twice', () => {
    const { pairId } = linkOco('tp-1', 'sl-1')

    expect(closePair(pairId, 'tp-filled')).toMatchObject({ status: 'tp-filled' })
    expect(siblingOf('tp-1')).toBe('')
    expect(siblingOf('sl-1')).toBe('')

    // The record survives for the journal even though the links are gone.
    expect(allPairs()[0].status).toBe('tp-filled')
    expect(closePair('nope')).toBeNull()
  })
})

describe('linkBracketExits', () => {
  it('pairs a bracket\'s two exits, using the bracket\'s own notion of opposites', () => {
    const { bracket } = makeBracket(
      { symbol: 'okx:BTC-USDT', side: 'buy', size: 1, price: 100, type: 'limit' },
      { tpTicks: 10, slTicks: 5, tickSize: 0.1 },
    )

    const { ok, pairId } = linkBracketExits(bracket)
    expect(ok).toBe(true)
    expect(pairId).toBe(`oco-${bracket.id}`)
    expect(siblingOf(bracket.tp.clientId)).toBe(bracket.sl.clientId)

    // A bracket with only one exit has nothing to pair.
    const single = makeBracket(
      { symbol: 'okx:BTC-USDT', side: 'buy', size: 1, price: 100, type: 'limit' },
      { tpTicks: 10, tickSize: 0.1 },
    )
    expect(linkBracketExits(single.bracket).reason).toBe('bracket has one exit')
    expect(linkBracketExits(null).ok).toBe(false)
  })
})

describe('resetOco', () => {
  it('drops every pair, which is what a reconnect must do before rebuilding', () => {
    linkOco('a', 'b')

    expect(resetOco()).toBe(true)
    expect(allPairs()).toEqual([])
    expect(siblingOf('a')).toBe('')
  })
})
