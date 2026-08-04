// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  TILT_AT,
  outcomeOf,
  streaks,
  streakSegments,
  drawStreakStrip,
  refreshStreaks,
  startStreakStrip,
} from './streaks.js'
import { appState, tick, resetState } from '../app/engine.js'

const PALETTE = { up: 'G', down: 'O', grid: 'L' }

/** Close-ordered trades from a net sequence. */
function run(...nets) {
  return nets.map((net, index) => ({ id: `t${index}`, net }))
}

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

describe('outcomeOf', () => {
  it('names a scratch as its own thing', () => {
    expect(outcomeOf({ net: 1 })).toBe('win')
    expect(outcomeOf({ net: -1 })).toBe('loss')
    expect(outcomeOf({ net: 0 })).toBe('scratch')
    expect(outcomeOf(null)).toBe('scratch')
  })
})

describe('streaks', () => {
  it('breaks a run on a scratch rather than inventing a record that never happened', () => {
    expect(streaks(run(1, 1, -1, -1, -1))).toMatchObject({
      current: 3,
      outcome: 'loss',
      maxWin: 2,
      maxLoss: 3,
    })

    // A break-even trade is not a win and not a loss; folding it into either produces a
    // record streak nobody had.
    expect(streaks(run(1, 1, 0, 1))).toMatchObject({ current: 1, maxWin: 2 })

    // The hint fires on the run in progress, never on the record: six losers in March is not
    // a reason to warn every session since.
    expect(streaks(run(...Array(TILT_AT).fill(-1))).tilt).toBe(true)
    expect(streaks(run(...Array(TILT_AT).fill(-1), 1)).tilt).toBe(false)
    expect(streaks([])).toMatchObject({ current: 0, outcome: 'none', tilt: false })
  })
})

describe('streakSegments', () => {
  it('collapses the day into runs, keeping their order and their money', () => {
    const segments = streakSegments(run(1, 2, -1, 0, -3))

    expect(segments.map((segment) => `${segment.outcome}:${segment.length}`)).toEqual([
      'win:2',
      'loss:1',
      'scratch:1',
      'loss:1',
    ])
    expect(segments[0]).toMatchObject({ net: 3, startTradeId: 't0' })
    expect(streakSegments(null)).toEqual([])
  })
})

describe('drawStreakStrip', () => {
  it('draws the live run full height so it reads as still happening', () => {
    const ctx = fakeCtx()
    const trades = run(1, -1, -1)

    expect(drawStreakStrip(ctx, trades, { width: 90, height: 10 }, PALETTE)).toBe(3)
    // The first tick is history and inset; the trailing loss run is not.
    expect(ctx.fills[0].args[1]).toBeGreaterThan(0)
    expect(ctx.fills[2].args[1]).toBe(0)
    expect(ctx.fills[2].style).toBe('O')

    expect(drawStreakStrip(ctx, [], { width: 90, height: 10 }, PALETTE)).toBe(0)
    expect(drawStreakStrip(null, trades, { width: 1, height: 1 }, PALETTE)).toBe(0)
    expect(drawStreakStrip(ctx, trades, { width: 0, height: 0 }, PALETTE)).toBe(0)
    // No palette handed in: the theme's own colours, which is how the app calls it.
    expect(drawStreakStrip(ctx, trades, { width: 90, height: 10 })).toBe(3)
  })
})

describe('refreshStreaks', () => {
  it('reverses the journal, or the first run of the day reads as the current one', () => {
    // The journal publishes newest-first for reading.
    const summary = refreshStreaks([...run(1, -1, -1)].reverse())
    tick()

    expect(summary).toMatchObject({ current: 2, outcome: 'loss' })
    expect(appState.analytics.streaks.maxLoss).toBe(2)
    expect(appState.analytics.segments).toHaveLength(2)
  })
})

describe('startStreakStrip', () => {
  it('does nothing without a canvas and draws once when there is one', () => {
    expect(startStreakStrip({ doc: { getElementById: () => null } })).toBeNull()

    const ctx = fakeCtx()
    const canvas = { clientWidth: 90, clientHeight: 10, style: {}, getContext: () => ctx }
    const redraw = startStreakStrip({
      doc: { getElementById: () => canvas },
      raf: (fn) => fn(),
      trades: () => run(1, -1),
    })

    expect(redraw).toBeInstanceOf(Function)
    expect(ctx.fills).toHaveLength(2)

    // And with no plumbing at all: the real document, the real rAF, the published slice.
    expect(startStreakStrip()).toBeNull()

    const real = document.createElement('canvas')
    real.id = 'streak-canvas'
    document.body.append(real)
    expect(startStreakStrip()).toBeInstanceOf(Function)
    real.remove()
  })
})
