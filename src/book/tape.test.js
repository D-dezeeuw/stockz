import { describe, it, expect, beforeEach } from 'vitest'
import {
  pushPrint,
  toPrint,
  sideClass,
  formatTapeTime,
  formatSizeShort,
  tapeRows,
  flushTape,
  passesFilter,
  hiddenCount,
  filterTape,
  registerTapeActions,
  TAPE_CAPACITY,
} from './tape.js'
import { publishTick, resetBus } from '../pipeline/bus.js'
import { appState, setValue, tick, resetState } from '../app/engine.js'
import { clearActions, dispatchAction } from '../actions/registry.js'

beforeEach(() => {
  resetBus()
  resetState()
})

describe('pushPrint', () => {
  it('keeps the tape newest-first and hard-capped', () => {
    const one = pushPrint([], { px: 100, sz: 1 })
    const two = pushPrint(one, { px: 101, sz: 2 })

    // Newest first, so the template never reverses a 500-entry array on a frame.
    expect(two.map((p) => p.px)).toEqual([101, 100])
    // A new array every time: mutating in place would skip change detection.
    expect(two).not.toBe(one)

    const full = Array.from({ length: 5 }, (_, i) => ({ px: i, sz: 1 }))
    expect(pushPrint(full, { px: 99, sz: 1 }, 3).map((p) => p.px)).toEqual([99, 0, 1])

    // A print with no price is not a print.
    expect(pushPrint(two, { sz: 1 })).toBe(two)
    expect(pushPrint(null, { px: 1 })).toHaveLength(1)
    expect(TAPE_CAPACITY).toBe(500)
  })
})

describe('toPrint', () => {
  it('normalises a trade and defaults to the buy side when nothing says otherwise', () => {
    expect(toPrint({ px: '100.5', sz: '2', side: 'SELL', ts: 1000 })).toEqual({
      px: 100.5,
      sz: 2,
      side: 'sell',
      ts: 1000,
    })

    expect(toPrint({ px: 1, side: 'buy' })).toEqual({ px: 1, sz: 0, side: 'buy', ts: 0 })
    expect(toPrint({ px: 1 }).side).toBe('buy')

    expect(toPrint({ sz: 1 })).toBeNull()
    expect(toPrint(null)).toBeNull()
  })
})

describe('sideClass', () => {
  it('tells aggression apart in a blink', () => {
    expect(sideClass('sell')).toBe('tape__row tape__row--sell')
    expect(sideClass('SELL')).toBe('tape__row tape__row--sell')
    expect(sideClass('buy')).toBe('tape__row tape__row--buy')

    // Anything unrecognised renders as a row, never as an unstyled one.
    expect(sideClass(null)).toBe('tape__row tape__row--buy')
  })
})

describe('formatTapeTime', () => {
  it('keeps milliseconds, because prints share a second constantly', () => {
    expect(formatTapeTime(Date.UTC(2026, 7, 3, 9, 30, 1, 7))).toBe('09:30:01.007')
    expect(formatTapeTime(NaN)).toBe('--:--:--.---')
  })
})

describe('formatSizeShort', () => {
  it('trades precision for magnitude, since the eye is scanning for the outlier', () => {
    expect(formatSizeShort(1234567)).toBe('1.2M')
    expect(formatSizeShort(1234)).toBe('1.2K')
    expect(formatSizeShort(12.345)).toBe('12.35')

    // Sub-unit sizes keep their decimals — on some instruments that *is* the size.
    expect(formatSizeShort(0.755)).toBe('0.7550')
    expect(formatSizeShort(-2500)).toBe('-2.5K')
    expect(formatSizeShort('x')).toBe('—')
  })
})

describe('tapeRows', () => {
  it('reads the pipeline buffer newest-first with everything the template needs', () => {
    publishTick({ symbol: 'BTC-USDT', px: 100, sz: 1500, side: 'buy', ts: 1000, venue: 'okx' })
    publishTick({ symbol: 'BTC-USDT', px: 101, sz: 2, side: 'sell', ts: 2000, venue: 'okx' })
    publishTick({ symbol: 'ETH-USDT', px: 9, sz: 1, side: 'buy', ts: 3000, venue: 'okx' })

    const rows = tapeRows('BTC-USDT')

    // Newest print at the top, and the other instrument's flow stays out of it.
    expect(rows.map((r) => r.px)).toEqual([101, 100])
    expect(rows[0]).toMatchObject({
      side: 'sell',
      cls: 'tape__row tape__row--sell',
      sizeLabel: '2.00',
    })
    expect(rows[1].sizeLabel).toBe('1.5K')
    expect(rows[1].timeLabel).toBe(formatTapeTime(1000))
    expect(rows[1].priceLabel).toBe('100.00')

    expect(tapeRows('BTC-USDT', { limit: 1 })).toHaveLength(1)
    expect(tapeRows('NOTHING')).toEqual([])
  })
})

