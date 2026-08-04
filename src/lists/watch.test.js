// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  QUOTE_MS,
  autoEnabled,
  seedUniverse,
  buildWatchRows,
  quoteIndex,
  refreshQuotes,
  toggleAutoWatchlist,
  registerWatchActions,
  startWatchlist,
} from './watch.js'
import { UNIVERSE, universeSymbols } from './universe.js'
import { commitLists, currentLists } from './state.js'
import { seedBlocks } from '../blocks/seed.js'
import { currentBlocks } from '../blocks/registry.js'
import { appState, setValue, tick, resetState } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { clearActions, actionNames } from '../actions/registry.js'
import { ACTIONS } from '../actions/names.js'

/** A fetch double serving one OKX tickers payload. */
const serving = (rows) => async () => ({ json: async () => ({ code: '0', data: rows }) })

const TICKERS = [
  { instId: 'BTC-USDT', last: '60000', open24h: '59000', volCcy24h: '900' },
  { instId: 'ETH-USDT', last: '2000', open24h: '2100', volCcy24h: '500' },
  { instId: 'SOL-USDT', last: '150', open24h: '150', volCcy24h: '100' },
]

beforeEach(() => {
  resetState()
  clearActions()
  commitLists([])
  tick()
})

describe('autoEnabled', () => {
  it('defaults to on, because a desk that needs telling what to watch cannot start alone', () => {
    expect(autoEnabled({})).toBe(true)
    expect(autoEnabled({ settings: {} })).toBe(true)

    // The override: only an explicit false hands the list back to the trader.
    expect(autoEnabled({ settings: { autoWatchlist: false } })).toBe(false)
    expect(autoEnabled({ settings: { autoWatchlist: true } })).toBe(true)
  })
})

describe('seedUniverse', () => {
  it('installs the shipped lists, leads with them, and never touches a hand-made one', () => {
    commitLists([{ id: 'mine', name: 'Mine', symbols: ['okx:PEPE-USDT'] }])
    tick()

    const lists = seedUniverse()
    tick()

    // The desk's lists lead, so a trader opening the desk is looking at one of them.
    expect(lists.map((l) => l.id)).toEqual(['crypto', 'equities', 'mine'])
    expect(lists[0].symbols).toHaveLength(20)
    expect(lists[0].symbols[0]).toBe('okx:BTC-USDT')
    expect(appState.settings.activeListId).toBe('crypto')

    // "The desk keeps a list for you" must not mean "the desk edits your lists".
    expect(lists.find((l) => l.id === 'mine').symbols).toEqual(['okx:PEPE-USDT'])

    // Re-seeding replaces its own lists rather than appending second copies.
    seedUniverse()
    tick()
    expect(currentLists().filter((l) => l.id === 'crypto')).toHaveLength(1)
    expect(currentLists()).toHaveLength(3)

    // Switched off, the desk does not install anything at all.
    commitLists([{ id: 'mine', name: 'Mine', symbols: [] }])
    setValue(PATHS.settings.autoWatchlist, false)
    tick()
    expect(seedUniverse().map((l) => l.id)).toEqual(['mine'])
  })
})

describe('quoteIndex', () => {
  it('normalises a raw ticker payload and drops what cannot be quoted', () => {
    expect(quoteIndex(TICKERS)).toHaveLength(3)
    expect(quoteIndex(TICKERS)[0]).toMatchObject({ symbol: 'BTC-USDT', last: 60000 })

    // Unlike the watchlist itself, this keeps *everything* quotable - the rows decide
    // what they want, and a tokenized equity must not be filtered out as "not a pair".
    expect(quoteIndex([{ instId: 'XNVDA-USDT', last: '10', open24h: '9', volCcy24h: '1' }]))
      .toHaveLength(1)

    expect(quoteIndex([{ instId: 'BAD-USDT', last: '0' }])).toEqual([])
    expect(quoteIndex(null)).toEqual([])
  })
})

