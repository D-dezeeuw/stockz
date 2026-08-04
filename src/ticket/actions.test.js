import { describe, it, expect, beforeEach } from 'vitest'
import { sizeForPreset, nudgePrice, registerTicketActions, readTicket, SIZE_STEPS } from './actions.js'
import { clearActions, dispatchAction } from '../actions/registry.js'
import { appState, setValue, tick, resetState } from '../app/engine.js'

beforeEach(() => {
  clearActions()
  resetState()
})

describe('sizeForPreset', () => {
  it('scales the desk clip without leaking float noise onto the order path', () => {
    expect(sizeForPreset(0.1, 2)).toBe(0.2)
    expect(sizeForPreset(0.1, 0.5)).toBe(0.05)

    // 0.1 × 3 is 0.30000000000000004 in floating point, which venues reject on precision.
    expect(sizeForPreset(0.1, 3)).toBe(0.3)

    expect(sizeForPreset(0, 2)).toBe(0)
    expect(sizeForPreset(0.1, 0)).toBe(0)
    expect(sizeForPreset('x', 2)).toBe(0)
    expect(SIZE_STEPS).toEqual([0.25, 0.5, 1, 2, 5])
  })
})

describe('nudgePrice', () => {
  it('moves by whole ticks and never below zero', () => {
    expect(nudgePrice(100, 2, 0.5)).toBe(101)
    expect(nudgePrice(100, -2, 0.5)).toBe(99)
    expect(nudgePrice(0.3, 1, 0.1)).toBe(0.4)

    // A price cannot be nudged through zero into a negative.
    expect(nudgePrice(0.5, -10, 0.1)).toBe(0)

    // Without a tick size there is nothing to move by.
    expect(nudgePrice(100, 2, 0)).toBe(100)
    expect(nudgePrice(100, 'x', 0.5)).toBe(100)
  })
})

describe('registerTicketActions', () => {
  it('changes side, size, mode and price in one dispatch each', () => {
    const names = registerTicketActions()
    expect(names).toContain('ticket.arm')

    setValue('settings.defaultSize', 0.1)
    setValue('settings.priceStep', 0.5)
    setValue('market.focus', 'okx:BTC-USDT')
    tick()

    expect(dispatchAction('ticket.setSide', 'sell')).toBe(true)
    tick()
    expect(appState.trade.ticketSide).toBe('sell')
    expect(dispatchAction('ticket.setSide', 'sideways')).toBe(false)

    // A preset multiplies the desk's clip; an explicit size wins over it.
    expect(dispatchAction('ticket.setSize', { preset: 2 })).toBe(true)
    tick()
    expect(appState.trade.ticketSize).toBe(0.2)
    dispatchAction('ticket.setSize', { size: 1.5 })
    tick()
    expect(appState.trade.ticketSize).toBe(1.5)

    expect(dispatchAction('ticket.setMode', 'bid')).toBe(true)
    tick()
    expect(appState.trade.ticketMode).toBe('bid')
    expect(dispatchAction('ticket.setMode', 'telepathy')).toBe(false)

    // Nudging a price *is* choosing a limit; leaving the mode on bid would show a number
    // the order would not use.
    setValue('trade.ticketPrice', 100)
    tick()
    expect(dispatchAction('ticket.nudge', { ticks: 2 })).toBe(true)
    tick()
    expect(appState.trade.ticketLimit).toBe(101)
    expect(appState.trade.ticketMode).toBe('limit')

    // Arming is a session toggle, not a per-order dialog.
    expect(dispatchAction('ticket.arm', {})).toBe(true)
    tick()
    expect(appState.trade.armed).toBe(true)
    dispatchAction('ticket.arm', {})
    tick()
    expect(appState.trade.armed).toBe(false)

    // Reset returns to the focused instrument at the desk's clip.
    dispatchAction('ticket.reset', {})
    tick()
    expect(appState.trade.ticketSymbol).toBe('okx:BTC-USDT')
    expect(appState.trade.ticketSize).toBe(0.1)
    expect(appState.trade.ticketMode).toBe('market')
  })
})

describe('readTicket', () => {
  it('reports the ticket, its price and whether it could be sent', () => {
    setValue('trade.ticketSymbol', 'okx:BTC-USDT')
    setValue('trade.ticketSize', 0.5)
    setValue('trade.ticketSide', 'buy')
    setValue('trade.ticketMode', 'market')
    setValue('market.bid', 100)
    setValue('market.ask', 100.5)
    setValue('market.quoteTs', 1000)
    setValue('market.bookStatus', 'live')
    tick()

    setValue('trade.armed', true)
    tick()

    const read = readTicket({ now: 1100 })
    expect(read.ticket).toMatchObject({ symbol: 'okx:BTC-USDT', size: 0.5, side: 'buy' })
    // A buy at market takes the offer.
    expect(read.resolved.price).toBe(100.5)
    expect(read.verdict).toEqual({ ok: true, reason: '' })

    // Degrade the book and the same ticket becomes unsendable, with the reason named.
    setValue('market.bookStatus', 'resyncing')
    tick()
    expect(readTicket({ now: 1100 }).verdict).toEqual({ ok: false, reason: 'book not live' })

    // An empty desk falls back to the focused instrument, and says what is missing.
    resetState()
    expect(readTicket().verdict.ok).toBe(false)
  })
})