describe('flushTape', () => {
  it('writes the focused symbol\'s tape once, however many prints landed', () => {
    publishTick({ symbol: 'BTC-USDT', px: 100, sz: 1, side: 'buy', ts: 1000, venue: 'okx' })
    publishTick({ symbol: 'BTC-USDT', px: 101, sz: 1, side: 'sell', ts: 2000, venue: 'okx' })

    expect(flushTape('BTC-USDT', { tickSize: 0.1 })).toBe(2)
    tick()
    expect(appState.market.tape.map((r) => r.priceLabel)).toEqual(['101.0', '100.0'])

    // A floor thins the tape and publishes what it is hiding.
    publishTick({ symbol: 'BTC-USDT', px: 102, sz: 50, side: 'buy', ts: 3000, venue: 'okx' })
    expect(flushTape('BTC-USDT', { minSize: 10, multiplier: 4 })).toBe(1)
    tick()
    expect(appState.market.tape.map((r) => r.px)).toEqual([102])
    expect(appState.market.tapeHidden).toBe(2)

    // Nothing focused writes nothing rather than blanking the tape.
    expect(flushTape('')).toBe(0)
    expect(flushTape('QUIET-PAIR')).toBe(0)
  })
})

describe('passesFilter', () => {
  it('hides dust but never a whale, whatever the floor is set to', () => {
    expect(passesFilter({ sz: 10 }, 5)).toBe(true)
    expect(passesFilter({ sz: 4 }, 5)).toBe(false)
    expect(passesFilter({ sz: 5 }, 5)).toBe(true)

    // The one print that most changes what the flow means must not be a casualty of
    // hiding dust.
    expect(passesFilter({ sz: 0.001 }, 1000, true)).toBe(true)

    // No floor set shows everything rather than nothing.
    expect(passesFilter({ sz: 1 }, 0)).toBe(true)
    expect(passesFilter({ sz: 1 }, NaN)).toBe(true)
    expect(passesFilter({}, 5)).toBe(false)
  })
})

describe('hiddenCount', () => {
  it('counts what the floor is suppressing, whales excluded', () => {
    const prints = [{ sz: 1 }, { sz: 2 }, { sz: 3 }, { sz: 100 }]

    // Median is 2.5, so the 100 is a whale and shows regardless; 1 and 2 are hidden.
    expect(hiddenCount(prints, 3)).toBe(2)
    expect(hiddenCount(prints, 0)).toBe(0)

    // A supplied baseline changes what counts as a whale: against a median of 100
    // nothing here clears 4×, so the big print loses its bypass and the floor hides it.
    expect(hiddenCount(prints, 200, { median: 100, multiplier: 4 })).toBe(4)
    expect(hiddenCount(prints, 200)).toBe(3)

    expect(hiddenCount(null, 5)).toBe(0)
  })
})

describe('filterTape', () => {
  it('thins the tape to meaningful flow and reports what it removed', () => {
    const { rows, hidden } = filterTape(
      [{ sz: 1 }, { sz: 2 }, { sz: 3 }, { sz: 100 }],
      { minSize: 3 },
    )

    expect(rows.map((r) => r.sz)).toEqual([3, 100])
    expect(hidden).toBe(2)
    // Rows come back flagged, so the template does not re-derive whale status.
    expect(rows[1].whale).toBe(true)
    expect(rows[0].whale).toBe(false)

    // No floor leaves the tape exactly as it was, still flagged.
    expect(filterTape([{ sz: 1 }], {})).toEqual({ rows: [{ sz: 1, whale: false }], hidden: 0 })
    expect(filterTape(null)).toEqual({ rows: [], hidden: 0 })
  })
})

describe('registerTapeActions', () => {
  it('stores the noise floor per instrument, since size means different things', () => {
    clearActions()
    const name = registerTapeActions()
    expect(name).toBe('book.setFloor')

    setValue('market.focus', 'okx:BTC-USDT')
    tick()

    expect(dispatchAction(name, { minSize: 0.5 })).toBe(true)
    tick()
    expect(appState.settings.tapeFloors['okx:BTC-USDT']).toBe(0.5)

    // Zero is the "show everything" setting, not a rejected value.
    expect(dispatchAction(name, 0)).toBe(true)
    tick()
    expect(appState.settings.tapeFloors['okx:BTC-USDT']).toBe(0)

    expect(dispatchAction(name, { symbol: '', minSize: 1 })).toBe(false)
    expect(dispatchAction(name, -5)).toBe(false)
  })
})
