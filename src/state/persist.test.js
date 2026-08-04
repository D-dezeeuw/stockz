// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  SETTINGS_VERSION,
  STORAGE_KEY,
  loadSettings,
  saveSettings,
  migrateSettings,
  restoreSettings,
  persistSettings,
  isPersistable,
  currentSettings,
} from './persist.js'
import { appState, setValue, tick, resetState } from '../app/engine.js'
import { PATHS } from './paths.js'

/** A storage double that can also be made to fail like private mode does. */
function fakeStorage(initial = {}, { failWrites = false, failReads = false } = {}) {
  const map = new Map(Object.entries(initial))
  return {
    getItem: (k) => {
      if (failReads) throw new Error('read blocked')
      return map.has(k) ? map.get(k) : null
    },
    setItem: (k, v) => {
      if (failWrites) throw new Error('QuotaExceededError')
      map.set(k, v)
    },
    dump: () => Object.fromEntries(map),
  }
}

beforeEach(() => {
  resetState()
})

describe('loadSettings', () => {
  it('reads a stored payload and degrades to null on anything unusable', () => {
    const stored = JSON.stringify({ version: 1, settings: { theme: 'day' } })

    expect(loadSettings(fakeStorage({ [STORAGE_KEY]: stored }))).toEqual({
      version: 1,
      settings: { theme: 'day' },
    })

    // Empty, corrupt, wrong-shaped and unreadable storage must never throw: a broken
    // cache degrades to defaults, it does not stop the desk booting.
    expect(loadSettings(fakeStorage())).toBeNull()
    expect(loadSettings(fakeStorage({ [STORAGE_KEY]: 'not json' }))).toBeNull()
    expect(loadSettings(fakeStorage({ [STORAGE_KEY]: '{"nope":1}' }))).toBeNull()
    expect(loadSettings(fakeStorage({}, { failReads: true }))).toBeNull()
    expect(loadSettings(undefined)).toBeNull()
  })
})

describe('saveSettings', () => {
  it('writes a versioned payload and survives a storage that refuses', () => {
    const storage = fakeStorage()

    expect(saveSettings({ theme: 'night' }, storage)).toBe(true)
    expect(JSON.parse(storage.dump()[STORAGE_KEY])).toEqual({
      version: SETTINGS_VERSION,
      settings: { theme: 'night' },
    })

    // Private mode or a full quota loses a preference; it must not interrupt trading.
    expect(saveSettings({ theme: 'day' }, fakeStorage({}, { failWrites: true }))).toBe(false)
    expect(saveSettings(undefined, storage)).toBe(true)
  })
})

describe('migrateSettings', () => {
  it('brings an old payload up to the current shape instead of discarding it', () => {
    // v0 stored a bare boolean; a trader should not lose their choice to a schema bump.
    expect(migrateSettings({ version: 0, settings: { dark: true } })).toEqual({ theme: 'night' })
    expect(migrateSettings({ version: 0, settings: { dark: false } })).toEqual({ theme: 'day' })

    // Current-version payloads pass through untouched.
    const current = { version: 1, settings: { theme: 'day', blocks: [] } }
    expect(migrateSettings(current)).toEqual({ theme: 'day', blocks: [] })

    expect(migrateSettings(null)).toEqual({})
    expect(migrateSettings({ version: 1 })).toEqual({})
  })
})

describe('restoreSettings', () => {
  it('writes stored preferences into state before the first paint', () => {
    const stored = JSON.stringify({
      version: 1,
      settings: { theme: 'day', blocks: [{ id: 'tape' }] },
    })

    const restored = restoreSettings(fakeStorage({ [STORAGE_KEY]: stored }))
    tick()

    expect(restored.sort()).toEqual(['settings.blocks', 'settings.theme'])
    expect(appState.settings.theme).toBe('day')
    expect(appState.settings.blocks).toHaveLength(1)

    expect(restoreSettings(fakeStorage())).toEqual([])
  })
})

describe('persistSettings', () => {
  it('writes through on *any* setting, not just the two it used to watch', () => {
    const storage = fakeStorage()
    persistSettings(storage)

    setValue(PATHS.settings.theme, 'day')
    tick()

    const written = JSON.parse(storage.dump()[STORAGE_KEY])
    expect(written.version).toBe(SETTINGS_VERSION)
    expect(written.settings.theme).toBe('day')

    // This watched `theme` and `blocks` alone, so a change to anything else was written to
    // state, rendered, and then lost on reload — the market mode, the bot's caps, the
    // backtest assumptions, the practice stake, all of them.
    setValue(PATHS.settings.marketMode, 'quiet')
    tick()
    expect(JSON.parse(storage.dump()[STORAGE_KEY]).settings.marketMode).toBe('quiet')

    setValue(PATHS.settings.paperStartBalance, 250)
    tick()
    expect(JSON.parse(storage.dump()[STORAGE_KEY]).settings.paperStartBalance).toBe(250)

    // Derived from PATHS.settings rather than listed, so a setting added later persists by
    // existing rather than by somebody remembering to add it here.
    setValue(PATHS.settings.modeChosen, true)
    tick()
    expect(JSON.parse(storage.dump()[STORAGE_KEY]).settings.modeChosen).toBe(true)
  })
})

describe('isPersistable', () => {
  it('allows settings only — live trading data never reaches a browser store', () => {
    expect(isPersistable('settings')).toBe(true)
    expect(isPersistable('settings.theme')).toBe(true)

    // A resurrected position from yesterday that looks live is a real loss.
    expect(isPersistable('trade')).toBe(false)
    expect(isPersistable('trade.positions')).toBe(false)
    expect(isPersistable('market.bid')).toBe(false)
    expect(isPersistable(undefined)).toBe(false)
  })
})

describe('currentSettings', () => {
  it('reads the settings branch and never returns undefined', () => {
    expect(currentSettings()).toEqual({})

    setValue(PATHS.settings.theme, 'night')
    tick()
    expect(currentSettings().theme).toBe('night')
  })
})
