// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import {
  engineInfo,
  ENGINE_VERSION,
  sameValue,
  pendingAt,
  setValue,
  appState,
  tick,
  resetState,
  bindDOM,
  defineFn,
  computed,
} from './engine.js'

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

describe('sameValue', () => {
  it('answers whether a write would change anything a binding can see', () => {
    expect(sameValue(1, 1)).toBe(true)
    expect(sameValue('a', 'a')).toBe(true)
    expect(sameValue(1, 2)).toBe(false)
    expect(sameValue(null, undefined)).toBe(false)

    // NaN is the one primitive not equal to itself, and NaN rewritten as NaN is still not
    // a change.
    expect(sameValue(NaN, NaN)).toBe(true)

    expect(sameValue({ a: 1, b: [2, 3] }, { a: 1, b: [2, 3] })).toBe(true)
    expect(sameValue({ a: 1 }, { a: 1, b: 2 })).toBe(false)
    expect(sameValue([1, 2], [1, 2, 3])).toBe(false)
    expect(sameValue([1, 2], { 0: 1, 1: 2 })).toBe(false)

    // Out of budget assumes *different*: a needless write costs a frame, while a skipped
    // real change is a stale price on screen, and those are not the same mistake.
    expect(sameValue({ a: { b: { c: 1 } } }, { a: { b: { c: 1 } } }, 1)).toBe(false)
  })
})

describe('pendingAt', () => {
  it('lets the pending delta win over what state has already flushed', () => {
    resetState()
    setValue('trade.dayPnl', 5)
    tick()
    expect(pendingAt('trade.dayPnl')).toEqual({ found: true, value: 5 })

    // Un-flushed writes are what a second write in the same tick must be compared against:
    // comparing against appState alone would call the second one a no-op and let the first
    // land instead — the desk would end the tick showing the value that was overwritten.
    setValue('trade.dayPnl', 9)
    expect(pendingAt('trade.dayPnl')).toEqual({ found: true, value: 9 })

    expect(pendingAt('trade.nothingHere').found).toBe(false)
    expect(pendingAt('')).toMatchObject({ found: false })
  })
})

describe('setValue', () => {
  it('skips a write that would change nothing, and never skips one that would', () => {
    resetState()
    expect(setValue('trade.dayPnl', 3)).toBe(true)
    tick()

    // The desk fans one tick out into dozens of recomputes that mostly produce identical
    // objects; each no-op write re-rendered every binding on the path and appended to an
    // unbounded history.
    expect(setValue('trade.dayPnl', 3)).toBe(false)
    expect(setValue('ui.hud', { a: 1 })).toBe(true)
    tick()
    expect(setValue('ui.hud', { a: 1 })).toBe(false)
    expect(setValue('ui.hud', { a: 2 })).toBe(true)

    // Two writes in one tick: the second must still land even though appState holds it.
    resetState()
    setValue('trade.dayPnl', 1)
    tick()
    setValue('trade.dayPnl', 2)
    expect(setValue('trade.dayPnl', 1)).toBe(true)
    tick()
    expect(appState.trade.dayPnl).toBe(1)

    // A path state has never held is always a change.
    expect(setValue('trade.brandNew', undefined)).toBe(true)
  })
})
