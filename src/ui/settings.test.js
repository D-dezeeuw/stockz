// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  settingsGroups,
  updateSetting,
  resetSettings,
  undoSettingsReset,
  exportSettings,
  importSettings,
  saveLayoutPreset,
  applyLayoutPreset,
  registerSettingsActions,
} from './settings.js'
import { appState, setValue, tick, resetState } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { SETTINGS_GROUPS } from '../state/settings-schema.js'
import { commitBlocks, currentBlocks } from '../blocks/registry.js'
import { clearActions, actionNames, dispatchAction } from '../actions/registry.js'
import { ACTIONS } from '../actions/names.js'

beforeEach(() => {
  resetState()
  clearActions()
})

describe('settingsGroups', () => {
  it('groups every field for the drawer, with current values filled in', () => {
    const groups = settingsGroups({ defaultSize: 0.25 })

    expect(groups.map((g) => g.group)).toEqual(SETTINGS_GROUPS)

    const trading = groups.find((g) => g.group === 'trading')
    expect(trading.fields.find((f) => f.key === 'defaultSize').value).toBe(0.25)
    // A field the trader has never touched shows its default, not undefined.
    expect(trading.fields.find((f) => f.key === 'priceStep').value).toBe(0.1)
    expect(settingsGroups()).toHaveLength(SETTINGS_GROUPS.length)
  })
})

describe('updateSetting', () => {
  it('coerces every write, so the drawer is no more trusted than a file', () => {
    expect(updateSetting({}, { key: 'defaultSize', value: '0.75' })).toBe(0.75)
    tick()
    expect(appState.settings.defaultSize).toBe(0.75)

    // Junk in a risk field becomes the default rather than NaN.
    expect(updateSetting({}, { key: 'maxDailyLoss', value: 'oops' })).toBe(100)
    expect(updateSetting({}, { key: 'defaultSize', value: -3 })).toBe(0)

    expect(updateSetting({}, { key: 'notASetting', value: 1 })).toBeNull()
    expect(updateSetting({}, {})).toBeNull()
  })
})

describe('resetSettings', () => {
  it('restores defaults and announces that an undo exists', () => {
    setValue(PATHS.settings.defaultSize, 5)
    setValue(PATHS.settings.theme, 'day')
    tick()

    const defaults = resetSettings()
    tick()

    expect(defaults.defaultSize).toBe(0.01)
    expect(appState.settings.defaultSize).toBe(0.01)
    expect(appState.settings.theme).toBe('night')
    expect(appState.ui.toasts[0].message).toMatch(/undo/)
  })
})

describe('undoSettingsReset', () => {
  it('rewinds a reset through engine history, and reports when there is nothing to undo', () => {
    expect(undoSettingsReset()).toBe(false)

    setValue(PATHS.settings.defaultSize, 5)
    tick()
    resetSettings()
    tick()
    expect(appState.settings.defaultSize).toBe(0.01)

    expect(undoSettingsReset()).toBe(true)
    expect(appState.settings.defaultSize).toBe(5)

    // Undo is one-shot: the point is consumed.
    expect(undoSettingsReset()).toBe(false)
  })
})

describe('exportSettings', () => {
  it('writes a file that carries the layout too, because settings means the whole desk', () => {
    commitBlocks([{ id: 'tape', order: 0 }])
    tick()

    const json = JSON.parse(exportSettings({ theme: 'day', defaultSize: 0.2 }))

    expect(json.version).toBe(1)
    expect(json.settings.theme).toBe('day')
    expect(json.settings.blocks.map((b) => b.id)).toEqual(['tape'])
  })
})

describe('importSettings', () => {
  it('normalises an imported file, since a hand-edited risk limit is untrusted input', () => {
    const file = JSON.stringify({
      version: 1,
      settings: {
        theme: 'day',
        maxDailyLoss: 'hand-edited nonsense',
        evil: 'payload',
        blocks: [{ id: 'book', order: 0 }],
      },
    })

    const result = importSettings(file)
    tick()

    expect(result.ok).toBe(true)
    expect(appState.settings.theme).toBe('day')
    expect(appState.settings.maxDailyLoss).toBe(100)
    expect('evil' in appState.settings).toBe(false)
    expect(currentBlocks().map((b) => b.id)).toEqual(['book'])

    expect(importSettings('not json').ok).toBe(false)
    expect(importSettings('null').ok).toBe(false)
    expect(importSettings(undefined).ok).toBe(false)
  })
})

describe('saveLayoutPreset', () => {
  it('stores the current arrangement under a name and ignores a blank one', () => {
    commitBlocks([{ id: 'hud', order: 0 }])
    tick()

    const presets = saveLayoutPreset('scalping')
    tick()

    expect(Object.keys(presets)).toEqual(['scalping'])
    expect(presets.scalping.map((b) => b.id)).toEqual(['hud'])
    expect(appState.settings.presets.scalping).toHaveLength(1)

    expect(Object.keys(saveLayoutPreset('  ', presets))).toEqual(['scalping'])
  })
})

describe('applyLayoutPreset', () => {
  it('swaps the grid to a saved arrangement, or reports there is none', () => {
    const presets = { scalping: [{ id: 'ticket', order: 0 }] }

    expect(applyLayoutPreset('scalping', presets)).toBe(true)
    tick()
    expect(currentBlocks().map((b) => b.id)).toEqual(['ticket'])

    expect(applyLayoutPreset('missing', presets)).toBe(false)
    expect(applyLayoutPreset('scalping', {})).toBe(false)
  })
})

describe('registerSettingsActions', () => {
  it('registers update and reset so the drawer and hotkeys share one path', () => {
    expect(registerSettingsActions()).toEqual([ACTIONS.settings.update, ACTIONS.settings.reset])
    expect(actionNames()).toContain('settings.update')

    dispatchAction(ACTIONS.settings.update, { key: 'soundEnabled', value: 'false' })
    tick()
    expect(appState.settings.soundEnabled).toBe(false)
  })
})
