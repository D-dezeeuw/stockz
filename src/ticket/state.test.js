import { describe, it, expect, beforeEach } from 'vitest'
import {
  buildTicketState,
  resolvePrice,
  canSubmit,
  refreshTicketPrice,
  SIDES,
  MODES,
  QUOTE_STALE_MS,
} from './state.js'
import { appState, setValue, tick, resetState } from '../app/engine.js'

beforeEach(() => resetState())

describe('buildTicketState', () => {
  it('seeds a ticket that cannot accidentally be a live order', () => {
    const state = buildTicketState({ symbol: 'okx:BTC-USDT', size: 0.05 })

    expect(state['trade.ticketSymbol']).toBe('okx:BTC-USDT')
    expect(state['trade.ticketSize']).toBe(0.05)
    expect(state['trade.ticketSide']).toBe('buy')
    // Market by default, and no price until a quote resolves one.
    expect(state['trade.ticketMode']).toBe('market')
    expect(state['trade.ticketPrice']).toBe(0)
    expect(state['trade.ticketLimit']).toBe(0)

    expect(buildTicketState({ mode: 'limit' })['trade.ticketMode']).toBe('limit')
    // An unknown mode falls back rather than leaving the ticket unpriceable.
    expect(buildTicketState({ mode: 'yolo' })['trade.ticketMode']).toBe('market')
    expect(buildTicketState()['trade.ticketSize']).toBe(0)

    expect(SIDES).toEqual(['buy', 'sell'])
    expect(MODES).toEqual(['market', 'bid', 'ask', 'limit'])
  })
})

describe('resolvePrice', () => {
  it('prices each mode off the live quote, and refuses to join a dead one', () => {
    const quote = { bid: 100, ask: 100.5, ts: 1000 }
    const fresh = { now: 1200 }

    // Market crosses: a buy takes the offer, a sell hits the bid.
    expect(resolvePrice({ mode: 'market', side: 'buy' }, quote, fresh)).toMatchObject({
      price: 100.5,
      source: 'market',
    })
    expect(resolvePrice({ mode: 'market', side: 'sell' }, quote, fresh).price).toBe(100)

    // Joining a side rests there instead.
    expect(resolvePrice({ mode: 'bid', side: 'buy' }, quote, fresh).price).toBe(100)
    expect(resolvePrice({ mode: 'ask', side: 'sell' }, quote, fresh).price).toBe(100.5)
    expect(resolvePrice({ mode: 'limit', limit: 99 }, quote, fresh)).toMatchObject({
      price: 99,
      source: 'limit',
    })

    // A stale quote names a bid that may be long gone, so joining it falls back to
    // market — "whatever it costs now" beats a dead price.
    const stale = resolvePrice({ mode: 'bid', side: 'buy' }, quote, { now: 9000 })
    expect(stale).toMatchObject({ price: 100.5, source: 'market', stale: true })
    // A limit is the trader's own number and survives a stale quote.
    expect(resolvePrice({ mode: 'limit', limit: 99 }, quote, { now: 9000 }).price).toBe(99)

    // An unfilled limit field is not an instruction to trade at zero.
    expect(resolvePrice({ mode: 'limit', limit: 0, side: 'buy' }, quote, fresh).source).toBe(
      'market',
    )
    expect(resolvePrice({}, {}, fresh).price).toBe(0)
    expect(QUOTE_STALE_MS).toBe(1500)
  })
})

describe('canSubmit', () => {
  it('names exactly what is missing, and will not price off a degraded book', () => {
    const ticket = { symbol: 'okx:BTC-USDT', size: 0.1 }
    const priced = { price: 100 }

    const hot = { bookStatus: 'live', armed: true }
    expect(canSubmit(ticket, priced, hot)).toEqual({ ok: true, reason: '' })

    expect(canSubmit({ ...ticket, symbol: '' }, priced, hot).reason).toBe('no instrument')
    expect(canSubmit({ ...ticket, size: 0 }, priced, hot).reason).toBe('no size')
    expect(canSubmit(ticket, { price: 0 }, hot).reason).toBe('no price')

    // A price read off a stale ladder is a market order in disguise.
    expect(canSubmit(ticket, priced, { bookStatus: 'stale', armed: true })).toEqual({
      ok: false,
      reason: 'book not live',
    })

    // A cold desk sends nothing — and it is checked last, so a ticket that is *also*
    // missing a size says so, which is the more useful message of the two.
    expect(canSubmit(ticket, priced, { bookStatus: 'live' }).reason).toBe('disarmed')
    expect(canSubmit({ ...ticket, size: 0 }, priced, { bookStatus: 'live' }).reason).toBe('no size')

    expect(canSubmit(null, null).ok).toBe(false)
  })
})

describe('refreshTicketPrice', () => {
  it('publishes what the ticket would actually send', () => {
    setValue('market.bid', 100)
    setValue('market.ask', 100.5)
    setValue('market.quoteTs', 1000)
    setValue('trade.ticketMode', 'market')
    setValue('trade.ticketSide', 'buy')
    tick()

    expect(refreshTicketPrice({ now: 1100 }).price).toBe(100.5)
    tick()
    expect(appState.trade.ticketPrice).toBe(100.5)
    expect(appState.trade.ticketSource).toBe('market')

    // Joining the bid shows the resting price, and the source says so.
    setValue('trade.ticketMode', 'bid')
    tick()
    refreshTicketPrice({ now: 1100 })
    tick()
    expect(appState.trade.ticketPrice).toBe(100)
    expect(appState.trade.ticketSource).toBe('bid')

    // The quote goes quiet: the preview falls back rather than showing a dead bid.
    refreshTicketPrice({ now: 99999 })
    tick()
    expect(appState.trade.ticketSource).toBe('market')
  })
})
