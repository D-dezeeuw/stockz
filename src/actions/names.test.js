import { describe, it, expect, beforeEach } from 'vitest'
import { ACTIONS, allActionNames } from './names.js'
import { registerCoreActions, actionNames, clearActions } from './registry.js'
import { registerLayoutActions } from '../blocks/layout.js'
import { registerHeaderActions } from '../ui/header.js'
import { registerThemeActions } from '../ui/theme.js'
import { registerSettingsActions } from '../ui/settings.js'

beforeEach(() => {
  clearActions()
})

describe('allActionNames', () => {
  it('flattens the declared names and matches what boot actually registers', () => {
    expect(allActionNames()).toEqual([
      'ui.setStatus',
      'ui.toggleBlock',
      'ui.setSection',
      'ui.toggleOverlay',
      'ui.setTheme',
      'app.reset',
      'settings.update',
      'settings.reset',
    ])

    // Every declared name must actually be registered by some boot step - a name in
    // ACTIONS that nothing registers is a hotkey bound to nothing.
    registerCoreActions()
    registerLayoutActions()
    registerHeaderActions()
    registerThemeActions()
    registerSettingsActions()
    expect(actionNames().sort()).toEqual(allActionNames().sort())

    // Every name follows <namespace>.<verb>, which is what registerAction enforces.
    for (const name of allActionNames()) expect(name).toMatch(/^[a-z]+\.[a-zA-Z]+$/)

    expect(Object.isFrozen(ACTIONS)).toBe(true)
    expect(Object.isFrozen(ACTIONS.ui)).toBe(true)
  })
})
