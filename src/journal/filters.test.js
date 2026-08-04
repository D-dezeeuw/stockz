import { describe, it, expect, beforeEach } from 'vitest'
import {
  SORT_KEYS,
  OUTCOMES,
  matchesFilters,
  filterTrades,
  sortTrades,
  journalInstruments,
  refreshFiltered,
  setFilter,
  toggleSort,
  clearFilters,
  registerFilterActions,
} from './filters.js'
import { ACTIONS } from '../actions/names.js'
import { clearActions } from '../actions/registry.js'
import { appState, tick, resetState } from '../app/engine.js'

const ROWS = [
  { id: 'a', instrument: 'BTC-USDT', net: 5, hold: 3000, closeTs: 300, tags: ['plan'] },
  { id: 'b', instrument: 'ETH-USDT', net: -2, hold: 9000, closeTs: 200, tags: ['fomo'] },
  { id: 'c', instrument: 'BTC-USDT', net: 0, hold: 1000, closeTs: 100, tags: ['fomo', 'plan'] },
]

beforeEach(() => {
  resetState()
  clearActions()
})

describe('matchesFilters', () => {
  it('treats a scratch as neither a win nor a loss', () => {
    expect(matchesFilters(ROWS[0], {})).toBe(true)
    expect(matchesFilters(ROWS[0], { instrument: 'BTC-USDT' })).toBe(true)
    expect(matchesFilters(ROWS[0], { instrument: 'ETH-USDT' })).toBe(false)
    expect(matchesFilters(ROWS[1], { tag: 'fomo' })).toBe(true)
    expect(matchesFilters(ROWS[1], { tag: 'plan' })).toBe(false)

    // Calling a scratch a win is how a win-rate becomes a number that flatters rather than
    // informs.
    expect(matchesFilters(ROWS[2], { outcome: 'wins' })).toBe(false)
    expect(matchesFilters(ROWS[2], { outcome: 'losses' })).toBe(false)
    expect(matchesFilters(ROWS[2], { outcome: 'all' })).toBe(true)
    expect(OUTCOMES).toContain('wins')
  })
})

describe('filterTrades', () => {
  it('ANDs the filters, because that is the question people actually ask', () => {
    expect(filterTrades(ROWS, {})).toHaveLength(3)

    // "Losses tagged fomo" is a real question; "losses or fomo" is not one anybody asks.
    expect(filterTrades(ROWS, { tag: 'fomo', outcome: 'losses' }).map((row) => row.id)).toEqual(['b'])
    expect(filterTrades(ROWS, { instrument: 'BTC-USDT', tag: 'plan' }).map((row) => row.id)).toEqual([
      'a',
      'c',
    ])

    expect(filterTrades(null, {})).toEqual([])
  })
})

describe('sortTrades', () => {
  it('copies rather than reordering the journal itself', () => {
    const original = [...ROWS]

    expect(sortTrades(ROWS, 'net', 'desc').map((row) => row.id)).toEqual(['a', 'c', 'b'])
    expect(sortTrades(ROWS, 'net', 'asc').map((row) => row.id)).toEqual(['b', 'c', 'a'])
    expect(sortTrades(ROWS, 'hold', 'desc')[0].id).toBe('b')

    // Sorting the caller's array in place would reorder the record itself.
    expect(ROWS).toEqual(original)

    // An unknown key falls back to time rather than to an arbitrary order.
    expect(sortTrades(ROWS, 'nonsense').map((row) => row.id)).toEqual(['a', 'b', 'c'])
    expect(SORT_KEYS).toContain('net')
  })
})

describe('journalInstruments', () => {
  it('lists what the filter can offer, with no blanks', () => {
    expect(journalInstruments(ROWS)).toEqual(['BTC-USDT', 'ETH-USDT'])
    expect(journalInstruments([{ instrument: '' }, {}])).toEqual([])
    expect(journalInstruments(null)).toEqual([])
  })
})

describe('refreshFiltered', () => {
  it('publishes what was hidden, not only what is shown', () => {
    const visible = refreshFiltered(ROWS, { outcome: 'wins' })
    tick()

    expect(visible.map((row) => row.id)).toEqual(['a'])
    // A filter that quietly matched nothing looks exactly like a day with no trades.
    expect(appState.journal.hidden).toBe(2)
    expect(appState.journal.instruments).toEqual(['BTC-USDT', 'ETH-USDT'])
  })
})

describe('setFilter', () => {
  it('makes every chip its own off switch', () => {
    refreshFiltered(ROWS, {})

    expect(setFilter('tag', 'fomo').tag).toBe('fomo')
    tick()
    // Re-selecting the active value clears it, so no filter needs a second control to undo.
    expect(setFilter('tag', 'fomo').tag).toBe('')

    expect(setFilter('nonsense', 'x')).toBeDefined()
  })
})

describe('toggleSort', () => {
  it('starts descending, because the interesting end of every column is the top', () => {
    expect(toggleSort('net')).toMatchObject({ sort: 'net', dir: 'desc' })
    tick()
    expect(toggleSort('net')).toMatchObject({ sort: 'net', dir: 'asc' })

    // A new column starts over rather than inheriting the last one's direction.
    expect(toggleSort('hold')).toMatchObject({ sort: 'hold', dir: 'desc' })
    expect(toggleSort('nonsense').sort).toBe('closeTs')
  })
})

describe('clearFilters', () => {
  it('goes back to every trade, newest first', () => {
    setFilter('tag', 'fomo')

    expect(clearFilters()).toEqual({
      instrument: '',
      tag: '',
      outcome: 'all',
      sort: 'closeTs',
      dir: 'desc',
    })
    tick()
    expect(appState.journal.filters.tag).toBe('')
  })
})

describe('registerFilterActions', () => {
  it('binds the chips, the columns and the reset', () => {
    expect(registerFilterActions()).toEqual([
      ACTIONS.journal.filter,
      ACTIONS.journal.sort,
      ACTIONS.journal.clearFilters,
    ])
  })
})
