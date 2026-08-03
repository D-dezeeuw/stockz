import { describe, it, expect } from 'vitest'
import {
  FIELD_KINDS,
  SETTINGS_SCHEMA,
  SETTINGS_GROUPS,
  defaultSettings,
  fieldFor,
  coerceSetting,
  normalizeSettings,
  parseList,
} from './settings-schema.js'

describe('defaultSettings', () => {
  it('is a scalper default set, fresh on every call', () => {
    const defaults = defaultSettings()

    // A new user's first click must not be a live order.
    expect(defaults.defaultMode).toBe('paper')
    expect(defaults.soundEnabled).toBe(true)
    expect(defaults.defaultSize).toBe(0.01)
    expect(defaults.maxDailyLoss).toBe(100)
    expect(defaults.blocks).toEqual([])

    // Never shared: a poisoned default object would survive every reset.
    defaults.blocks.push('mutated')
    expect(defaultSettings().blocks).toEqual([])
  })
})

describe('fieldFor', () => {
  it('finds real settings and refuses invented ones', () => {
    expect(fieldFor('defaultSize')).toMatchObject({ kind: 'number', group: 'trading' })
    expect(fieldFor('theme').options).toEqual(['night', 'day'])
    expect(fieldFor('notASetting')).toBeNull()

    // Every declared field is renderable and lives in a known group.
    for (const field of SETTINGS_SCHEMA) {
      expect(FIELD_KINDS).toContain(field.kind)
      expect(SETTINGS_GROUPS).toContain(field.group)
    }
  })
})

describe('coerceSetting', () => {
  it('bounds numbers and falls back rather than storing junk', () => {
    expect(coerceSetting('defaultSize', '0.25')).toBe(0.25)
    expect(coerceSetting('defaultSize', -5)).toBe(0)

    // A malformed loss limit silently becoming NaN would disable a circuit breaker.
    expect(coerceSetting('maxDailyLoss', 'abc')).toBe(100)

    expect(coerceSetting('soundEnabled', 'false')).toBe(false)
    expect(coerceSetting('soundEnabled', 'true')).toBe(true)
    expect(coerceSetting('soundEnabled', 'maybe')).toBe(true)

    expect(coerceSetting('theme', 'day')).toBe('day')
    expect(coerceSetting('theme', 'neon')).toBe('night')

    expect(coerceSetting('favourites', 'BTC-USDT')).toBe('BTC-USDT')
    expect(coerceSetting('favourites', null)).toBe('BTC-USDT,ETH-USDT')
    expect(coerceSetting('notASetting', 'x')).toBeUndefined()
  })
})

describe('normalizeSettings', () => {
  it('returns a complete valid object and drops anything not in the schema', () => {
    const normalized = normalizeSettings({
      defaultSize: '0.5',
      theme: 'day',
      evil: 'payload',
      maxDailyLoss: 'nonsense',
    })

    expect(normalized.defaultSize).toBe(0.5)
    expect(normalized.theme).toBe('day')
    expect(normalized.maxDailyLoss).toBe(100)
    expect('evil' in normalized).toBe(false)
    // Missing keys come back as defaults, so the object is always complete.
    expect(normalized.defaultMode).toBe('paper')

    expect(normalizeSettings(null)).toEqual(defaultSettings())
    expect(normalizeSettings({ blocks: [{ id: 'tape' }] }).blocks).toHaveLength(1)
  })
})

describe('parseList', () => {
  it('turns a comma-separated setting into a clean list', () => {
    expect(parseList('0.01, 0.05 ,0.1')).toEqual(['0.01', '0.05', '0.1'])
    expect(parseList('BTC-USDT,,ETH-USDT, ')).toEqual(['BTC-USDT', 'ETH-USDT'])
    expect(parseList('')).toEqual([])
    expect(parseList(null)).toEqual([])
  })
})
