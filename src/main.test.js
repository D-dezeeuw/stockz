// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { bootWhenReady, APP_NAME } from './main.js'

describe('bootWhenReady', () => {
  it('boots immediately when ready and defers to DOMContentLoaded while loading', () => {
    expect(APP_NAME).toBe('STOCKZ')

    const calls = []
    const boot = (options) => {
      calls.push(options)
      return 'booted'
    }

    // jsdom reports 'complete' -> boots straight away.
    expect(bootWhenReady(document, boot)).toBe('booted')
    expect(calls).toHaveLength(1)
    expect(calls[0].doc).toBe(document)
    expect(typeof calls[0].now).toBe('number')
    // Running the app is what asks for a live socket — booting the module alone does not.
    expect(calls[0].feeds).toBe(true)

    // Explicit null (a document-less environment) short-circuits.
    expect(bootWhenReady(null, boot)).toBeNull()
    expect(calls).toHaveLength(1)

    // While loading, it registers a once-listener that boots when fired.
    let handler = null
    const loadingDoc = {
      readyState: 'loading',
      addEventListener: (type, fn, opts) => {
        expect(type).toBe('DOMContentLoaded')
        expect(opts).toEqual({ once: true })
        handler = fn
      },
    }

    expect(bootWhenReady(loadingDoc, boot)).toBeNull()
    expect(calls).toHaveLength(1)

    handler()
    expect(calls).toHaveLength(2)
    expect(calls[1].doc).toBe(loadingDoc)
  })
})