describe('buildWatchRows', () => {
  it('quotes each row, marks the focused one, and says when a price is missing', () => {
    const ranked = [
      { symbol: 'BTC-USDT', last: 60000, changePct: 1.7 },
      { symbol: 'ETH-USDT', last: 2000, changePct: -4.8 },
    ]
    const rows = buildWatchRows(
      ['okx:BTC-USDT', 'okx:ETH-USDT', 'okx:NEW-USDT'],
      ranked,
      'okx:ETH-USDT',
    )

    expect(rows[0]).toMatchObject({ symbol: 'BTC-USDT', change: '+1.70%', tone: 'up', active: false })
    expect(rows[1]).toMatchObject({ symbol: 'ETH-USDT', change: '-4.80%', tone: 'down', active: true })

    // An unquoted row says so. Showing 0.00 reads as a real price that happens to be zero.
    expect(rows[2]).toMatchObject({ price: '—', change: '', tone: 'flat' })

    expect(buildWatchRows(['okx:BTC-USDT'], [{ symbol: 'BTC-USDT', last: 1, changePct: 0 }])[0].tone)
      .toBe('flat')
    expect(buildWatchRows(null, null)).toEqual([])
  })
})

describe('refreshQuotes', () => {
  it('publishes the rows and moves the block off the empty state it shipped stuck in', async () => {
    seedBlocks()
    commitLists([{ id: 'crypto', name: 'Crypto 20', symbols: ['okx:BTC-USDT', 'okx:ETH-USDT'] }])
    setValue(PATHS.settings.activeListId, 'crypto')
    tick()

    const rows = await refreshQuotes({ fetch: serving(TICKERS) })
    tick()

    expect(rows.map((r) => r.symbol)).toEqual(['BTC-USDT', 'ETH-USDT'])
    expect(appState.market.watchRows).toHaveLength(2)
    // Nothing ever moved this block off `empty`, so it rendered "nothing to show yet"
    // however much it held.
    expect(currentBlocks().find((b) => b.id === 'watchlist').status).toBe('ready')

    const dead = await refreshQuotes({
      fetch: async () => {
        throw new Error('offline')
      },
    })
    tick()
    // The symbols still render; only the quotes are missing, and the block says so.
    expect(dead[0]).toMatchObject({ symbol: 'BTC-USDT', price: '—' })
    expect(currentBlocks().find((b) => b.id === 'watchlist').status).toBe('error')

    commitLists([])
    setValue(PATHS.settings.activeListId, '')
    tick()
    expect(await refreshQuotes({ fetch: serving(TICKERS) })).toEqual([])
    tick()
    expect(currentBlocks().find((b) => b.id === 'watchlist').status).toBe('empty')
  })
})

describe('toggleAutoWatchlist', () => {
  it('hands the list to the trader and takes it back', () => {
    expect(toggleAutoWatchlist({}, { value: false })).toBe(false)
    tick()
    expect(appState.settings.autoWatchlist).toBe(false)

    // No argument toggles rather than forcing a value.
    expect(toggleAutoWatchlist({})).toBe(true)
    tick()
    expect(autoEnabled()).toBe(true)
  })
})

describe('registerWatchActions', () => {
  it('registers the override so the checkbox and a hotkey can both reach it', () => {
    expect(registerWatchActions()).toEqual([ACTIONS.lists.auto])
    expect(actionNames()).toContain('lists.auto')
  })
})

describe('startWatchlist', () => {
  it('populates once up front, then keeps quotes and membership on separate clocks', async () => {
    const timers = []
    const stop = startWatchlist({
      fetch: serving(TICKERS),
      timer: {
        setInterval: (fn, ms) => {
          timers.push([fn, ms])
          return timers.length
        },
        clearInterval: () => {},
      },
    })

    // One clock: membership is fixed, so only the quotes need re-reading.
    expect(timers.map(([, ms]) => ms)).toEqual([QUOTE_MS])

    // Seeded synchronously, so the very first paint already has forty instruments.
    tick()
    expect(currentLists()[0].symbols).toHaveLength(20)
    expect(universeSymbols()).toHaveLength(40)

    // And quoted without waiting for the first interval to come round.
    await new Promise((resolve) => setTimeout(resolve, 0))
    tick()
    expect(appState.market.watchRows.length).toBe(20)
    expect(UNIVERSE[0].id).toBe('crypto')

    expect(() => stop()).not.toThrow()
    expect(() => startWatchlist({ timer: {} })()).not.toThrow()
  })
})
