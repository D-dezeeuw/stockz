// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { DEFAULT_BLOCKS, seedBlocks } from './seed.js'
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

    // A returning trader keeps their own arrangement.
    commitBlocks([{ id: 'mine', title: 'Mine', order: 0 }])
    tick()
    expect(seedBlocks().map((b) => b.id)).toEqual(['mine'])

    // ...unless a reset explicitly asks for the defaults back.
    const forced = seedBlocks(true)
    tick()
    expect(forced).toHaveLength(DEFAULT_BLOCKS.length)
    expect(currentBlocks()).toHaveLength(DEFAULT_BLOCKS.length)
  })
})
