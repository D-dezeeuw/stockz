// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  AUTO_LIST_ID,
  AUTO_LIST_NAME,
  AUTO_LIMIT,
  QUOTE_MS,
  RERANK_MS,
  autoEnabled,
  commitAutoList,
  refreshBlueChips,
  buildWatchRows,
  refreshQuotes,
  toggleAutoWatchlist,
  registerWatchActions,
  startWatchlist,
} from './watch.js'
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

describe('commitAutoList', () => {
  it('rebuilds its own list, leads with it, and never touches a hand-made one', () => {
    commitLists([{ id: 'mine', name: 'Mine', symbols: ['okx:PEPE-USDT'] }])
    tick()

    commitAutoList(['BTC-USDT', 'ETH-USDT'])
    tick()

    const lists = currentLists()
    // The desk's list leads: it is the one kept current, so it is the one a trader
    // opening the desk should be looking at.
    expect(lists[0]).toMatchObject({ id: AUTO_LIST_ID, name: AUTO_LIST_NAME })
    expect(lists[0].symbols).toEqual(['okx:BTC-USDT', 'okx:ETH-USDT'])
    expect(appState.settings.activeListId).toBe(AUTO_LIST_ID)

    // "The desk manages a list for you" must not mean "the desk edits your lists".
    expect(lists.find((l) => l.id === 'mine').symbols).toEqual(['okx:PEPE-USDT'])

    // A rebuild replaces its own membership rather than appending a second copy.
    commitAutoList(['SOL-USDT'])
    tick()
    expect(currentLists().filter((l) => l.id === AUTO_LIST_ID)).toHaveLength(1)
    expect(currentLists()[0].symbols).toEqual(['okx:SOL-USDT'])

    // Nothing to commit changes nothing, rather than emptying the watchlist.
    commitAutoList([])
    tick()
    expect(currentLists()[0].symbols).toEqual(['okx:SOL-USDT'])
  })
})

describe('refreshBlueChips', () => {
  it('ranks the list from live volume and keeps what it has when the venue is down', async () => {
    expect(await refreshBlueChips({ fetch: serving(TICKERS) })).toEqual({
      ok: true,
      symbols: ['BTC-USDT', 'ETH-USDT', 'SOL-USDT'],
    })
    tick()
    expect(currentLists()[0].symbols).toEqual(['okx:BTC-USDT', 'okx:ETH-USDT', 'okx:SOL-USDT'])

    // Emptying the watchlist because the venue had a bad second would take the desk's
    // instruments away over a hiccup.
    const dead = await refreshBlueChips({
      fetch: async () => {
        throw new Error('offline')
      },
    })
    expect(dead.ok).toBe(false)
    tick()
    expect(currentLists()[0].symbols).toHaveLength(3)

    const nothing = await refreshBlueChips({ fetch: serving([]) })
    expect(nothing).toMatchObject({ ok: false, error: 'no tradeable pairs' })

    // Switched off, the desk does not touch the list at all.
    setValue(PATHS.settings.autoWatchlist, false)
    tick()
    expect(await refreshBlueChips({ fetch: serving(TICKERS) })).toMatchObject({ ok: false })
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
    commitAutoList(['BTC-USDT', 'ETH-USDT'])
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

    // Quotes tick fast; membership changes on the quarter-hour. A watchlist that
    // reshuffles while being read is unusable however current it is.
    expect(timers.map(([, ms]) => ms)).toEqual([QUOTE_MS, RERANK_MS])
    expect(QUOTE_MS).toBeLessThan(RERANK_MS)
    expect(AUTO_LIMIT).toBe(8)

    // Ranked and quoted before the first paint rather than a tick later.
    await new Promise((resolve) => setTimeout(resolve, 0))
    tick()
    expect(appState.market.watchRows.length).toBeGreaterThan(0)

    expect(() => stop()).not.toThrow()
    expect(() => startWatchlist({ timer: {} })()).not.toThrow()
  })
})
