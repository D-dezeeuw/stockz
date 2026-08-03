import { describe, it, expect } from 'vitest'
import {
  NAMESPACES,
  PERSISTED_NAMESPACES,
  PATHS,
  buildPath,
  assertKnownNamespace,
  isPersisted,
} from './paths.js'
import { initialState } from './initial.js'

describe('buildPath', () => {
  it('composes dotted paths, drops empty segments and rejects unknown namespaces', () => {
    expect(buildPath('market', 'book', 'BTC-USDT')).toBe('market.book.BTC-USDT')
    expect(buildPath('trade')).toBe('trade')
    expect(buildPath('ui', '', 'modal', null)).toBe('ui.modal')
    expect(() => buildPath('secrets', 'okxKey')).toThrow(/unknown state namespace/)
  })
})

describe('assertKnownNamespace', () => {
  it('accepts declared namespaces and full paths, and names the offender otherwise', () => {
    for (const ns of NAMESPACES) expect(assertKnownNamespace(ns)).toBe(ns)
    expect(assertKnownNamespace('trade.dayPnl')).toBe('trade')

    expect(() => assertKnownNamespace('vault.key')).toThrow(/"vault"/)
    expect(() => assertKnownNamespace('')).toThrow(/unknown state namespace/)
    expect(() => assertKnownNamespace(undefined)).toThrow(/unknown state namespace/)
  })
})

describe('isPersisted', () => {
  it('marks only settings as persisted, keeping market and trade data out of storage', () => {
    expect(isPersisted('settings')).toBe(true)
    expect(isPersisted('settings.theme')).toBe(true)

    expect(isPersisted('market.ticks')).toBe(false)
    expect(isPersisted('trade.positions')).toBe(false)
    expect(isPersisted('ui.modal')).toBe(false)
    expect(isPersisted(undefined)).toBe(false)

    expect(PERSISTED_NAMESPACES).toEqual(['settings'])
  })
})

describe('PATHS', () => {
  it('declares exactly the paths the boot tree seeds, and is frozen', () => {
    const declared = Object.values(PATHS)
      .flatMap((group) => Object.values(group))
      .sort()
    expect(declared).toEqual(Object.keys(initialState()).sort())

    // Every declared path validates against its own namespace guard.
    for (const path of declared) expect(() => assertKnownNamespace(path)).not.toThrow()

    expect(Object.isFrozen(PATHS)).toBe(true)
    expect(Object.isFrozen(PATHS.trade)).toBe(true)
    expect(Object.isFrozen(NAMESPACES)).toBe(true)
  })
})
