import { describe, it, expect, beforeEach } from 'vitest'
import {
  applyPreset,
  clampQty,
  roundToLot,
  resolveQty,
  registerSizingActions,
  QTY_PRESETS,
} from './sizing.js'
import { clearActions, dispatchAction } from '../actions/registry.js'
import { appState, setValue, tick, resetState } from '../app/engine.js'

beforeEach(() => {
  clearActions()
  resetState()
})

describe('applyPreset', () => {
  it('reads a percentage as buying power at this price, not as a fixed quantity', () => {
    // 50% of 1000 quote at 100 is 5 base.
    expect(applyPreset(0.5, 1000, 100)).toBe(5)
    expect(applyPreset(1, 1000, 100)).toBe(10)
    expect(applyPreset(0.25, 1000, 40)).toBe(6.25)

    // Over 100% is capped rather than borrowing.
    expect(applyPreset(2, 1000, 100)).toBe(10)

    expect(applyPreset(0.5, 0, 100)).toBe(0)
    expect(applyPreset(0.5, 1000, 0)).toBe(0)
    expect(applyPreset('x', 1000, 100)).toBe(0)
    expect(QTY_PRESETS).toEqual([0.25, 0.5, 0.75, 1])
  })
})

describe('clampQty', () => {
  it('caps at the risk limit and rejects anything under the venue minimum', () => {
    expect(clampQty(5, { min: 0.1, max: 10 })).toBe(5)
    expect(clampQty(50, { min: 0.1, max: 10 })).toBe(10)

    // Below the minimum is a rejected order, not a small one. Clamping *up* would
    // silently trade more than asked, so it clamps to zero and the ticket says so.
    expect(clampQty(0.05, { min: 0.1 })).toBe(0)

    expect(clampQty(5, {})).toBe(5)
    expect(clampQty(0, { max: 10 })).toBe(0)
    expect(clampQty('x', {})).toBe(0)
  })
})

describe('roundToLot', () => {
  it('rounds down, so a snapped size never exceeds a limit just checked', () => {
    expect(roundToLot(1.27, 0.1)).toBe(1.2)
    expect(roundToLot(5, 1)).toBe(5)
    expect(roundToLot(0.00012345, 0.00001)).toBe(0.00012)

    // Under one whole lot is no order at all.
    expect(roundToLot(0.5, 1)).toBe(0)

    // No lot size known yet leaves the size alone rather than zeroing the ticket.
    expect(roundToLot(1.27, 0)).toBe(1.27)
    expect(roundToLot(0, 1)).toBe(0)
  })
})

describe('resolveQty', () => {
  it('takes every route in through the same clamp-and-round path', () => {
    const context = { buyingPower: 1000, price: 100, min: 0.1, max: 8, lotSize: 0.01 }

    // A preset: 50% of 1000 at 100 is 5, inside the limit.
    expect(resolveQty({ percent: 0.5 }, context)).toBe(5)
    // Full buying power would be 10, but the risk cap is 8.
    expect(resolveQty({ percent: 1 }, context)).toBe(8)
    // An explicit quantity skips the percentage maths but not the rounding.
    expect(resolveQty({ qty: 1.279 }, context)).toBe(1.27)

    // Under the venue minimum resolves to nothing rather than to a rejection.
    expect(resolveQty({ qty: 0.05 }, context)).toBe(0)
    expect(resolveQty({}, context)).toBe(0)
  })
})

describe('registerSizingActions', () => {
  it('sizes off buying power and steps the ticket without ever going negative', () => {
    const names = registerSizingActions()
    expect(names).toEqual(['ticket.applyPreset', 'ticket.stepQty'])

    setValue('trade.buyingPower', 1000)
    setValue('trade.ticketPrice', 100)
    setValue('settings.maxPosition', 8)
    setValue('settings.defaultSize', 0.5)
    tick()

    expect(dispatchAction('ticket.applyPreset', { percent: 0.5 })).toBe(true)
    tick()
    expect(appState.trade.ticketSize).toBe(5)

    // The risk cap holds even at 100%.
    dispatchAction('ticket.applyPreset', 1)
    tick()
    expect(appState.trade.ticketSize).toBe(8)

    // Steps move by the desk's clip and stop at zero rather than going short by accident.
    expect(dispatchAction('ticket.stepQty', { direction: -1 })).toBe(true)
    tick()
    expect(appState.trade.ticketSize).toBe(7.5)

    dispatchAction('ticket.stepQty', { step: 100, direction: -1 })
    tick()
    expect(appState.trade.ticketSize).toBe(0)

    // With no buying power there is nothing to size against.
    setValue('trade.buyingPower', 0)
    tick()
    expect(dispatchAction('ticket.applyPreset', { percent: 0.5 })).toBe(false)
  })
})
