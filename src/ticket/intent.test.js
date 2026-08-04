import { describe, it, expect, beforeEach } from 'vitest'
import { priceFromY, intentToOrder, registerIntentAction, INTENT_SOURCES } from './intent.js'
import { clearActions, dispatchAction } from '../actions/registry.js'
import { appState, setValue, tick, resetState } from '../app/engine.js'

beforeEach(() => {
  clearActions()
  resetState()
})

describe('priceFromY', () => {
  it('reads a chart click as a tradable price, not a pixel', () => {
    const plot = { range: { min: 100, max: 200 }, height: 50, tickSize: 0.5 }

    expect(priceFromY(0, plot)).toBe(200)
    expect(priceFromY(50, plot)).toBe(100)
    expect(priceFromY(25, plot)).toBe(150)

    // A click lands between ticks almost always; an order at an unquotable price is a
    // rejection dressed up as an entry.
    expect(priceFromY(24, plot)).toBe(152)

    expect(priceFromY(25, { ...plot, tickSize: 0 })).toBe(150)
    expect(priceFromY(999, plot)).toBe(0)
    expect(INTENT_SOURCES).toEqual(['ladder', 'chart', 'ticket'])
  })
})

describe('intentToOrder', () => {
  it('rests at the level on a plain click and crosses it on shift', () => {
    expect(intentToOrder({ price: 100, column: 'bid' })).toEqual({
      price: 100,
      side: 'buy',
      mode: 'limit',
    })

    // Shift is the whole passive/aggressive distinction, in one key.
    expect(intentToOrder({ price: 100, column: 'bid', shift: true })).toEqual({
      price: 100,
      side: 'sell',
      mode: 'market',
    })

    expect(intentToOrder({ price: 100, column: 'ask' }).side).toBe('sell')
    // An explicit side beats the column it was clicked in.
    expect(intentToOrder({ price: 100, column: 'ask', side: 'buy' }).side).toBe('buy')

    expect(intentToOrder({ price: 100.37 }, { tickSize: 0.1 }).price).toBe(100.4)
    expect(intentToOrder({ price: 0 })).toBeNull()
    expect(intentToOrder(null)).toBeNull()
  })
})

describe('registerIntentAction', () => {
  it('stages the ticket on a cold desk and fires on a hot one', () => {
    const submitted = []
    const name = registerIntentAction({
      submit: (click) => submitted.push(click),
      now: () => 1000,
    })
    expect(name).toBe('ticket.intent')

    setValue('trade.ticketSymbol', 'okx:BTC-USDT')
    setValue('trade.ticketSize', 0.5)
    setValue('market.bid', 100)
    setValue('market.ask', 100.5)
    setValue('market.quoteTs', 1000)
    setValue('market.bookStatus', 'live')
    setValue('trade.armed', false)
    tick()

    // Cold: the ticket is built and shown, and nothing goes out.
    expect(dispatchAction(name, { price: 99.5, column: 'bid' })).toBe(false)
    tick()
    expect(appState.trade.ticketSide).toBe('buy')
    expect(appState.trade.ticketMode).toBe('limit')
    expect(appState.trade.ticketLimit).toBe(99.5)
    expect(appState.trade.lastReject).toBe('disarmed')
    expect(submitted).toEqual([])
    // The flash is what tells the trader the click landed at all.
    expect(appState.trade.ticketFlash).toBe(1)

    setValue('trade.armed', true)
    tick()

    expect(dispatchAction(name, { price: 100.5, column: 'ask' })).toBe(true)
    tick()
    expect(submitted).toEqual([{ side: 'sell' }])
    expect(appState.trade.ticketMode).toBe('limit')

    // Shift crosses: market mode, and the limit is cleared so no stale price shows.
    dispatchAction(name, { price: 100, column: 'bid', shiftKey: true })
    tick()
    expect(appState.trade.ticketMode).toBe('market')
    expect(appState.trade.ticketLimit).toBe(0)

    expect(dispatchAction(name, { price: 0 })).toBe(false)

    // Registered without injected plumbing it still works — it simply has nothing to
    // submit to, which is what a staged-only surface looks like.
    clearActions()
    expect(registerIntentAction()).toBe('ticket.intent')
    expect(dispatchAction('ticket.intent', { price: 100, column: 'bid' })).toBe(true)
  })
})
