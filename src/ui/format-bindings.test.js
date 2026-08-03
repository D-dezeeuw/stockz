// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  FORMATTER_NAMESPACE,
  buildFormatters,
  registerFormatters,
  unregisterFormatters,
} from './format-bindings.js'
import { setValue, bindDOM, tick, resetState } from '../app/engine.js'
import { PATHS } from '../state/paths.js'

beforeEach(() => {
  resetState()
  document.body.innerHTML = ''
})

afterEach(() => {
  unregisterFormatters()
})

describe('buildFormatters', () => {
  it('bundles the formatters and semantic class helpers under short names', () => {
    const fmt = buildFormatters()

    expect(fmt.price(101.2, 0.01)).toBe('101.20')
    expect(fmt.qty(1.98765, 0.001)).toBe('1.987')
    expect(fmt.pct(1.2345)).toBe('+1.23%')
    expect(fmt.signed(-3.1)).toBe('-3.10')
    expect(fmt.compact(45000)).toBe('45.0K')
    expect(fmt.cls(-1)).toBe('is-loss')
    expect(fmt.side('buy')).toBe('is-buy')
    expect(fmt.pulse(101, 100)).toBe('tick-up')

    // Frozen: a binding must not be able to redefine how prices render.
    expect(Object.isFrozen(fmt)).toBe(true)
  })
})

describe('registerFormatters', () => {
  it('exposes one global namespace that HTML bindings can actually call', () => {
    const target = {}
    const returned = registerFormatters(target)

    expect(target[FORMATTER_NAMESPACE]).toBe(returned)
    expect(FORMATTER_NAMESPACE).toBe('fmt')

    // The real proof: a Spektrum binding renders through the formatter.
    registerFormatters()
    document.body.innerHTML =
      '<p id="cell" :class="fmt.cls(trade.dayPnl)">{{fmt.signed(trade.dayPnl)}}</p>'
    setValue(PATHS.trade.dayPnl, 42.5)
    bindDOM(document)
    tick()

    const cell = document.getElementById('cell')
    expect(cell.textContent).toBe('+42.50')
    expect(cell.className).toBe('is-profit')
  })
})

describe('unregisterFormatters', () => {
  it('removes the namespace and reports when there was nothing to remove', () => {
    const target = {}
    registerFormatters(target)

    expect(unregisterFormatters(target)).toBe(true)
    expect(FORMATTER_NAMESPACE in target).toBe(false)
    expect(unregisterFormatters(target)).toBe(false)
  })
})
