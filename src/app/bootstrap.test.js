// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { bootstrap, revealApp, makeBootClock, submitFromIntent } from './bootstrap.js'
import { appState, resetState } from './engine.js'
import { clearActions, registerAction } from '../actions/registry.js'

beforeEach(() => {
  resetState()
  document.body.innerHTML = ''
})

describe('bootstrap', () => {
  it('seeds state, binds the DOM to it and uncloaks, without starting the rAF pump', () => {
    document.body.innerHTML =
      '<div id="app" data-cloak><p>{{app.name}} · {{ui.status}}</p></div>'

    // autoRun:false — an rAF pump never finishes, so tests must not start one.
    const { paths, cleanup } = bootstrap({ doc: document, now: 1700000000000, autoRun: false })

    expect(paths.length).toBeGreaterThan(15)
    expect(appState.app.name).toBe('STOCKZ')
    expect(appState.trade.armed).toBe(false)
    expect(appState.app.bootedAt).toBe(1700000000000)

    // The binding rendered real values, not raw mustaches.
    const text = document.querySelector('#app p').textContent
    expect(text).toContain('STOCKZ')
    expect(text).toContain('ready')
    expect(text).not.toContain('{{')

    // The desk is revealed only once bindings hold values.
    expect(document.querySelector('#app').hasAttribute('data-cloak')).toBe(false)
    expect(typeof cleanup).toBe('function')
  })
})

describe('revealApp', () => {
  it('drops every data-cloak attribute and counts what it revealed', () => {
    document.body.innerHTML = '<div data-cloak></div><span data-cloak></span><i></i>'

    expect(revealApp(document)).toBe(2)
    expect(document.querySelectorAll('[data-cloak]')).toHaveLength(0)

    // Nothing to reveal, and no document at all, are both safe.
    expect(revealApp(document)).toBe(0)
    expect(revealApp(null)).toBe(0)
  })
})

describe('makeBootClock', () => {
  it('pins time when given a timestamp and follows the wall clock otherwise', () => {
    expect(makeBootClock(1700000000000)()).toBe(1700000000000)

    const live = makeBootClock()
    const before = Date.now()
    expect(live()).toBeGreaterThanOrEqual(before)

    // 0, NaN and undefined all mean "use real time", not "the epoch".
    expect(makeBootClock(0)()).toBeGreaterThanOrEqual(before)
    expect(makeBootClock(NaN)()).toBeGreaterThanOrEqual(before)
  })
})

describe('submitFromIntent', () => {
  it('routes a click-to-trade intent at the submit action', () => {
    clearActions()
    const seen = []
    registerAction('ticket.submit', (_state, payload) => {
      seen.push(payload)
      return 'sent'
    })

    expect(submitFromIntent({ side: 'sell' })).toBe('sent')
    expect(seen).toEqual([{ side: 'sell' }])

    // No such action registered is a warning, not a throw on the order path.
    clearActions()
    expect(submitFromIntent({ side: 'buy' })).toBeNull()
  })
})
