import { describe, it, expect, beforeEach } from 'vitest'
import {
  WEEKDAYS,
  bucketByHour,
  scaleMax,
  cellColor,
  drawHeatmap,
  cellStats,
  hourExtremes,
  refreshHeatmap,
  startHeatmap,
} from './heatmap.js'
import { appState, tick, resetState } from '../app/engine.js'

const PALETTE = { up: 'G', down: 'O', grid: 'L', bg: 'B', muted: 'M' }

/** Local-time trades, so the buckets land where the trader's clock says. */
function at(day, hour, net) {
  // 2026-08-02 is a Sunday, so day 0..6 maps straight onto the row order.
  const date = new Date(2026, 7, 2 + day, hour, 30)
  return { closeTs: date.getTime(), net }
}

/** A 2D context stand-in. */
function fakeCtx() {
  const fills = []
  return {
    fills,
    clearRect: () => {},
    fillText: () => {},
    fillRect: (...args) => fills.push(args),
  }
}

beforeEach(() => {
  resetState()
})

describe('bucketByHour', () => {
  it('buckets on the local clock, because this is a question about a body clock', () => {
    const cells = bucketByHour([at(1, 9, 10), at(1, 9, -4), at(3, 14, 6)])

    expect(cells).toHaveLength(168)
    const monday9 = cells.find((cell) => cell.day === 1 && cell.hour === 9)
    expect(monday9).toMatchObject({ net: 6, count: 2, wins: 1 })

    expect(cells.find((cell) => cell.day === 3 && cell.hour === 14).net).toBe(6)
    // A trade that never closed belongs to no hour.
    expect(bucketByHour([{ net: 5 }]).every((cell) => cell.count === 0)).toBe(true)
    expect(bucketByHour(null)).toHaveLength(168)
  })
})

describe('scaleMax', () => {
  it('is anchored only by hours that were actually traded', () => {
    const cells = bucketByHour([at(1, 9, 10), at(2, 10, -25)])

    // An untraded hour is not a zero-performance hour, and letting an absence set the scale
    // would change how a real number is coloured.
    expect(scaleMax(cells)).toBe(25)
    expect(scaleMax(bucketByHour([]))).toBe(0)
    expect(scaleMax(null)).toBe(0)
  })
})

describe('cellColor', () => {
  it('never paints an untraded hour as break-even', () => {
    // "This hour breaks even" is a claim nobody made about an hour never traded.
    expect(cellColor({ count: 0, net: 0 }, 10, PALETTE)).toBe('B')
    expect(cellColor({ count: 2, net: 0 }, 10, PALETTE)).toBe('L')

    // Symmetric: a +50 hour and a -50 hour are equally loud.
    expect(cellColor({ count: 1, net: 10 }, 10, PALETTE)).toContain('G')
    expect(cellColor({ count: 1, net: -10 }, 10, PALETTE)).toContain('O')
    expect(cellColor({ count: 1, net: 10 }, 10, PALETTE)).toContain('100%')

    expect(cellColor(null, 10, PALETTE)).toBe('B')
    expect(cellColor({ count: 1, net: 5 }, 0, PALETTE)).toBe('L')
  })
})

describe('drawHeatmap', () => {
  it('paints every cell, so the empty ones are visibly empty', () => {
    const ctx = fakeCtx()

    expect(drawHeatmap(ctx, bucketByHour([at(1, 9, 10)]), { width: 300, height: 70 }, PALETTE)).toBe(168)
    expect(ctx.fills).toHaveLength(168)

    expect(drawHeatmap(ctx, [], { width: 300, height: 70 }, PALETTE)).toBe(0)
    expect(drawHeatmap(null, [], { width: 1, height: 1 }, PALETTE)).toBe(0)
  })
})

describe('cellStats', () => {
  it('says "—" for an hour never traded, like the KPI tiles do', () => {
    expect(cellStats({ day: 1, hour: 9, net: 6, count: 2, wins: 1 })).toEqual({
      label: 'Mon 09:00',
      net: 6,
      count: 2,
      winRate: '50%',
    })

    expect(cellStats({ day: 0, hour: 0, net: 0, count: 0, wins: 0 }).winRate).toBe('—')
    expect(cellStats(null)).toBeNull()
    expect(WEEKDAYS[0]).toBe('Sun')
  })
})

describe('hourExtremes', () => {
  it('names the hour that costs the money, which is the point of the whole grid', () => {
    const cells = bucketByHour([at(1, 9, 10), at(2, 14, -25), at(3, 11, 2)])
    const extremes = hourExtremes(cells)

    expect(extremes.best.label).toBe('Mon 09:00')
    expect(extremes.worst).toMatchObject({ label: 'Tue 14:00', net: -25 })

    expect(hourExtremes(bucketByHour([]))).toEqual({ best: null, worst: null })
  })
})

describe('refreshHeatmap', () => {
  it('publishes only the traded cells, not a hundred and sixty-eight zeroes', () => {
    refreshHeatmap([at(1, 9, 10), at(2, 14, -25)])
    tick()

    expect(appState.analytics.hours).toHaveLength(2)
    expect(appState.analytics.hourExtremes.worst.net).toBe(-25)
  })
})

describe('startHeatmap', () => {
  it('does nothing without a canvas and draws once when there is one', () => {
    expect(startHeatmap({ doc: { getElementById: () => null } })).toBeNull()

    const ctx = fakeCtx()
    const canvas = { clientWidth: 300, clientHeight: 70, style: {}, getContext: () => ctx }

    const redraw = startHeatmap({
      doc: { getElementById: () => canvas },
      raf: (fn) => fn(),
      cells: () => bucketByHour([at(1, 9, 10)]),
    })

    expect(redraw).toBeInstanceOf(Function)
    expect(ctx.fills.length).toBe(168)
  })
})
