// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { mountApp, autoMount, APP_NAME } from './main.js'

describe('mountApp', () => {
  it('fills #app with the boot text, uncloaks it, and no-ops without a root', () => {
    document.body.innerHTML = '<div id="app" data-cloak></div>'

    const root = mountApp(document)

    expect(root).toBe(document.getElementById('app'))
    expect(root.textContent).toBe(`${APP_NAME} booting`)
    expect(root.hasAttribute('data-cloak')).toBe(false)

    document.body.innerHTML = ''
    expect(mountApp(document)).toBeNull()
    expect(mountApp(null)).toBeNull()
  })
})

describe('autoMount', () => {
  it('mounts immediately when ready and defers to DOMContentLoaded while loading', () => {
    document.body.innerHTML = '<div id="app" data-cloak></div>'

    // readyState 'complete' in jsdom -> mounts straight away.
    expect(autoMount(document)).toBe(document.getElementById('app'))
    // Explicit null (a document-less environment) short-circuits.
    expect(autoMount(null)).toBeNull()

    // While loading, it registers a once-listener that mounts when fired.
    document.body.innerHTML = '<div id="app" data-cloak></div>'
    let handler = null
    const loadingDoc = {
      readyState: 'loading',
      addEventListener: (type, fn, opts) => {
        expect(type).toBe('DOMContentLoaded')
        expect(opts).toEqual({ once: true })
        handler = fn
      },
      getElementById: (id) => document.getElementById(id),
    }

    expect(autoMount(loadingDoc)).toBeNull()
    expect(document.getElementById('app').textContent).toBe('')

    handler()
    expect(document.getElementById('app').textContent).toBe(`${APP_NAME} booting`)
  })
})
