// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  DRAG_WARN,
  DRAG_BAD,
  grossVsFees,
  venueFeeSplit,
  drawFeeBars,
  refreshFees,
  startFeeBars,
} from './fees.js'
import { appState, tick, resetState } from '../app/engine.js'

const PALETTE = { up: 'G', down: 'O' }

const TRADES = [
  {
    pnl: 100,
    fees: 20,
    entryFills: [{ venue: 'okx', fee: 10 }],
    exitFills: [{ venue: 'okx', fee: 10 }],
  },
  {
    pnl: 100,
    fees: 20,
    entryFills: [{ venue: 'okx', fee: 5 }],
    // A round trip that opened on one venue and closed on another: the fee follows the leg.
    exitFills: [{ venue: 'etoro', fee: 15 }],
  },
]

/** A 2D context stand-in. */
function fakeCtx() {
  const fills = []
  return {
    fills,
    clearRect: () => {},
    fillRect(...args) {
      fills.push({ args, style: this.fillStyle })
    },
  }
}

beforeEach(() => {
  resetState()
})

describe('grossVsFees', () => {
  it('divides by gross, because over net the ratio explodes at break-even', () => {
    expect(grossVsFees(TRADES)).toMatchObject({
      gross: 200,
      fees: 40,
      net: 160,
      ratio: 0.2,
      ratioLabel: '20%',
      tone: 'up',
    })

    // Named tones rather than a colour gradient: "fees are 62% of gross" is a sentence a
    // trader acts on, and a slightly orange tile is one they get used to.
    expect(grossVsFees([{ pnl: 100, fees: 100 * DRAG_BAD }]).tone).toBe('down')
    expect(grossVsFees([{ pnl: 100, fees: 100 * DRAG_WARN }]).tone).toBe('warn')

    // A losing day has no meaningful ratio, and "—" says so rather than 0%.
    expect(grossVsFees([{ pnl: -10, fees: 5 }])).toMatchObject({ ratioLabel: '—', tone: 'flat' })
    expect(grossVsFees(null).trades).toBe(0)
  })
})

describe('venueFeeSplit', () => {
  it('attributes each leg to the venue that charged it', () => {
    const split = venueFeeSplit(TRADES)

    expect(split[0]).toMatchObject({ venue: 'okx', fees: 25, fills: 3 })
    expect(split[1]).toMatchObject({ venue: 'etoro', fees: 15, fills: 1, avgFee: 15 })

    // A fill with no venue is still a real cost and lands somewhere nameable.
    expect(venueFeeSplit([{ entryFills: [{ fee: 2 }], exitFills: [] }])[0].venue).toBe('unknown')
    expect(venueFeeSplit(null)).toEqual([])
  })
})

describe('drawFeeBars', () => {
  it('puts both bars on one scale, or 90% drag looks like a fair fight', () => {
    const ctx = fakeCtx()

    expect(drawFeeBars(ctx, { gross: 200, fees: 40 }, { width: 100, height: 30 }, PALETTE)).toBe(true)
    expect(ctx.fills[0].args[2]).toBe(100)
    // Fees are a fifth of gross, so the fee bar is a fifth of the width.
    expect(ctx.fills[1].args[2]).toBe(20)

    expect(drawFeeBars(ctx, { gross: 0, fees: 0 }, { width: 100, height: 30 }, PALETTE)).toBe(false)
    expect(drawFeeBars(null, {}, { width: 1, height: 1 }, PALETTE)).toBe(false)
    expect(drawFeeBars(ctx, { gross: 1 }, { width: 0, height: 0 }, PALETTE)).toBe(false)
    // No palette handed in: the theme's own colours, which is how the app calls it.
    expect(drawFeeBars(ctx, { gross: 200, fees: 40 }, { width: 100, height: 30 })).toBe(true)
  })
})

describe('refreshFees', () => {
  it('publishes the totals and the per-venue split together', () => {
    refreshFees(TRADES)
    tick()

    expect(appState.analytics.fees.ratioLabel).toBe('20%')
    expect(appState.analytics.venueFees).toHaveLength(2)
  })
})

describe('startFeeBars', () => {
  it('does nothing without a canvas and draws once when there is one', () => {
    expect(startFeeBars({ doc: { getElementById: () => null } })).toBeNull()

    const ctx = fakeCtx()
    const canvas = { clientWidth: 100, clientHeight: 30, style: {}, getContext: () => ctx }
    const redraw = startFeeBars({
      doc: { getElementById: () => canvas },
      raf: (fn) => fn(),
      totals: () => grossVsFees(TRADES),
    })

    expect(redraw).toBeInstanceOf(Function)
    expect(ctx.fills).toHaveLength(2)

    // And with no plumbing at all: the real document, the real rAF, the published totals.
    expect(startFeeBars()).toBeNull()

    const real = document.createElement('canvas')
    real.id = 'fees-canvas'
    document.body.append(real)
    expect(startFeeBars()).toBeInstanceOf(Function)
    real.remove()
  })
})
