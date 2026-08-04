// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  BLOCK_STATUS,
  makeBlock,
  addBlock,
  removeBlock,
  updateBlock,
  reorderBlock,
  sortBlocks,
  visibleBlocks,
  toggleBlock,
  currentBlocks,
  commitBlocks,
  setBlockStatus,
} from './registry.js'
import { appState, tick, resetState } from '../app/engine.js'

const ids = (blocks) => blocks.map((b) => b.id)

beforeEach(() => {
  resetState()
})

describe('makeBlock', () => {
  it('fills in every field the grid relies on and rejects a block with no id', () => {
    expect(makeBlock({ id: 'ladder' })).toEqual({
      id: 'ladder',
      title: 'ladder',
      status: BLOCK_STATUS.loading,
      visible: true,
      order: 0,
      icon: '',
      error: '',
    })

    const full = makeBlock({
      id: 'pnl',
      title: 'Day PnL',
      status: 'ready',
      visible: false,
      order: 3,
      icon: 'chart',
    })
    expect(full.title).toBe('Day PnL')
    expect(full.status).toBe('ready')
    expect(full.visible).toBe(false)
    expect(full.order).toBe(3)

    // Unknown status degrades to loading rather than rendering an undefined state.
    expect(makeBlock({ id: 'x', status: 'nonsense' }).status).toBe(BLOCK_STATUS.loading)
    expect(makeBlock({ id: '  ' })).toBeNull()
    expect(makeBlock(null)).toBeNull()
  })
})

describe('addBlock', () => {
  it('adds a block and replaces rather than duplicates an existing id', () => {
    const one = addBlock([], { id: 'tape', order: 1 })
    expect(ids(one)).toEqual(['tape'])

    const two = addBlock(one, { id: 'book', order: 0 })
    expect(ids(two)).toEqual(['book', 'tape'])

    // A hot reload must not leave two ladders fighting over one feed.
    const replaced = addBlock(two, { id: 'tape', title: 'Time & Sales', order: 1 })
    expect(replaced).toHaveLength(2)
    expect(replaced.find((b) => b.id === 'tape').title).toBe('Time & Sales')

    expect(addBlock([], { id: '' })).toEqual([])
    expect(addBlock(null, { id: 'a' })).toHaveLength(1)
  })
})

describe('removeBlock', () => {
  it('drops the named block and leaves the rest alone', () => {
    const blocks = addBlock(addBlock([], { id: 'a' }), { id: 'b' })

    expect(ids(removeBlock(blocks, 'a'))).toEqual(['b'])
    expect(ids(removeBlock(blocks, 'missing'))).toEqual(['a', 'b'])
    expect(removeBlock(null, 'a')).toEqual([])
  })
})

describe('updateBlock', () => {
  it('patches one block without touching the others or its id', () => {
    const blocks = addBlock(addBlock([], { id: 'a', title: 'A' }), { id: 'b', title: 'B' })
    const patched = updateBlock(blocks, 'a', { status: 'error', error: 'feed lost' })

    expect(patched.find((b) => b.id === 'a')).toMatchObject({
      status: 'error',
      error: 'feed lost',
      title: 'A',
    })
    expect(patched.find((b) => b.id === 'b').title).toBe('B')

    // The id is not patchable — it is the identity the grid keys on.
    expect(ids(updateBlock(blocks, 'a', { id: 'hijacked' }))).toEqual(['a', 'b'])
    expect(updateBlock(null, 'a', {})).toEqual([])
  })
})

describe('setBlockStatus', () => {
  it('commits a status change, and writes nothing when there is none to make', () => {
    commitBlocks([{ id: 'watchlist', title: 'Watchlist', status: 'empty' }])
    tick()

    // The committing counterpart to updateBlock, which is pure and so reached nothing on
    // its own — every block was stuck on whatever seed.js declared.
    expect(setBlockStatus('watchlist', 'ready')).toBe(true)
    tick()
    expect(currentBlocks()[0].status).toBe('ready')

    // No write when nothing changes: this runs on every quote refresh, and a needless
    // setValue re-renders every block in the grid.
    expect(setBlockStatus('watchlist', 'ready')).toBe(false)
    expect(setBlockStatus('nosuchblock', 'ready')).toBe(false)
  })
})

