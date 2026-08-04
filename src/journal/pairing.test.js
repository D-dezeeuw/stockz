import { describe, it, expect, beforeEach } from 'vitest'
import {
  TRADE_CAP,
  LOTS_KEY,
  normalizeFill,
  splitCrossingFill,
  matchLots,
  makeTrade,
  pairFills,
  journalTrades,
  openLots,
  saveOpenLots,
  loadOpenLots,
  resetJournal,
  onJournalFill,
  journalState,
} from './pairing.js'
import { appState, tick, resetState } from '../app/engine.js'

/** A localStorage stand-in that can be told to fail. */
function fakeStorage(broken = false) {
  const map = new Map()
  return {
    map,
    getItem: (key) => {
      if (broken) throw new Error('no storage')
      return map.get(key) ?? null
    },
    setItem: (key, value) => {
      if (broken) throw new Error('quota')
      map.set(key, value)
    },
  }
}

const BUY = { id: 'f1', venue: 'okx', instrument: 'BTC-USDT', side: 'buy', qty: 1, px: 100, ts: 10 }
const SELL = { id: 'f2', venue: 'okx', instrument: 'BTC-USDT', side: 'sell', qty: 1, px: 110, ts: 20 }

beforeEach(() => {
  resetJournal()
  resetState()
})

describe('normalizeFill', () => {
  it('speaks in signs, because sides are the venue’s language and not the journal’s', () => {
    expect(normalizeFill(BUY)).toMatchObject({ qty: 1, px: 100, fee: 0, venue: 'okx' })
    expect(normalizeFill(SELL).qty).toBe(-1)

    // A fee is a cost whichever sign the venue reports it with.
    expect(normalizeFill({ ...BUY, fee: -0.4 }).fee).toBe(0.4)

    // No id from the venue: one synthesised from the fill itself, so the dedupe still has
    // something stable to compare.
    expect(normalizeFill({ ...BUY, id: undefined }).id).toBe('BTC-USDT|10|1|100')

    // A venue that reports a signed quantity and no side is taken at its word, and the
    // symbol spelling is accepted either way — two venues, two vocabularies.
    expect(normalizeFill({ symbol: 'ETH-USDT', qty: -2, px: 50, side: '' }).qty).toBe(-2)
    expect(normalizeFill({ ...BUY, id: undefined, fillId: 'v1' }).id).toBe('v1')
    expect(normalizeFill({ ...BUY, id: undefined, tradeId: 't1' }).id).toBe('t1')

    expect(normalizeFill({ ...BUY, qty: 0 })).toBeNull()
    expect(normalizeFill({ ...BUY, px: 0 })).toBeNull()
    expect(normalizeFill(null)).toBeNull()
  })
})

describe('splitCrossingFill', () => {
  it('divides a flip into a close and an open, and the fee with it', () => {
    const fill = { ...normalizeFill(SELL), qty: -3, fee: 3 }

    const { closing, opening } = splitCrossingFill(fill, 1)
    expect(closing).toMatchObject({ qty: -1, fee: 1 })
    // Charging the whole fee to the closing leg would make a crossed round trip look worse
    // than one that was not, which is a difference the trader never made.
    expect(opening).toMatchObject({ qty: -2, fee: 2 })

    // Same direction: nothing to close.
    expect(splitCrossingFill({ ...fill, qty: 2 }, 1).closing).toBeNull()
    expect(splitCrossingFill(fill, 0).closing).toBeNull()
  })
})

describe('matchLots', () => {
  it('takes the oldest lot first and splits one that outlives the exit', () => {
    const open = [
      { instrument: 'BTC-USDT', qty: 2, px: 100, fee: 2, ts: 1 },
      { instrument: 'BTC-USDT', qty: 1, px: 110, fee: 1, ts: 2 },
    ]

    const partial = matchLots(open, { qty: -1 })
    expect(partial.matched).toEqual([{ instrument: 'BTC-USDT', qty: 1, px: 100, fee: 1, ts: 1 }])
    // The remainder carries forward: a scalp scaled out in three pieces is one trade.
    expect(partial.rest[0]).toMatchObject({ qty: 1, fee: 1, ts: 1 })

    const across = matchLots(open, { qty: -3 })
    expect(across.matched.map((lot) => lot.ts)).toEqual([1, 2])
    expect(across.rest).toEqual([])

    // More exit than there is position: the excess is reported, not silently eaten.
    expect(matchLots(open, { qty: -5 }).unfilled).toBe(2)

    // Nothing open, or nothing asked for: neither is an error.
    expect(matchLots(null, { qty: -1 }).matched).toEqual([])
    expect(matchLots(open, null).matched).toEqual([])
  })
})

