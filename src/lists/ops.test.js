import { describe, it, expect } from 'vitest'
import {
  MAX_SYMBOLS,
  listId,
  qualifySymbol,
  createList,
  renameList,
  deleteList,
  addSymbol,
  removeSymbol,
  reorderSymbol,
  findList,
  splitSymbol,
} from './ops.js'

const seed = () => [{ id: 'a', name: 'Majors', symbols: ['okx:BTC-USDT'] }]

describe('listId', () => {
  it('uses the injected generator and still works without Web Crypto', () => {
    expect(listId(() => 'fixed-id')).toBe('fixed-id')

    const first = listId(null)
    const second = listId(null)
    expect(first).not.toBe(second)
    expect(first).toMatch(/^list-\d+$/)
  })
})

describe('qualifySymbol', () => {
  it('venue-qualifies so the same ticker on two venues stays two rows', () => {
    expect(qualifySymbol('btc-usdt')).toBe('okx:BTC-USDT')
    expect(qualifySymbol('AAPL', 'etoro')).toBe('etoro:AAPL')
    expect(qualifySymbol('OKX:btc-usdt')).toBe('okx:BTC-USDT')
    expect(qualifySymbol('  eth-usdt  ')).toBe('okx:ETH-USDT')

    expect(qualifySymbol('')).toBe('')
    expect(qualifySymbol('okx:')).toBe('')
    expect(qualifySymbol(null)).toBe('')
  })
})

describe('createList', () => {
  it('appends a named list with qualified seed symbols', () => {
    const lists = createList([], 'Scalps', { id: 'l1', symbols: ['btc-usdt', ''] })

    expect(lists).toEqual([{ id: 'l1', name: 'Scalps', symbols: ['okx:BTC-USDT'] }])
    expect(createList(lists, 'Second', { id: 'l2' })).toHaveLength(2)

    // A blank name is a mis-click, not a list.
    expect(createList(lists, '   ')).toBe(lists)
    expect(createList(null, 'X', { id: 'l3' })).toHaveLength(1)
  })
})

describe('renameList', () => {
  it('renames one list and refuses a blank name', () => {
    const lists = renameList(seed(), 'a', 'Crypto Majors')
    expect(lists[0].name).toBe('Crypto Majors')

    expect(renameList(seed(), 'a', '  ')[0].name).toBe('Majors')
    expect(renameList(seed(), 'missing', 'X')[0].name).toBe('Majors')
  })
})

describe('deleteList', () => {
  it('never deletes the last list, so a mis-click cannot empty the desk', () => {
    const two = [...seed(), { id: 'b', name: 'Stocks', symbols: [] }]

    expect(deleteList(two, 'a').map((l) => l.id)).toEqual(['b'])

    // The last one stays: an empty desk has no way back except a reset.
    expect(deleteList(seed(), 'a')).toHaveLength(1)
    expect(deleteList([], 'a')).toEqual([])
  })
})

describe('addSymbol', () => {
  it('adds once, qualifies, and stops at the scannable limit', () => {
    const lists = addSymbol(seed(), 'a', 'eth-usdt')
    expect(lists[0].symbols).toEqual(['okx:BTC-USDT', 'okx:ETH-USDT'])

    // Duplicates are silently ignored rather than doubling a row.
    expect(addSymbol(lists, 'a', 'ETH-USDT')[0].symbols).toHaveLength(2)
    expect(addSymbol(lists, 'a', 'AAPL', 'etoro')[0].symbols).toContain('etoro:AAPL')

    const full = { id: 'a', name: 'F', symbols: Array.from({ length: MAX_SYMBOLS }, (_, i) => `okx:S${i}`) }
    expect(addSymbol([full], 'a', 'NEW')[0].symbols).toHaveLength(MAX_SYMBOLS)

    expect(addSymbol(seed(), 'a', '')[0].symbols).toHaveLength(1)
    expect(addSymbol(seed(), 'missing', 'X')[0].symbols).toHaveLength(1)
  })
})

describe('removeSymbol', () => {
  it('drops one symbol and leaves other lists alone', () => {
    const two = [...seed(), { id: 'b', name: 'B', symbols: ['okx:BTC-USDT'] }]
    const after = removeSymbol(two, 'a', 'BTC-USDT')

    expect(after[0].symbols).toEqual([])
    expect(after[1].symbols).toEqual(['okx:BTC-USDT'])
    expect(removeSymbol(seed(), 'a', 'nothing')[0].symbols).toHaveLength(1)
  })
})

describe('reorderSymbol', () => {
  it('moves a row and clamps an out-of-range destination', () => {
    const list = [{ id: 'a', name: 'A', symbols: ['okx:A', 'okx:B', 'okx:C'] }]

    expect(reorderSymbol(list, 'a', 'C', 0)[0].symbols).toEqual(['okx:C', 'okx:A', 'okx:B'])
    expect(reorderSymbol(list, 'a', 'A', 99)[0].symbols).toEqual(['okx:B', 'okx:C', 'okx:A'])
    expect(reorderSymbol(list, 'a', 'A', -5)[0].symbols).toEqual(['okx:A', 'okx:B', 'okx:C'])
    expect(reorderSymbol(list, 'a', 'MISSING', 0)[0].symbols).toHaveLength(3)
  })
})

describe('findList', () => {
  it('falls back to the first list so a block never renders empty', () => {
    const two = [...seed(), { id: 'b', name: 'B', symbols: [] }]

    expect(findList(two, 'b').id).toBe('b')
    // A deleted or stale active id must not blank the block.
    expect(findList(two, 'gone').id).toBe('a')
    expect(findList([], 'a')).toBeNull()
  })
})

describe('splitSymbol', () => {
  it('splits a qualified symbol back into venue and ticker', () => {
    expect(splitSymbol('okx:BTC-USDT')).toEqual({ venue: 'okx', symbol: 'BTC-USDT' })
    expect(splitSymbol('AAPL')).toEqual({ venue: '', symbol: 'AAPL' })
    expect(splitSymbol(null)).toEqual({ venue: '', symbol: '' })
  })
})
