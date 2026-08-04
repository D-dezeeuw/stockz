import { describe, it, expect } from 'vitest'
import { noopStrategy } from './noop.js'
import { NEUTRAL_SIGNAL } from '../contract.js'

describe('noopStrategy', () => {
  it('proves the contract holds end to end, so a framework fault is never mistaken for a bad idea', () => {
    expect(noopStrategy.id).toBe('noop')
    expect(Object.isFrozen(noopStrategy)).toBe(true)

    expect(noopStrategy.init({ now: 1000 })).toEqual({ startedAt: 1000 })
    expect(noopStrategy.onTick()).toEqual(NEUTRAL_SIGNAL)
    expect(noopStrategy.onCandle()).toEqual(NEUTRAL_SIGNAL)
    expect(noopStrategy.params.label).toEqual({ default: 'noop' })
  })
})
