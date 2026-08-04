// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  SLOTS,
  DIFF_FIELDS,
  pinSlot,
  diffRunStats,
  drawCompare,
  refreshCompare,
  refreshRuns,
  pinRun,
  clearSlots,
  mountCompareChart,
  startCompareChart,
  registerCompareActions,
} from './compare.js'
import { appState, setValue, tick, resetState } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { clearActions, actionNames } from '../actions/registry.js'

const RUN_A = {
  id: 'a',
  at: 100,
  label: 'A',
  net: 10,
  expectancy: 2,
  trades: 5,
  winRate: 0.6,
  maxDrawdown: 3,
  fees: 1,
  curve: [{ i: 0, equity: 4 }, { i: 1, equity: 10 }],
}
const RUN_B = {
  id: 'b',
  at: 200,
  label: 'B',
  net: 25,
  expectancy: 5,
  trades: 5,
  winRate: 0.5,
  maxDrawdown: 8,
  fees: 2,
  curve: [{ i: 0, equity: -3 }, { i: 1, equity: 25 }],
}

/** A canvas double that records the draw calls it was asked for. */
function fakeCanvas() {
  const calls = []
  const ctx = new Proxy(
    { setTransform: () => {}, clearRect: () => calls.push('clear') },
    { get: (t, k) => t[k] ?? ((...a) => calls.push(`${String(k)}(${a.length})`)), set: () => true },
  )
  return { calls, canvas: { clientWidth: 200, clientHeight: 80, style: {}, getContext: () => ctx } }
}

beforeEach(() => {
  resetState()
  clearActions()
})

describe('pinSlot', () => {
  it('pins, unpins on a second click, and lets the oldest give way', () => {
    expect(pinSlot([], 'a')).toEqual(['a'])
    expect(pinSlot(['a'], 'b')).toEqual(['a', 'b'])

    // Every row is its own off switch, so no slot needs a second control to clear.
    expect(pinSlot(['a', 'b'], 'a')).toEqual(['b'])

    // The oldest gives way rather than the third pin being refused: making the trader
    // clear a slot before comparing is a click that answers nothing.
    expect(pinSlot(['a', 'b'], 'c')).toEqual(['b', 'c'])

    expect(pinSlot(['a'], '')).toEqual(['a'])
    expect(pinSlot(null, 'a')).toEqual(['a'])
    expect(SLOTS).toBe(2)
  })
})

describe('diffRunStats', () => {
  it('signs every delta and knows which direction is good for each stat', () => {
    const diffs = diffRunStats(RUN_A, RUN_B)
    const by = Object.fromEntries(diffs.map((d) => [d.key, d]))

    expect(diffs).toHaveLength(DIFF_FIELDS.length)
    // Signed always: an unsigned delta beside two numbers is a subtraction the reader has
    // to redo to know which way it went.
    expect(by.net).toMatchObject({ a: '10.00', b: '25.00', delta: '+15.00', tone: 'up' })

    // A bigger drawdown is worse, a bigger net is better — the direction is per field.
    expect(by.maxDrawdown).toMatchObject({ delta: '+5.00', tone: 'down' })
    expect(by.fees).toMatchObject({ delta: '+1.00', tone: 'down' })
    expect(by.winRate).toMatchObject({ delta: '-0.100', tone: 'down' })
    // More trades is neither on its own — and a zero delta gets no sign, because "+0"
    // reads as a change that did not happen.
    expect(by.trades).toMatchObject({ delta: '0', tone: 'flat' })

    expect(diffRunStats(null, null).every((d) => d.tone === 'flat')).toBe(true)
  })
})

describe('drawCompare', () => {
  it('draws both curves on one shared scale', () => {
    const { calls, canvas } = fakeCanvas()
    const ctx = canvas.getContext('2d')

    expect(drawCompare(ctx, [RUN_A.curve, RUN_B.curve], { width: 200, height: 80 })).toBe(true)
    expect(calls).toContain('clear')
    // Two curves plus the zero line: three strokes, so neither run was skipped.
    expect(calls.filter((c) => c.startsWith('stroke')).length).toBe(3)

    // Nothing pinned draws nothing rather than leaving the last pair on screen.
    calls.length = 0
    expect(drawCompare(ctx, [], { width: 200, height: 80 })).toBe(false)
    expect(calls).toContain('clear')

    expect(drawCompare(null, [RUN_A.curve], { width: 200, height: 80 })).toBe(false)
    expect(drawCompare(ctx, [RUN_A.curve], { width: 0, height: 0 })).toBe(false)
    // A single point is a run with one trade, not a crash.
    expect(drawCompare(ctx, [[{ i: 0, equity: 1 }]], { width: 200, height: 80 })).toBe(true)
  })
})

