import { describe, it, expect } from 'vitest'
import {
  STATUS,
  statusOfValue,
  statusClass,
  valueClass,
  sideClass,
  connectionClass,
  tickPulseClass,
} from './status-color.js'

describe('statusOfValue', () => {
  it('treats zero as flat, never as profit', () => {
    expect(statusOfValue(12.5)).toBe(STATUS.profit)
    expect(statusOfValue(-0.01)).toBe(STATUS.loss)

    // Colouring a flat position green would tell a trader they are making money.
    expect(statusOfValue(0)).toBe(STATUS.flat)
    expect(statusOfValue(-0)).toBe(STATUS.flat)
    expect(statusOfValue(NaN)).toBe(STATUS.flat)
    expect(statusOfValue(undefined)).toBe(STATUS.flat)
  })
})

describe('statusClass', () => {
  it('maps known states to classes and anything else to flat', () => {
    expect(statusClass(STATUS.profit)).toBe('is-profit')
    expect(statusClass(STATUS.danger)).toBe('is-danger')
    expect(statusClass('nonsense')).toBe('is-flat')
    expect(statusClass(undefined)).toBe('is-flat')
  })
})

describe('valueClass', () => {
  it('turns a signed number straight into its class', () => {
    expect(valueClass(42)).toBe('is-profit')
    expect(valueClass(-42)).toBe('is-loss')
    expect(valueClass(0)).toBe('is-flat')
  })
})

describe('sideClass', () => {
  it('shares one colour language with profit and loss', () => {
    expect(sideClass('buy')).toBe('is-buy')
    expect(sideClass('BUY')).toBe('is-buy')
    expect(sideClass('long')).toBe('is-buy')
    expect(sideClass('sell')).toBe('is-sell')
    expect(sideClass('short')).toBe('is-sell')
    expect(sideClass('')).toBe('is-flat')
    expect(sideClass(null)).toBe('is-flat')
  })
})

describe('connectionClass', () => {
  it('maps venue socket states onto LED modifiers', () => {
    expect(connectionClass('live')).toBe('led led--live')
    expect(connectionClass('connected')).toBe('led led--live')
    expect(connectionClass('connecting')).toBe('led led--warn')
    expect(connectionClass('stale')).toBe('led led--warn')
    expect(connectionClass('dead')).toBe('led led--dead')
    expect(connectionClass('error')).toBe('led led--dead')
    expect(connectionClass('unknown')).toBe('led')
  })
})

describe('tickPulseClass', () => {
  it('pulses only on a real move, in the direction of the move', () => {
    expect(tickPulseClass(101, 100)).toBe('tick-up')
    expect(tickPulseClass(99, 100)).toBe('tick-down')
    expect(tickPulseClass(100, 100)).toBe('')
    expect(tickPulseClass(100, NaN)).toBe('')
    expect(tickPulseClass(undefined, 100)).toBe('')
  })
})