describe('makeTrade', () => {
  it('weights the entry by quantity and books gross and net apart', () => {
    const matched = [
      { instrument: 'BTC-USDT', qty: 1, px: 100, fee: 1, ts: 10 },
      { instrument: 'BTC-USDT', qty: 3, px: 120, fee: 3, ts: 12 },
    ]

    const trade = makeTrade(matched, { qty: -4, px: 130, fee: 4, ts: 20 })
    expect(trade).toMatchObject({ side: 'long', qty: 4, entryPx: 115, exitPx: 130, fees: 8 })
    // Gross says whether the idea worked; net says whether it paid. On a scalping desk
    // those diverge constantly, so both are kept.
    expect(trade.pnl).toBe(60)
    expect(trade.net).toBe(52)

    const short = makeTrade([{ instrument: 'X', qty: -1, px: 100, fee: 0, ts: 1 }], { px: 90, qty: 1 })
    expect(short).toMatchObject({ side: 'short', pnl: 10 })

    expect(makeTrade([], {})).toBeNull()
    expect(makeTrade(null, {})).toBeNull()
    expect(makeTrade([{ instrument: 'X', qty: 0, px: 1, fee: 0, ts: 1 }], {})).toBeNull()
  })
})

describe('pairFills', () => {
  it('pairs a round trip once, however many times the venue re-sends it', () => {
    expect(pairFills([BUY])).toEqual([])
    expect(openLots()).toHaveLength(1)

    const closed = pairFills([SELL])
    tick()
    expect(closed).toHaveLength(1)
    expect(closed[0]).toMatchObject({ instrument: 'BTC-USDT', qty: 1, pnl: 10 })
    expect(appState.journal.count).toBe(1)

    // A reconnect replays recent executions. Without the id set one dropped frame doubles
    // the day's trade count, and the trader cannot tell which half is real.
    expect(pairFills([BUY, SELL])).toEqual([])
    expect(journalTrades()).toHaveLength(1)

    // A sell with nothing open is a new short, not a trade: it opens rather than closes.
    expect(pairFills([{ ...SELL, id: 'short1' }])).toEqual([])
    expect(openLots()).toHaveLength(1)

    expect(pairFills(null)).toEqual([])
    expect(pairFills([{ ...BUY, id: 'junk', px: 0 }])).toEqual([])
  })
})

describe('journalTrades', () => {
  it('reads the completed round trips back, oldest first', () => {
    expect(journalTrades()).toEqual([])

    pairFills([BUY, SELL])
    expect(journalTrades()).toHaveLength(1)
    expect(TRADE_CAP).toBeGreaterThan(100)
  })
})

describe('openLots', () => {
  it('shows the half-open scalp across every instrument', () => {
    pairFills([BUY, { ...BUY, id: 'f9', instrument: 'ETH-USDT', qty: 2 }])

    expect(openLots()).toHaveLength(2)
    expect(openLots().map((lot) => lot.instrument)).toEqual(['BTC-USDT', 'ETH-USDT'])
  })
})

describe('saveOpenLots', () => {
  it('keeps the seen ids with the lots, or a reconnect replays the day', () => {
    pairFills([BUY])
    const storage = fakeStorage()

    expect(saveOpenLots(storage)).toBe(true)
    const stored = JSON.parse(storage.map.get(LOTS_KEY))
    expect(stored.lots[0][0]).toBe('BTC-USDT')
    expect(stored.seen).toContain('f1')

    expect(saveOpenLots(fakeStorage(true))).toBe(false)
  })
})

describe('loadOpenLots', () => {
  it('restores a scalp that was open when the tab reloaded', () => {
    pairFills([BUY])
    const storage = fakeStorage()
    saveOpenLots(storage)
    resetJournal()

    expect(loadOpenLots(storage)).toHaveLength(1)
    // And the ids came back with them, so the replayed entry does not reopen the lot.
    expect(pairFills([BUY])).toEqual([])
    expect(pairFills([SELL])).toHaveLength(1)

    // Corrupt storage degrades to an empty journal rather than stopping the desk booting.
    // A payload of the right shape but the wrong contents is the same as none.
    storage.map.set(LOTS_KEY, JSON.stringify({ lots: 'nope', seen: 'nope' }))
    expect(loadOpenLots(storage)).toEqual([])

    storage.map.set(LOTS_KEY, '{not json')
    expect(loadOpenLots(storage)).toEqual([])
    expect(loadOpenLots(fakeStorage(true))).toEqual([])
  })
})

describe('onJournalFill', () => {
  it('folds one live fill and publishes the close', () => {
    onJournalFill({ ...BUY, id: 'live1' })
    const closed = onJournalFill({ ...SELL, id: 'live2' })
    tick()

    expect(closed).toHaveLength(1)
    expect(appState.journal.last.pnl).toBe(10)
    expect(appState.journal.trades[0].instrument).toBe('BTC-USDT')
  })
})

describe('resetJournal', () => {
  it('forgets the lots, the ids and the trades together', () => {
    pairFills([BUY, SELL])

    expect(resetJournal()).toBe(true)
    tick()
    expect(journalState()).toEqual({ trades: 0, open: 0, seen: 0 })
    expect(appState.journal.trades).toEqual([])
  })
})

describe('journalState', () => {
  it('counts what the journal is holding', () => {
    pairFills([BUY])
    expect(journalState()).toEqual({ trades: 0, open: 1, seen: 1 })
  })
})
