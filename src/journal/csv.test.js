import { describe, it, expect, beforeEach } from 'vitest'
import {
  CSV_COLUMNS,
  fixed,
  isoOrBlank,
  toCsvField,
  toCsvRow,
  buildCsv,
  csvName,
  exportCsv,
  registerCsvActions,
} from './csv.js'
import { ACTIONS } from '../actions/names.js'
import { clearActions } from '../actions/registry.js'
import { setValue, tick, resetState } from '../app/engine.js'
import { PATHS } from '../state/paths.js'

const TRADE = {
  instrument: 'BTC-USDT',
  side: 'long',
  qty: 2,
  entryPx: 100,
  exitPx: 110,
  openTs: 1000,
  closeTs: 4000,
  hold: 3000,
  pnl: 20,
  fees: 2,
  slippage: 0.5,
  net: 18,
  mae: -8,
  mfe: 30,
  r: 0,
  tags: ['plan', 'good-exit'],
  note: 'chased it, "worked" anyway\nnext time wait',
}

beforeEach(() => {
  resetState()
  clearActions()
})

describe('fixed', () => {
  it('leaves a missing number blank rather than calling it zero', () => {
    expect(fixed(1.239, 2)).toBe('1.24')
    expect(fixed(3, 0)).toBe('3')

    // A spreadsheet averaging a column cannot tell an absent number from a real zero, and
    // one of those changes the answer.
    expect(fixed(null, 2)).toBe('')
    expect(fixed(NaN, 2)).toBe('')
  })
})

describe('isoOrBlank', () => {
  it('writes ISO 8601, never a locale string', () => {
    expect(isoOrBlank(0)).toBe('')
    expect(isoOrBlank(Date.UTC(2026, 7, 4, 12))).toBe('2026-08-04T12:00:00.000Z')
    expect(isoOrBlank('nonsense')).toBe('')
  })
})

describe('toCsvField', () => {
  it('escapes per RFC 4180, not "wrap it if it has a comma"', () => {
    expect(toCsvField('plain')).toBe('plain')
    expect(toCsvField('a,b')).toBe('"a,b"')
    // A quote inside is doubled, not dropped: a note containing one is a note a trader wrote.
    expect(toCsvField('say "hi"')).toBe('"say ""hi"""')
    expect(toCsvField('line\nbreak')).toBe('"line\nbreak"')
    expect(toCsvField(null)).toBe('')
  })
})

describe('toCsvRow', () => {
  it('joins the fields it has escaped', () => {
    expect(toCsvRow(['a', 'b,c', 2])).toBe('a,"b,c",2')
    expect(toCsvRow(null)).toBe('')
  })
})

describe('buildCsv', () => {
  it('always writes the header, even for an empty journal', () => {
    const empty = buildCsv([])
    expect(empty.split('\r\n')[0]).toBe(CSV_COLUMNS.map((column) => column.header).join(','))

    const doc = buildCsv([TRADE])
    const lines = doc.split('\r\n')
    expect(lines).toHaveLength(3)
    expect(lines[1]).toContain('BTC-USDT,long,2.00000000')
    expect(lines[1]).toContain('plan good-exit')
    // The note's quote, comma and newline all survive intact.
    expect(doc).toContain('""worked""')

    expect(buildCsv(null).trim()).toBe(CSV_COLUMNS.map((column) => column.header).join(','))
  })
})

describe('csvName', () => {
  it('date-stamps the file so a month of exports sorts itself', () => {
    expect(csvName(Date.UTC(2026, 7, 4))).toBe('stockz-trades-20260804.csv')
    expect(csvName(0)).toBe('stockz-trades-19700101.csv')
  })
})

describe('exportCsv', () => {
  it('exports the slice on screen, not every trade there has ever been', () => {
    setValue(PATHS.journal.filtered, [TRADE])
    tick()

    const written = []
    const result = exportCsv({ now: 0, download: (file) => written.push(file) })

    expect(result).toEqual({ name: 'stockz-trades-19700101.csv', rows: 1 })
    // An export that ignored the filters would be a surprise nobody checks for until the
    // review.
    expect(written[0].text).toContain('BTC-USDT')
    expect(written[0].type).toBe('text/csv')

    // An empty journal still produces a valid file rather than a broken one.
    expect(exportCsv({ now: 0, rows: [], download: (file) => written.push(file) }).rows).toBe(0)
    expect(written[1].text.trim()).toBe(CSV_COLUMNS.map((column) => column.header).join(','))
  })
})

describe('registerCsvActions', () => {
  it('binds the download button', () => {
    expect(registerCsvActions()).toBe(ACTIONS.journal.csv)
  })
})
