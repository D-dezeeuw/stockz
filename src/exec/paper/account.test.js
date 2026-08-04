// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  DEFAULT_BALANCE,
  applyFillToBalance,
  markToMarket,
  computeExposure,
  refreshAccount,
  paperMarks,
  bookPaperFill,
  resetPaperAccount,
  beginPaperReset,
  cancelPaperReset,
  startPaperAccount,
} from './account.js'
import { ingestFill, openPositions, resetPositions } from '../../positions/store.js'
import { appState, setValue, tick, resetState } from '../../app/engine.js'
import { PATHS } from '../../state/paths.js'

const POSITIONS = [{ instrument: 'BTC-USDT', qty: 2, avgPx: 100 }]

beforeEach(() => {
  resetState()
  resetPositions()
  cancelPaperReset(null, {})
  setValue(PATHS.trade.paperBalance, DEFAULT_BALANCE)
  setValue(PATHS.settings.paperStartBalance, DEFAULT_BALANCE)
  tick()
})

describe('applyFillToBalance', () => {
  it('spends on a buy, receives on a sell, and always pays the fee', () => {
    expect(applyFillToBalance(10000, { side: 'buy', qty: 2, px: 100, fee: 0.2 })).toBe(9799.8)
    expect(applyFillToBalance(10000, { side: 'sell', qty: 2, px: 100, fee: 0.2 })).toBe(10199.8)

    // The fee is a cost regardless of side: a signed fee would let a sell that paid
    // commission read as one that earned it.
    expect(applyFillToBalance(10000, { side: 'sell', qty: 1, px: 100, fee: -5 })).toBe(10095)

    expect(applyFillToBalance(10000, { side: 'buy', qty: 0, px: 100 })).toBe(10000)
    expect(applyFillToBalance(null, {})).toBe(0)
  })
})

describe('markToMarket', () => {
  it('values the book at live prices and never at nothing', () => {
    expect(markToMarket(POSITIONS, { 'BTC-USDT': 110 })).toEqual({ unrealized: 20, notional: 220 })
    expect(markToMarket([{ instrument: 'X', qty: -2, avgPx: 100 }], { X: 90 })).toEqual({
      unrealized: 20,
      notional: 180,
    })

    // No mark is not a mark of zero: an instrument the feed has gone quiet on is worth
    // what it was worth, and pricing it at nothing shows a total loss on a live position.
    expect(markToMarket(POSITIONS, {})).toEqual({ unrealized: 0, notional: 200 })

    expect(markToMarket([{ instrument: 'X', qty: 0, avgPx: 100 }], {})).toEqual({ unrealized: 0, notional: 0 })
    expect(markToMarket(null)).toEqual({ unrealized: 0, notional: 0 })
  })
})

describe('computeExposure', () => {
  it('reads leverage as a fraction of equity, capped where it stops meaning anything', () => {
    expect(computeExposure(5000, 10000)).toBe(0.5)
    expect(computeExposure(20000, 10000)).toBe(2)
    expect(computeExposure(0, 10000)).toBe(0)

    // A wiped account with an open position is infinitely leveraged, which is true and
    // useless — a ceiling keeps the tile readable at the moment it matters most.
    expect(computeExposure(500, 0)).toBe(99)
    expect(computeExposure(0, 0)).toBe(0)
  })
})

describe('paperMarks', () => {
  it('prefers the focused instrument mid over the slower watchlist poll', () => {
    expect(
      paperMarks({ market: { watchRows: [{ symbol: 'BTC-USDT', last: 100 }, { symbol: 'ETH-USDT', last: 50 }] } }),
    ).toEqual({ 'BTC-USDT': 100, 'ETH-USDT': 50 })

    // A tile lagging the ladder on the very instrument being traded is the one place the
    // lag is visible.
    expect(
      paperMarks({
        market: { watchRows: [{ symbol: 'BTC-USDT', last: 100 }], focus: 'okx:BTC-USDT', mid: 105 },
      }),
    ).toEqual({ 'BTC-USDT': 105 })

    expect(paperMarks({})).toEqual({})
  })
})

describe('refreshAccount', () => {
  it('publishes cash, equity, exposure and the session, with labels the tile renders', () => {
    const account = refreshAccount({ balance: 9800, positions: POSITIONS, marks: { 'BTC-USDT': 110 } })
    tick()

    expect(account).toMatchObject({
      balance: 9800,
      unrealized: 20,
      equity: 9820,
      notional: 220,
      // Against the *starting* stake, not against yesterday: a practice account exists to
      // answer "did this week work".
      sessionPnl: -180,
      positions: 1,
      equityLabel: '9820.00',
      sessionLabel: '-180.00',
    })
    expect(appState.trade.paperAccount.equity).toBe(9820)

    expect(refreshAccount({ balance: 100, positions: [], marks: {} })).toMatchObject({
      equity: 100,
      exposure: 0,
      exposureLabel: '0%',
    })
  })
})

