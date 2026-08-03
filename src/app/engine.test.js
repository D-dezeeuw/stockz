// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { engineInfo, ENGINE_VERSION, setValue, bindDOM, defineFn, computed } from './engine.js'

/** Build a document whose importmap contains the given raw JSON. */
function docWithImportmap(json) {
  const html = document.implementation.createHTMLDocument('t')
  const script = html.createElement('script')
  script.type = 'importmap'
  script.textContent = json
  html.head.appendChild(script)
  return html
}

describe('engineInfo', () => {
  it('reports the engine version actually pinned in the page importmap', () => {
    const pinned = engineInfo(
      docWithImportmap('{"imports":{"spektrum":"https://unpkg.com/spektrum@1.1.0/spektrum.js"}}'),
    )
    expect(pinned).toEqual({
      name: 'spektrum',
      version: '1.1.0',
      url: 'https://unpkg.com/spektrum@1.1.0/spektrum.js',
      pinned: true,
    })
    expect(pinned.version).toBe(ENGINE_VERSION)

    // A floating major is reported but not counted as pinned.
    const floating = engineInfo(
      docWithImportmap('{"imports":{"spektrum":"https://unpkg.com/spektrum@1"}}'),
    )
    expect(floating.version).toBe('1')
    expect(floating.pinned).toBe(false)

    // Missing entry, malformed JSON, no importmap and no document all degrade safely.
    const unknown = { name: 'spektrum', version: 'unknown', url: '', pinned: false }
    expect(engineInfo(docWithImportmap('{"imports":{}}'))).toEqual(unknown)
    expect(engineInfo(docWithImportmap('not json'))).toEqual(unknown)
    expect(engineInfo(document.implementation.createHTMLDocument('empty'))).toEqual(unknown)
    expect(engineInfo(null)).toEqual(unknown)
  })
})

describe('engine re-exports', () => {
  it('exposes the Spektrum surface the desk depends on', () => {
    for (const fn of [setValue, bindDOM, defineFn, computed]) {
      expect(typeof fn).toBe('function')
    }
  })
})
