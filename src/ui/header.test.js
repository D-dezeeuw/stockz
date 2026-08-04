// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  SECTIONS,
  SECTION_BLOCKS,
  setSection,
  blockInSection,
  venueLeds,
  sessionClock,
  toggleOverlay,
  sectionBlocks,
  mountSectionBlocks,
  svgAttr,
  registerHeaderActions,
} from './header.js'
import { DEFAULT_BLOCKS } from '../blocks/seed.js'
import { appState, setValue, tick, resetState } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { clearActions, actionNames, dispatchAction } from '../actions/registry.js'
import { ACTIONS } from '../actions/names.js'

beforeEach(() => {
  resetState()
  clearActions()
})

describe('setSection', () => {
  it('switches sections and refuses to navigate somewhere that does not exist', () => {
    expect(setSection({}, { section: 'journal' })).toBe('journal')
    tick()
    expect(appState.ui.section).toBe('journal')

    expect(setSection({}, { section: 'TRADE' })).toBe('trade')
    expect(setSection({}, { section: 'nowhere' })).toBe('dashboard')
    expect(setSection({}, {})).toBe('dashboard')
    expect(SECTIONS).toEqual(['dashboard', 'trade', 'journal', 'analytics'])
  })
})

describe('blockInSection', () => {
  it('decides which blocks a section shows, defaulting to the dashboard set', () => {
    expect(blockInSection('trade', 'ticket')).toBe(true)
    expect(blockInSection('trade', 'watchlist')).toBe(false)
    expect(blockInSection('journal', 'journal')).toBe(true)
    expect(blockInSection('analytics', 'ticket')).toBe(false)

    // An unknown section shows everything rather than an empty screen.
    expect(blockInSection('nonsense', 'watchlist')).toBe(true)
    expect(SECTION_BLOCKS.dashboard).toContain('hud')

    // Every seeded block must be reachable from somewhere. `analytics` was added to the
    // registry at order 12 and listed in no section, so once the grid actually honoured
    // these sets it would have rendered nowhere at all - a block that exists, is
    // maintained, and can never be seen.
    for (const block of DEFAULT_BLOCKS) {
      const sections = Object.keys(SECTION_BLOCKS).filter((s) => blockInSection(s, block.id))
      expect(sections.length, `block "${block.id}" belongs to no section`).toBeGreaterThan(0)
    }
  })
})

describe('venueLeds', () => {
  it('reports one LED per venue, dead until a socket says otherwise', () => {
    expect(venueLeds({})).toEqual([
      { venue: 'okx', state: 'dead', className: 'led led--dead' },
      { venue: 'etoro', state: 'dead', className: 'led led--dead' },
    ])

    setValue(PATHS.market.venues, { okx: { state: 'live' }, etoro: { state: 'connecting' } })
    tick()

    const leds = venueLeds()
    expect(leds[0]).toEqual({ venue: 'okx', state: 'live', className: 'led led--live' })
    expect(leds[1].className).toBe('led led--warn')
  })
})

describe('sessionClock', () => {
  it('shows venue time plus uptime, so a silent reconnect is visible', () => {
    setValue(PATHS.app.clock, '14:05:09')
    setValue(PATHS.app.uptime, 8040) // 2h 14m
    tick()

    expect(sessionClock()).toBe('14:05:09 UTC · up 2h 14m')

    setValue(PATHS.app.uptime, 300)
    tick()
    expect(sessionClock()).toBe('14:05:09 UTC · up 5m')

    expect(sessionClock({})).toBe('--:--:-- UTC · up 0m')
  })
})

describe('toggleOverlay', () => {
  it('closes the overlay when the same one is requested twice', () => {
    expect(toggleOverlay({}, { modal: 'settings' })).toBe('settings')
    tick()
    expect(appState.ui.modal).toBe('settings')

    // Hitting the same key again means "gone", not "stacked".
    expect(toggleOverlay({}, { modal: 'settings' })).toBe('')
    tick()
    expect(appState.ui.modal).toBe('')

    toggleOverlay({}, { modal: 'settings' })
    tick()
    expect(toggleOverlay({}, { modal: 'hotkeys' })).toBe('hotkeys')
  })
})

describe('sectionBlocks', () => {
  it('narrows the layout to the active section and drops hidden blocks', () => {
    const state = {
      ui: { section: 'trade' },
      settings: {
        blocks: [
          { id: 'ticket' },
          { id: 'book' },
          { id: 'watchlist' }, // not in the trade set
          { id: 'chart', visible: false }, // in the set, but switched off
        ],
      },
    }

    expect(sectionBlocks(state).map((b) => b.id)).toEqual(['ticket', 'book'])

    // An unknown section falls back to the dashboard set, same as blockInSection.
    expect(sectionBlocks({ ...state, ui: { section: 'nowhere' } }).map((b) => b.id)).toEqual([
      'ticket',
      'book',
      'watchlist',
    ])

    expect(sectionBlocks({})).toEqual([])
    expect(sectionBlocks({ settings: { blocks: 'not an array' } })).toEqual([])
  })
})

describe('mountSectionBlocks', () => {
  it('publishes the grid once at boot and again whenever section or layout moves', () => {
    setValue(PATHS.settings.blocks, [{ id: 'ticket' }, { id: 'watchlist' }])
    setValue(PATHS.ui.section, 'trade')
    tick()

    const watched = []
    const first = mountSectionBlocks({ watch: (paths, fn) => watched.push({ paths, fn }) })

    // Published up front - waiting for the first change would leave the desk empty.
    expect(first.map((b) => b.id)).toEqual(['ticket'])
    tick()
    expect(appState.ui.gridBlocks.map((b) => b.id)).toEqual(['ticket'])

    // And it watches both inputs, so either one moving repaints the grid.
    expect(watched[0].paths).toEqual([PATHS.ui.section, PATHS.settings.blocks])

    setValue(PATHS.ui.section, 'dashboard')
    tick()
    watched[0].fn()
    tick()
    expect(appState.ui.gridBlocks.map((b) => b.id)).toEqual(['ticket', 'watchlist'])
  })
})

describe('svgAttr', () => {
  it('writes a state value onto the element attribute and ignores unusable bindings', () => {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'polyline')
    const state = { trade: { equityPath: '0,10 5,4' } }

    expect(svgAttr(state, { el, id: 'trade.equityPath', attr: 'points' })).toBe('0,10 5,4')
    expect(el.getAttribute('points')).toBe('0,10 5,4')

    // Default attribute is points, and a path that resolves to nothing writes empty
    // rather than the string 'undefined'.
    expect(svgAttr(state, { el, id: 'trade.missing.deep' })).toBe('')
    expect(el.getAttribute('points')).toBe('')

    // No element or no path means there is nothing to write - never throw, because a
    // throw here aborts Spektrum's bind walk and takes the whole desk down with it.
    expect(svgAttr(state, { id: 'trade.equityPath' })).toBe('')
    expect(svgAttr(state, { el })).toBe('')
    expect(svgAttr(state)).toBe('')
  })
})

describe('registerHeaderActions', () => {
  it('registers nav and overlay actions so HTML and hotkeys can drive the header', () => {
    expect(registerHeaderActions()).toEqual([
      ACTIONS.ui.setSection,
      ACTIONS.ui.toggleOverlay,
      ACTIONS.ui.svgAttr,
    ])
    expect(actionNames()).toContain('ui.setSection')

    dispatchAction(ACTIONS.ui.setSection, { section: 'analytics' })
    tick()
    expect(appState.ui.section).toBe('analytics')
  })
})
