import { describe, it, expect } from 'vitest'
import { ICON_NAMES, icon, escapeAttr, sideIcon } from './icons.js'

describe('icon', () => {
  it('renders inline SVG that inherits colour, and nothing for an unknown name', () => {
    const svg = icon('bolt')

    expect(svg).toContain('<svg')
    expect(svg).toContain('viewBox="0 0 16 16"')
    // currentColor is what lets .is-sell turn its arrow orange without the icon knowing.
    expect(svg).toContain('fill="currentColor"')
    expect(svg).toContain('class="icon icon--bolt"')
    // Decorative by default: no label for a screen reader to announce twice.
    expect(svg).toContain('aria-hidden="true"')

    const labelled = icon('skull', { size: 24, title: 'kill switch', className: 'big' })
    expect(labelled).toContain('width="24"')
    expect(labelled).toContain('aria-label="kill switch"')
    expect(labelled).toContain('class="icon icon--skull big"')
    expect(labelled).not.toContain('aria-hidden')

    expect(icon('no-such-icon')).toBe('')
    expect(icon(undefined)).toBe('')
    expect(ICON_NAMES).toContain('gear')
  })
})

describe('escapeAttr', () => {
  it('neutralises markup, because venue data is not trusted input', () => {
    expect(escapeAttr('BTC-USDT')).toBe('BTC-USDT')
    expect(escapeAttr('a"b')).toBe('a&quot;b')
    expect(escapeAttr('<script>')).toBe('&lt;script&gt;')
    expect(escapeAttr('a&b')).toBe('a&amp;b')
    expect(escapeAttr(null)).toBe('')

    // An injected title cannot break out of the attribute.
    expect(icon('bolt', { title: '" onload="evil()' })).not.toContain('onload="evil()')
  })
})

describe('sideIcon', () => {
  it('picks the arrow that matches an order side', () => {
    expect(sideIcon('buy')).toBe('up')
    expect(sideIcon('LONG')).toBe('up')
    expect(sideIcon('sell')).toBe('down')
    expect(sideIcon('short')).toBe('down')
    expect(sideIcon('')).toBe('')
    expect(sideIcon(undefined)).toBe('')
  })
})
