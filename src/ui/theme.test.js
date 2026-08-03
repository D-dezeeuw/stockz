// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { THEMES, preferredTheme, applyTheme, setTheme, registerThemeActions } from './theme.js'
import { appState, tick, resetState } from '../app/engine.js'
import { clearActions, dispatchAction, actionNames } from '../actions/registry.js'
import { ACTIONS } from '../actions/names.js'

beforeEach(() => {
  resetState()
  clearActions()
  document.documentElement.removeAttribute('data-theme')
})

describe('preferredTheme', () => {
  it('honours a light OS preference but defaults to night', () => {
    expect(preferredTheme({ matchMedia: () => ({ matches: true }) })).toBe('day')
    expect(preferredTheme({ matchMedia: () => ({ matches: false }) })).toBe('night')

    // No matchMedia at all (old browser, jsdom without the shim) must not throw.
    expect(preferredTheme({})).toBe('night')
    expect(preferredTheme(null)).toBe('night')
    expect(THEMES).toEqual(['night', 'day'])
  })
})

describe('applyTheme', () => {
  it('stamps one attribute and records the theme in both ui and settings', () => {
    expect(applyTheme('day', document)).toBe('day')
    tick()

    expect(document.documentElement.getAttribute('data-theme')).toBe('day')
    expect(appState.ui.theme).toBe('day')
    // settings.* is the persisted branch — this is what survives a reload.
    expect(appState.settings.theme).toBe('day')

    // Unknown themes fall back rather than stamping an attribute nothing styles.
    expect(applyTheme('neon', document)).toBe('night')
    expect(document.documentElement.getAttribute('data-theme')).toBe('night')
    expect(applyTheme('day', null)).toBe('day')
  })
})

describe('setTheme', () => {
  it('flips between night and day, or applies an explicit theme', () => {
    applyTheme('night', document)
    tick()

    expect(setTheme({}, { doc: document })).toBe('day')
    tick()
    expect(appState.ui.theme).toBe('day')

    expect(setTheme({}, { doc: document })).toBe('night')
    tick()
    expect(appState.ui.theme).toBe('night')

    expect(setTheme({}, { theme: 'day', doc: document })).toBe('day')
  })
})

describe('registerThemeActions', () => {
  it('registers the toggle so the header button and a hotkey share one path', () => {
    expect(registerThemeActions()).toEqual([ACTIONS.ui.setTheme])
    expect(actionNames()).toContain('ui.setTheme')

    applyTheme('night', document)
    tick()
    dispatchAction(ACTIONS.ui.setTheme, { doc: document })
    tick()

    expect(appState.ui.theme).toBe('day')
    expect(document.documentElement.getAttribute('data-theme')).toBe('day')
  })
})
