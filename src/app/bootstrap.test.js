// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { bootstrap, revealApp } from './bootstrap.js'
import { appState, resetState } from './engine.js'

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
