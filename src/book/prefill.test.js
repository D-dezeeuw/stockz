import { describe, it, expect, beforeEach } from 'vitest'
import { sideForColumn, ticketFromClick, registerPrefillActions } from './prefill.js'
import { clearActions, dispatchAction } from '../actions/registry.js'
import { appState, setValue, tick, resetState } from '../app/engine.js'

describe('sideForColumn', () => {
  it('joins the side you clicked, and crosses it when shift is held', () => {
    // Clicking a bid means joining it: a resting buy.
    expect(sideForColumn('bid')).toBe('buy')
    expect(sideForColumn('ask')).toBe('sell')

    // Shift is the aggressive entry — hitting the bid rather than joining it.
    expect(sideForColumn('bid', true)).toBe('sell')
    expect(sideForColumn('ask', true)).toBe('buy')

    // An unlabelled column still produces a side, never undefined on the order path.
    expect(sideForColumn(null)).toBe('buy')
    expect(sideForColumn('ASK')).toBe('sell')
  })
})

describe('ticketFromClick', () => {
  it('snaps the clicked price to a tradable tick and carries the clip size', () => {
    expect(ticketFromClick({ price: 100.037, column: 'bid', size: 0.5, tickSize: 0.01 })).toEqual({
      price: 100.04,
      side: 'buy',
      size: 0.5,
    })

    // Shift crosses the spread with the same click.
    expect(ticketFromClick({ price: 100, column: 'bid', shift: true }).side).toBe('sell')

    // No tick size leaves the price exactly as clicked rather than guessing precision.
    expect(ticketFromClick({ price: 100.037, column: 'ask' })).toEqual({
      price: 100.037,
      side: 'sell',
      size: 0,
    })

    // A click that carried no price is not a ticket.
    expect(ticketFromClick({ column: 'bid' })).toBeNull()
    expect(ticketFromClick({ price: 0, column: 'bid' })).toBeNull()
    expect(ticketFromClick(null)).toBeNull()
  })
})

describe('registerPrefillActions', () => {
  beforeEach(() => {
    clearActions()
    resetState()
  })

  it('loads the ticket from one click, submitting nothing', () => {
    const name = registerPrefillActions()
    expect(name).toBe('book.prefill')

    setValue('settings.defaultSize', 0.25)
    setValue('market.bookStatus', 'live')
    tick()

    expect(dispatchAction(name, { price: 100.5, side: 'ask', tickSize: 0.1 })).toBe(true)
    tick()

    expect(appState.trade.ticketPrice).toBe(100.5)
    expect(appState.trade.ticketSide).toBe('sell')
    // The desk's standard clip, so the only thing left to decide is whether to send it.
    expect(appState.trade.ticketSize).toBe(0.25)
    // The flash bump is the confirmation — no dialog to dismiss.
    expect(appState.trade.ticketFlash).toBe(1)

    // Shift-click crosses; an explicit size beats the default.
    expect(dispatchAction(name, { px: 99, column: 'bid', shiftKey: true, size: 2 })).toBe(true)
    tick()
    expect(appState.trade.ticketSide).toBe('sell')
    expect(appState.trade.ticketSize).toBe(2)
    expect(appState.trade.ticketFlash).toBe(2)

    // A click with no price leaves the ticket exactly as it was.
    expect(dispatchAction(name, {})).toBe(false)
    tick()
    expect(appState.trade.ticketPrice).toBe(99)

    // A stale or resyncing ladder shows prices that may no longer exist, so a click on
    // it must not reach the ticket at all.
    setValue('market.bookStatus', 'resyncing')
    tick()
    expect(dispatchAction(name, { price: 50, side: 'bid' })).toBe(false)
    tick()
    expect(appState.trade.ticketPrice).toBe(99)
  })
})
