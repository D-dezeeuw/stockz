// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  DENSITY,
  columnCount,
  densityFor,
  applyLayout,
  observeLayout,
  setBlockVisibility,
  registerLayoutActions,
} from './layout.js'
import { commitBlocks, currentBlocks } from './registry.js'
import { appState, tick, resetState } from '../app/engine.js'
import { clearActions, actionNames, dispatchAction } from '../actions/registry.js'
import { ACTIONS } from '../actions/names.js'

beforeEach(() => {
  resetState()
  clearActions()
  document.body.innerHTML = ''
})

describe('columnCount', () => {
  it('mirrors the CSS auto-fit rule so JS and CSS cannot disagree', () => {
    // 352px blocks, 8px gap, 8px padding either side.
    expect(columnCount(400)).toBe(1)
    expect(columnCount(740)).toBe(2)
    expect(columnCount(1100)).toBe(3)
    expect(columnCount(1500)).toBe(4)
    expect(columnCount(3440)).toBe(9)

    // Custom metrics, and never fewer than one column.
    expect(columnCount(1000, { blockW: 200, gap: 0, padding: 0 })).toBe(5)
    expect(columnCount(100)).toBe(1)
    expect(columnCount(0)).toBe(1)
    expect(columnCount(NaN)).toBe(1)
  })
})

describe('densityFor', () => {
  it('bands columns so blocks can choose how much detail to render', () => {
    expect(densityFor(1)).toBe(DENSITY.compact)
    expect(densityFor(2)).toBe(DENSITY.normal)
    expect(densityFor(3)).toBe(DENSITY.normal)
    expect(densityFor(4)).toBe(DENSITY.wide)
    expect(densityFor(9)).toBe(DENSITY.wide)
    expect(densityFor(0)).toBe(DENSITY.compact)
    expect(densityFor(NaN)).toBe(DENSITY.compact)
  })
})

describe('applyLayout', () => {
  it('records the measured columns and density in state', () => {
    expect(applyLayout(1500)).toEqual({ columns: 4, density: DENSITY.wide })
    tick()

    expect(appState.ui.columns).toBe(4)
    expect(appState.ui.density).toBe('wide')

    applyLayout(500)
    tick()
    expect(appState.ui.columns).toBe(1)
    expect(appState.ui.density).toBe('compact')
  })
})

describe('observeLayout', () => {
  it('watches the grid element, not the window, and degrades without ResizeObserver', () => {
    document.body.innerHTML = '<main class="app-grid"></main>'

    const observed = []
    let fire = null
    class FakeResizeObserver {
      constructor(callback) {
        fire = callback
      }
      observe(el) {
        observed.push(el)
      }
      disconnect() {
        observed.length = 0
      }
    }

    const stop = observeLayout({ doc: document, win: { ResizeObserver: FakeResizeObserver } })
    expect(observed[0]).toBe(document.querySelector('.app-grid'))

    // A side panel narrowing the grid is a resize the window would never report.
    fire([{ contentRect: { width: 1100 } }])
    tick()
    expect(appState.ui.columns).toBe(3)

    stop()
    expect(observed).toHaveLength(0)

    // No grid, or no ResizeObserver: fall back to the window width, still no crash.
    document.body.innerHTML = ''
    const fallback = observeLayout({ doc: document, win: { innerWidth: 740 } })
    tick()
    expect(appState.ui.columns).toBe(2)
    expect(() => fallback()).not.toThrow()
  })
})

describe('setBlockVisibility', () => {
  it('hides and shows a block, persisting the choice', () => {
    commitBlocks([{ id: 'tape', order: 0 }, { id: 'book', order: 1 }])
    tick()

    setBlockVisibility({}, { id: 'tape' })
    tick()
    expect(currentBlocks().find((b) => b.id === 'tape').visible).toBe(false)
    expect(currentBlocks().find((b) => b.id === 'book').visible).toBe(true)

    setBlockVisibility({}, { id: 'tape', visible: true })
    tick()
    expect(currentBlocks().find((b) => b.id === 'tape').visible).toBe(true)
  })
})

describe('registerLayoutActions', () => {
  it('registers the toggle so HTML and hotkeys can hide a block by name', () => {
    expect(registerLayoutActions()).toEqual([ACTIONS.ui.toggleBlock])
    expect(actionNames()).toContain('ui.toggleBlock')

    commitBlocks([{ id: 'hud', order: 0 }])
    tick()

    dispatchAction(ACTIONS.ui.toggleBlock, { id: 'hud' })
    tick()
    expect(currentBlocks()[0].visible).toBe(false)
  })
})
