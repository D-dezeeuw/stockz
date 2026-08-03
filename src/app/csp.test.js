import { describe, it, expect } from 'vitest'
import {
  EXPRESSION_ATTRS,
  extractMustaches,
  extractAttrExpressions,
  collectExpressions,
  renderPrecompileModule,
  cspMeta,
} from './csp.js'
import { readFileSync } from 'node:fs'

const TEMPLATE = `
  <p>{{app.name}} v{{app.version}}</p>
  <p>{{ app.name }}</p>
  <li :class="'toast toast--' + toast.level" :title="toast.message">{{toast.message}}</li>
  <ul data-each="toast in ui.toasts"></ul>
  <section data-if="ui.section === 'journal'"></section>
  <input data-model="settings.theme">
  <span>{{}}</span>
`

describe('extractMustaches', () => {
  it('collects each distinct expression once, trimmed', () => {
    expect(extractMustaches(TEMPLATE)).toEqual([
      'app.name',
      'app.version',
      'toast.message',
    ])
    expect(extractMustaches('')).toEqual([])
    expect(extractMustaches(null)).toEqual([])
  })
})

describe('extractAttrExpressions', () => {
  it('collects property, structural and two-way binding expressions', () => {
    const found = extractAttrExpressions(TEMPLATE)

    expect(found).toContain("'toast toast--' + toast.level")
    expect(found).toContain('toast.message')
    expect(found).toContain('toast in ui.toasts')
    expect(found).toContain("ui.section === 'journal'")
    expect(found).toContain('settings.theme')

    expect(extractAttrExpressions('<p>no bindings</p>')).toEqual([])
    expect(EXPRESSION_ATTRS).toContain('data-each')
  })
})

describe('collectExpressions', () => {
  it('is the full deduped set a strict-CSP build must precompile', () => {
    const all = collectExpressions(TEMPLATE)

    expect(new Set(all).size).toBe(all.length)
    expect(all[0]).toBe('app.name')
    expect(all).toContain('toast in ui.toasts')

    // The real page must not contain an expression the extractor cannot see.
    const page = readFileSync(new URL('../../index.html', import.meta.url), 'utf8')
    const fromPage = collectExpressions(page)
    expect(fromPage).toContain('app.name')
    expect(fromPage).toContain('ui.statusLine')
    expect(fromPage.every((e) => typeof e === 'string' && e.length > 0)).toBe(true)
  })
})

describe('renderPrecompileModule', () => {
  it('emits a module registering every expression against the engine', () => {
    const source = renderPrecompileModule(['app.name', "'x' + y"])

    expect(source).toContain("import { precompile } from 'spektrum'")
    expect(source).toContain('precompile("app.name", (state) => (app.name))')
    expect(source).toContain('return 2')
    expect(renderPrecompileModule([])).toContain('return 0')
    expect(renderPrecompileModule(null)).toContain('return 0')
  })
})

describe('cspMeta', () => {
  it('ships a policy without unsafe-eval, and a report-only variant for rollout', () => {
    const enforced = cspMeta()
    expect(enforced.name).toBe('Content-Security-Policy')
    expect(enforced.content).not.toContain('unsafe-eval')
    expect(enforced.content).toContain("object-src 'none'")
    expect(enforced.content).toContain('https://unpkg.com')
    expect(enforced.content).toContain('wss://ws.okx.com')

    expect(cspMeta({ reportOnly: true }).name).toBe('Content-Security-Policy-Report-Only')
  })
})
