import { describe, it, expect } from 'vitest'
import {
  WCAG,
  parseHex,
  relativeLuminance,
  contrastRatio,
  meetsContrast,
  auditContrast,
} from './contrast.js'

/** The night palette, as declared in src/styles/tokens.css. */
const NIGHT = {
  bg: '#070a07',
  bgBlock: '#0f1510',
  ink: '#c8e6c9',
  inkStrong: '#eafff0',
  inkMuted: '#6f8a76',
  green: '#00e676',
  orange: '#ff9100',
  orangeHot: '#ff3d00',
}

/** The day palette. */
const DAY = {
  bg: '#f2f5f1',
  bgBlock: '#ffffff',
  ink: '#16241a',
  inkMuted: '#4d6154',
  green: '#00873c',
  orange: '#b84600',
}

describe('parseHex', () => {
  it('reads long and short hex, with or without a hash, and rejects junk', () => {
    expect(parseHex('#00e676')).toEqual({ r: 0, g: 230, b: 118 })
    expect(parseHex('00e676')).toEqual({ r: 0, g: 230, b: 118 })
    expect(parseHex('#fff')).toEqual({ r: 255, g: 255, b: 255 })
    expect(parseHex(' #FFF ')).toEqual({ r: 255, g: 255, b: 255 })

    expect(parseHex('rgb(0,0,0)')).toBeNull()
    expect(parseHex('#12345')).toBeNull()
    expect(parseHex('')).toBeNull()
    expect(parseHex(null)).toBeNull()
  })
})

describe('relativeLuminance', () => {
  it('matches the WCAG reference values at the extremes', () => {
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 5)
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 5)
    // Mid grey sits well below 0.5 — luminance is not linear in sRGB.
    expect(relativeLuminance('#808080')).toBeCloseTo(0.2159, 3)
    expect(relativeLuminance('not a colour')).toBe(0)
  })
})

describe('contrastRatio', () => {
  it('spans 1 to 21 and is order-independent', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBe(21)
    expect(contrastRatio('#000000', '#ffffff')).toBe(21)
    expect(contrastRatio('#123456', '#123456')).toBe(1)
  })
})

describe('meetsContrast', () => {
  it('judges a pairing against the requested WCAG level', () => {
    expect(meetsContrast('#ffffff', '#000000')).toBe(true)
    expect(meetsContrast(NIGHT.inkMuted, NIGHT.bg, WCAG.AA_LARGE)).toBe(true)
    expect(meetsContrast('#777777', '#808080')).toBe(false)
    expect(meetsContrast('#ffffff', '#000000', WCAG.AAA_NORMAL)).toBe(true)
  })
})

describe('auditContrast', () => {
  it('passes the whole shipped palette, in night and in day', () => {
    const { passed, failed } = auditContrast([
      // Night: body text and the colours that carry meaning.
      { name: 'night ink on page', fg: NIGHT.ink, bg: NIGHT.bg },
      { name: 'night ink on block', fg: NIGHT.ink, bg: NIGHT.bgBlock },
      { name: 'night ink-strong on block', fg: NIGHT.inkStrong, bg: NIGHT.bgBlock },
      { name: 'night profit on block', fg: NIGHT.green, bg: NIGHT.bgBlock },
      { name: 'night loss on block', fg: NIGHT.orange, bg: NIGHT.bgBlock },
      // Muted text and the kill colour are large/bold in use, so AA-large is the bar.
      {
        name: 'night muted on page',
        fg: NIGHT.inkMuted,
        bg: NIGHT.bg,
        threshold: WCAG.AA_LARGE,
      },
      {
        name: 'night kill on block',
        fg: NIGHT.orangeHot,
        bg: NIGHT.bgBlock,
        threshold: WCAG.AA_LARGE,
      },
      // Day: the same meanings must survive a light surface.
      { name: 'day ink on page', fg: DAY.ink, bg: DAY.bg },
      { name: 'day ink on block', fg: DAY.ink, bg: DAY.bgBlock },
      { name: 'day profit on block', fg: DAY.green, bg: DAY.bgBlock },
      { name: 'day loss on block', fg: DAY.orange, bg: DAY.bgBlock },
      { name: 'day muted on page', fg: DAY.inkMuted, bg: DAY.bg },
    ])

    // If this fails, a token changed and the palette got harder to read — fix the token.
    expect(failed.map((f) => `${f.name} @ ${f.ratio}`)).toEqual([])
    expect(passed).toHaveLength(12)

    expect(auditContrast([])).toEqual({ passed: [], failed: [] })
    expect(auditContrast(null)).toEqual({ passed: [], failed: [] })
  })
})
