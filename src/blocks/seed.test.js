// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { DEFAULT_BLOCKS, seedBlocks, missingBlocks } from './seed.js'
import { commitBlocks, currentBlocks } from './registry.js'
import { tick, resetState } from '../app/engine.js'

beforeEach(() => {
  resetState()
})

describe('seedBlocks', () => {
  it('fills an empty registry but never tramples a layout the trader arranged', () => {
    const seeded = seedBlocks()
    tick()

    expect(seeded).toHaveLength(DEFAULT_BLOCKS.length)
    expect(seeded.map((b) => b.id)).toContain('ticket')
    expect(seeded[0].order).toBe(0)

    // A returning trader keeps their own arrangement — and *gains* anything shipped since
    // their last visit. This used to return the saved layout untouched, which froze it at
    // the shape it had on the trader's first ever load: every block added afterwards was
    // seeded into an object nobody consulted again, so the feature existed, rendered
    // nowhere, and looked like it had failed to build.
    commitBlocks([{ id: 'mine', title: 'Mine', order: 0 }])
    tick()
    const merged = seedBlocks()
    tick()
    expect(merged[0].id).toBe('mine')
    expect(merged.map((b) => b.id)).toContain('trader')
    expect(merged).toHaveLength(DEFAULT_BLOCKS.length + 1)

    // Idempotent: a second boot adds nothing, so the layout does not grow per reload.
    expect(seedBlocks()).toHaveLength(DEFAULT_BLOCKS.length + 1)

    // ...unless a reset explicitly asks for the defaults back.
    const forced = seedBlocks(true)
    tick()
    expect(forced).toHaveLength(DEFAULT_BLOCKS.length)
    expect(currentBlocks()).toHaveLength(DEFAULT_BLOCKS.length)
  })
})

describe('missingBlocks', () => {
  it('reports defaults a saved layout has never seen, and nothing else', () => {
    expect(missingBlocks([])).toHaveLength(DEFAULT_BLOCKS.length)
    expect(missingBlocks(DEFAULT_BLOCKS)).toEqual([])

    // Matched on id alone. A trader who hid or moved a block has *seen* it, so re-adding
    // it would undo a deliberate choice on every single deploy.
    const hidden = DEFAULT_BLOCKS.map((b) => ({ ...b, hidden: true, order: 99 }))
    expect(missingBlocks(hidden)).toEqual([])

    const stale = DEFAULT_BLOCKS.filter((b) => b.id !== 'trader')
    expect(missingBlocks(stale).map((b) => b.id)).toEqual(['trader'])

    expect(missingBlocks(undefined)).toHaveLength(DEFAULT_BLOCKS.length)
  })
})