describe('bookPaperFill', () => {
  it('moves the practice balance only for paper fills', () => {
    expect(bookPaperFill({ paper: true, side: 'buy', qty: 1, px: 100, fee: 0.1 })).toBe(9899.9)
    tick()
    expect(appState.trade.paperBalance).toBe(9899.9)

    // A live fill reaching this would move the practice balance by real money, and the two
    // accounts would drift apart in a way nothing on screen explains.
    expect(bookPaperFill({ side: 'buy', qty: 1, px: 100 })).toBe(9899.9)
    tick()
    expect(appState.trade.paperBalance).toBe(9899.9)
  })
})

describe('resetPaperAccount', () => {
  it('goes back to the configured stake, or to the one asked for', () => {
    bookPaperFill({ paper: true, side: 'buy', qty: 1, px: 100 })
    tick()

    expect(resetPaperAccount(null, {})).toBe(DEFAULT_BALANCE)
    tick()
    expect(appState.trade.paperBalance).toBe(DEFAULT_BALANCE)

    expect(resetPaperAccount(null, { value: 250 })).toBe(250)
    tick()
    expect(appState.trade.paperAccount.equity).toBe(250)

    setValue(PATHS.settings.paperStartBalance, 5000)
    tick()
    expect(resetPaperAccount(null, { value: -5 })).toBe(5000)

    // Everything at once. A reset that cleared the cash but left the positions would leave
    // the account holding a book it never paid for, and the equity would be wrong from the
    // first tick — worse than not resetting, because it looks like it worked.
    ingestFill({ venue: 'paper', instrument: 'BTC-USDT', side: 'buy', qty: 1, px: 100, paper: true })
    expect(openPositions()).toHaveLength(1)
    resetPaperAccount(null, {})
    tick()
    expect(openPositions()).toEqual([])
    expect(appState.trade.paperAccount.positions).toBe(0)
  })
})

describe('beginPaperReset', () => {
  it('wipes only after the hold completes', () => {
    const timeouts = []
    const timer = {
      setTimeout: (fn) => (timeouts.push(fn), timeouts.length),
      clearTimeout: (id) => (timeouts[id - 1] = null),
      setInterval: () => 1,
      clearInterval: () => {},
    }
    bookPaperFill({ paper: true, side: 'buy', qty: 1, px: 100 })
    tick()
    expect(appState.trade.paperBalance).toBe(9900)

    expect(beginPaperReset(null, { timer, doc: null })).toBe(true)
    tick()
    // Nothing yet: a stray click that erases a week of practice is worse than one that
    // costs a trade.
    expect(appState.trade.paperBalance).toBe(9900)

    timeouts[0]()
    tick()
    expect(appState.trade.paperBalance).toBe(DEFAULT_BALANCE)
  })
})

describe('cancelPaperReset', () => {
  it('abandons the wipe, so releasing early costs nothing', () => {
    const timeouts = []
    const timer = {
      setTimeout: (fn) => (timeouts.push(fn), timeouts.length),
      clearTimeout: (id) => (timeouts[id - 1] = null),
      setInterval: () => 1,
      clearInterval: () => {},
    }
    bookPaperFill({ paper: true, side: 'buy', qty: 1, px: 100 })
    beginPaperReset(null, { timer, doc: null })

    expect(cancelPaperReset(null, { timer, doc: null })).toBe(true)
    tick()
    expect(timeouts[0]).toBeNull()
    expect(appState.trade.paperBalance).toBe(9900)
    expect(cancelPaperReset(null, {})).toBe(false)
  })
})

describe('startPaperAccount', () => {
  it('recomputes as the market moves, and stops when told', () => {
    const watched = []
    let fire = null
    const stop = startPaperAccount({
      watch: (paths, fn) => {
        watched.push(...paths)
        fire = fn
        return () => (fire = null)
      },
    })
    tick()

    // Equity has to breathe between trades, or a tile that only moved on fills would hide
    // every drawdown that happened while the trader was doing nothing.
    expect(watched).toContain(PATHS.market.mid)
    expect(appState.trade.paperAccount.equity).toBe(DEFAULT_BALANCE)

    fire()
    stop()
    expect(fire).toBeNull()
  })
})