describe('sortBlocks', () => {
  it('orders by order then id, deterministically, without mutating the input', () => {
    const input = [
      { id: 'z', order: 1 },
      { id: 'a', order: 1 },
      { id: 'm', order: 0 },
    ]
    const sorted = sortBlocks(input)

    expect(ids(sorted)).toEqual(['m', 'a', 'z'])
    expect(ids(input)).toEqual(['z', 'a', 'm'])
    expect(sortBlocks(null)).toEqual([])
  })
})

describe('reorderBlock', () => {
  it('moves a block and renumbers the rest contiguously', () => {
    const blocks = sortBlocks([
      { id: 'a', order: 0 },
      { id: 'b', order: 1 },
      { id: 'c', order: 2 },
    ])

    expect(ids(reorderBlock(blocks, 'c', 0))).toEqual(['c', 'a', 'b'])
    expect(reorderBlock(blocks, 'c', 0).map((b) => b.order)).toEqual([0, 1, 2])

    // Out-of-range destinations clamp instead of dropping the block.
    expect(ids(reorderBlock(blocks, 'a', 99))).toEqual(['b', 'c', 'a'])
    expect(ids(reorderBlock(blocks, 'a', -5))).toEqual(['a', 'b', 'c'])
    expect(ids(reorderBlock(blocks, 'missing', 0))).toEqual(['a', 'b', 'c'])
  })
})

describe('visibleBlocks', () => {
  it('returns only what the grid should render, in order', () => {
    const blocks = [
      { id: 'a', order: 1, visible: true },
      { id: 'b', order: 0, visible: false },
      { id: 'c', order: 2 },
    ]

    expect(ids(visibleBlocks(blocks))).toEqual(['a', 'c'])
    expect(visibleBlocks(null)).toEqual([])
  })
})

describe('toggleBlock', () => {
  it('flips visibility, or sets it explicitly', () => {
    const blocks = addBlock([], { id: 'a' })

    expect(toggleBlock(blocks, 'a')[0].visible).toBe(false)
    expect(toggleBlock(toggleBlock(blocks, 'a'), 'a')[0].visible).toBe(true)
    expect(toggleBlock(blocks, 'a', true)[0].visible).toBe(true)
    expect(toggleBlock(blocks, 'missing')[0].visible).toBe(true)
    expect(toggleBlock(null, 'a')).toEqual([])
  })
})

describe('commitBlocks', () => {
  it('writes the registry into the persisted settings branch, sorted', () => {
    const written = commitBlocks([
      { id: 'b', order: 1 },
      { id: 'a', order: 0 },
    ])
    tick()

    expect(ids(written)).toEqual(['a', 'b'])
    expect(ids(appState.settings.blocks)).toEqual(['a', 'b'])
  })
})

describe('currentBlocks', () => {
  it('reads the registry out of state and never returns undefined', () => {
    expect(currentBlocks()).toEqual([])

    commitBlocks([{ id: 'ladder', order: 0 }])
    tick()
    expect(ids(currentBlocks())).toEqual(['ladder'])
  })
})

describe('commitBlocks normalisation', () => {
  it('normalises on the way in, so the grid can trust every entry', () => {
    const written = commitBlocks([
      { id: 'raw' }, // no status, no visible flag
      { id: '' }, // unusable — must be dropped, not written as a hole
      null,
    ])
    tick()

    expect(written).toHaveLength(1)
    expect(written[0]).toMatchObject({
      id: 'raw',
      status: BLOCK_STATUS.loading,
      visible: true,
      order: 0,
    })
    expect(appState.settings.blocks).toHaveLength(1)
  })
})