describe('refreshCompare', () => {
  it('publishes deltas only once both slots are full', () => {
    // A "difference" against an empty slot is the run's own numbers with a plus sign,
    // which reads as a comparison and is not one.
    const half = refreshCompare(['a'], [RUN_A, RUN_B])
    expect(half).toMatchObject({ a: RUN_A, b: null, diffs: [], hint: 'pin two runs to compare' })
    expect(half.curves).toHaveLength(1)

    const full = refreshCompare(['a', 'b'], [RUN_A, RUN_B])
    expect(full.diffs).toHaveLength(DIFF_FIELDS.length)
    expect(full.curves).toHaveLength(2)
    expect(full.hint).toBe('')

    // A pinned id that is no longer in the archive is an empty slot, not a throw.
    expect(refreshCompare(['gone'], [RUN_A]).a).toBeNull()
    expect(refreshCompare(null, null).diffs).toEqual([])
  })
})

describe('refreshRuns', () => {
  it('loads the archive into state and re-derives the comparison', async () => {
    setValue(PATHS.backtest.slots, ['a', 'b'])
    tick()

    const runs = await refreshRuns({
      db: {
        transaction: () => ({
          objectStore: () => ({
            getAll: () => {
              const request = {}
              Object.defineProperty(request, 'result', { value: [RUN_A, RUN_B] })
              queueMicrotask(() => request.onsuccess?.())
              return request
            },
          }),
        }),
      },
    })
    tick()

    expect(runs.map((r) => r.id)).toEqual(['b', 'a'])
    expect(appState.backtest.runs).toHaveLength(2)
    expect(appState.backtest.compare.diffs).toHaveLength(DIFF_FIELDS.length)

    expect(await refreshRuns({ db: null })).toEqual([])
  })
})

describe('pinRun', () => {
  it('moves a run into a slot and republishes the comparison', () => {
    setValue(PATHS.backtest.runs, [RUN_A, RUN_B])
    tick()

    expect(pinRun(null, { id: 'a' })).toEqual(['a'])
    tick()
    expect(appState.backtest.compare.a.id).toBe('a')
    expect(appState.backtest.compare.diffs).toEqual([])

    expect(pinRun(null, { id: 'b' })).toEqual(['a', 'b'])
    tick()
    expect(appState.backtest.compare.diffs).toHaveLength(DIFF_FIELDS.length)

    expect(pinRun(null, {})).toEqual(['a', 'b'])
  })
})

describe('clearSlots', () => {
  it('empties both slots and says so', () => {
    setValue(PATHS.backtest.slots, ['a', 'b'])
    setValue(PATHS.backtest.runs, [RUN_A, RUN_B])
    tick()

    expect(clearSlots()).toEqual([])
    tick()
    expect(appState.backtest.slots).toEqual([])
    expect(appState.backtest.compare.diffs).toEqual([])
    expect(appState.ui.toasts.some((t) => t.message.includes('cleared'))).toBe(true)
  })
})

describe('mountCompareChart', () => {
  it('re-rasterises and redraws whatever is pinned', () => {
    const { calls, canvas } = fakeCanvas()
    const redraw = mountCompareChart(canvas, { curves: () => [RUN_A.curve, RUN_B.curve] })

    redraw()
    expect(calls).toContain('clear')
    expect(calls.filter((c) => c.startsWith('stroke')).length).toBe(3)

    expect(mountCompareChart(null)()).toBeUndefined()
  })
})

describe('startCompareChart', () => {
  it('finds the canvas and repaints when the pair changes', () => {
    const { calls, canvas } = fakeCanvas()
    const frames = []
    const redraw = startCompareChart({
      doc: { getElementById: (id) => (id === 'compare-canvas' ? canvas : null) },
      raf: (fn) => frames.push(fn),
      curves: () => appState.backtest?.compare?.curves ?? [],
    })

    expect(typeof redraw).toBe('function')
    expect(calls).toContain('clear')

    refreshCompare(['a', 'b'], [RUN_A, RUN_B])
    tick()
    expect(frames).toHaveLength(1)

    expect(startCompareChart({ doc: { getElementById: () => null } })).toBeNull()
  })
})

describe('registerCompareActions', () => {
  it('binds the pin and the clear', () => {
    expect(registerCompareActions()).toEqual(['backtest.pin', 'backtest.clearSlots'])
    expect(actionNames().sort()).toEqual(['backtest.clearSlots', 'backtest.pin'])
  })
})
