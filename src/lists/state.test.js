// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  currentLists,
  commitLists,
  activeList,
  setActiveList,
  focusSymbol,
  addToList,
  removeFromList,
  moveInList,
  manageList,
  registerListActions,
} from './state.js'
import { appState, setValue, tick, resetState } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { clearActions, actionNames, dispatchAction } from '../actions/registry.js'
import { ACTIONS } from '../actions/names.js'

/** The two lists these tests exercise, committed locally rather than by a seeder. */
function seedLists() {
  return commitLists([
    { id: 'majors', name: 'OKX Majors', symbols: ['okx:BTC-USDT', 'okx:ETH-USDT', 'okx:SOL-USDT'] },
    { id: 'alts', name: 'Fast Alts', symbols: ['okx:DOGE-USDT', 'okx:PEPE-USDT'] },
  ])
}

beforeEach(() => {
  resetState()
  clearActions()
})

describe('commitLists', () => {
  it('writes lists into the persisted settings branch', () => {
    commitLists([{ id: 'a', name: 'A', symbols: [] }])
    tick()
    expect(appState.settings.watchlists).toHaveLength(1)
    expect(commitLists(null)).toEqual([])
  })
})

describe('currentLists', () => {
  it('reads lists and never returns undefined', () => {
    expect(currentLists()).toEqual([])
    commitLists([{ id: 'a', name: 'A', symbols: [] }])
    tick()
    expect(currentLists()).toHaveLength(1)
  })
})

describe('activeList', () => {
  it('falls back to the first list when the active id is stale', () => {
    seedLists()
    tick()

    setValue(PATHS.settings.activeListId, 'alts')
    tick()
    expect(activeList().id).toBe('alts')

    setValue(PATHS.settings.activeListId, 'deleted-list')
    tick()
    expect(activeList().id).toBe('majors')
  })
})

describe('setActiveList', () => {
  it('switches lists and refuses an id that does not exist', () => {
    seedLists()
    tick()

    expect(setActiveList({}, { id: 'alts' })).toBe('alts')
    tick()
    expect(appState.settings.activeListId).toBe('alts')

    // Unknown ids resolve to the first list rather than blanking the block.
    expect(setActiveList({}, { id: 'nope' })).toBe('majors')
  })
})

describe('focusSymbol', () => {
  it('sets what the ticket, chart and book all follow', () => {
    expect(focusSymbol({}, { symbol: 'eth-usdt' })).toBe('okx:ETH-USDT')
    tick()
    expect(appState.market.focus).toBe('okx:ETH-USDT')

    // A blank symbol keeps the current focus rather than pointing at nothing.
    expect(focusSymbol({}, { symbol: '' })).toBe('okx:ETH-USDT')
  })
})

describe('addToList', () => {
  it('adds to the active list by default', () => {
    seedLists()
    setValue(PATHS.settings.activeListId, 'alts')
    tick()

    addToList({}, { symbol: 'wif-usdt' })
    tick()
    expect(currentLists().find((l) => l.id === 'alts').symbols).toContain('okx:WIF-USDT')

    addToList({}, { symbol: 'AAPL', venue: 'etoro', listId: 'majors' })
    tick()
    expect(currentLists().find((l) => l.id === 'majors').symbols).toContain('etoro:AAPL')
  })
})

describe('removeFromList', () => {
  it('removes from the active list', () => {
    seedLists()
    setValue(PATHS.settings.activeListId, 'majors')
    tick()

    removeFromList({}, { symbol: 'BTC-USDT' })
    tick()
    expect(currentLists()[0].symbols).not.toContain('okx:BTC-USDT')
  })
})

describe('moveInList', () => {
  it('reorders a row within the active list', () => {
    seedLists()
    setValue(PATHS.settings.activeListId, 'majors')
    tick()

    moveInList({}, { symbol: 'SOL-USDT', toIndex: 0 })
    tick()
    expect(currentLists()[0].symbols[0]).toBe('okx:SOL-USDT')
  })
})

describe('manageList', () => {
  it('creates, renames and deletes lists through one action', () => {
    seedLists()
    tick()

    manageList({}, { op: 'create', name: 'Scalps' })
    tick()
    expect(currentLists()).toHaveLength(3)

    manageList({}, { op: 'rename', id: 'alts', name: 'Volatile' })
    tick()
    expect(currentLists().find((l) => l.id === 'alts').name).toBe('Volatile')

    manageList({}, { op: 'delete', id: 'alts' })
    tick()
    expect(currentLists().map((l) => l.id)).not.toContain('alts')

    expect(manageList({}, { op: 'nonsense' })).toHaveLength(2)
  })
})

describe('registerListActions', () => {
  it('registers every watchlist action so rows and hotkeys share one path', () => {
    expect(registerListActions()).toHaveLength(6)
    expect(actionNames()).toContain('lists.focus')

    seedLists()
    tick()
    dispatchAction(ACTIONS.lists.focus, { symbol: 'btc-usdt' })
    tick()
    expect(appState.market.focus).toBe('okx:BTC-USDT')
  })
})
