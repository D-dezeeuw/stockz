import { describe, it, expect } from 'vitest'
import {
  sessionClock,
  openingRange,
  driveSignal,
  oneShotGuard,
  trailStop,
  driveTick,
  openDriveStrategy,
  SESSIONS,
} from './open-drive.js'
import { createStrategyContext } from '../contract.js'

const DAY = 86400000
const LONDON = 7 * 3600000

function driving(params = {}) {
  const ctx = createStrategyContext({
    strategy: openDriveStrategy,
    instrument: 'okx:BTC-USDT',
    params: {
      rangeMs: 300000,
      windowMs: 900000,
      bufferTicks: 2,
      trailTicks: 10,
      maxEntries: 1,
      tickSize: 0.1,
      ...params,
    },
  })
  openDriveStrategy.init(ctx)
  return ctx
}

describe('sessionClock', () => {
  it('never counts down to a bell that has already gone', () => {
    // Two minutes into the London open.
    const at = sessionClock(LONDON + 120000, 900000)
    expect(at.active).toBe('london')
    expect(at.sinceOpenMs).toBe(120000)

    // Well past the window: no session is trading, but the next one still has a countdown.
    const between = sessionClock(LONDON + 3600000, 900000)
    expect(between.active).toBe('')
    // A "-4h to open" label is worse than useless.
    expect(between.secondsToOpen).toBeGreaterThan(0)
    expect(between.next).toBeTruthy()

    expect(sessionClock(NaN, 900000).active).toBe('')
    expect(SESSIONS.map((s) => s.id)).toContain('newyork')
  })
})

describe('openingRange', () => {
  it('stops growing, because a box that keeps extending never breaks', () => {
    let range = openingRange(null, 100, 0, 300000)
    range = openingRange(range, 105, 60000, 300000)
    range = openingRange(range, 98, 120000, 300000)

    expect(range).toMatchObject({ high: 105, low: 98, closed: false })

    // Past the build window it closes and stops taking prints.
    const closed = openingRange(range, 200, 400000, 300000)
    expect(closed).toEqual({ high: 105, low: 98, closed: true })

    expect(openingRange(null, NaN, 0, 300000).closed).toBe(false)
    expect(openingRange(range, 100, -1, 300000).high).toBe(105)
  })
})

describe('driveSignal', () => {
  it('will not trade a box that is still being built', () => {
    const range = { high: 105, low: 98, closed: true }

    expect(driveSignal(105.5, range, 2, 0.1, true)).toMatchObject({ action: 'buy' })
    expect(driveSignal(97.5, range, 2, 0.1, true)).toMatchObject({ action: 'sell' })
    expect(driveSignal(105.5, range, 2, 0.1, true).reason).toMatch(/above 105/)

    // Inside the box, or a box still open, is not a break.
    expect(driveSignal(102, range, 2, 0.1, true)).toBeNull()
    expect(driveSignal(105.5, { ...range, closed: false }, 2, 0.1, true)).toBeNull()
    // Outside the trading window nothing fires however the price moves.
    expect(driveSignal(105.5, range, 2, 0.1, false)).toBeNull()
  })
})

describe('oneShotGuard', () => {
  it('stops the revenge re-entry, which is the trade that makes a bad day', () => {
    const state = {}

    expect(oneShotGuard(state, 'london', 1)).toBe(true)
    state.entries = 1
    // The second attempt at a failed drive is exactly the one taken when annoyed.
    expect(oneShotGuard(state, 'london', 1)).toBe(false)

    // A new session resets the count.
    expect(oneShotGuard(state, 'newyork', 1)).toBe(true)

    expect(oneShotGuard(state, 'newyork', 3)).toBe(true)
    expect(oneShotGuard(null, 'london', 1)).toBe(false)
    expect(oneShotGuard(state, '', 1)).toBe(false)
  })
})

describe('trailStop', () => {
  it('ratchets one way only, which is the whole point of trailing', () => {
    const long = { side: 'buy', stop: 100 }

    // Price up moves the stop up.
    expect(trailStop(long, 112, 10, 0.1)).toEqual({ stop: 111, hit: false })
    // Price back down leaves it where it was — a stop that could fall gives back the point.
    expect(trailStop(long, 105, 10, 0.1)).toEqual({ stop: 104, hit: false })
    expect(trailStop({ side: 'buy', stop: 104 }, 103, 10, 0.1).hit).toBe(true)

    const short = { side: 'sell', stop: 110 }
    expect(trailStop(short, 100, 10, 0.1)).toEqual({ stop: 101, hit: false })
    expect(trailStop(short, 111, 10, 0.1).hit).toBe(true)

    expect(trailStop(null, 100, 10, 0.1)).toEqual({ stop: 0, hit: false })
  })
})

describe('driveTick', () => {
  it('builds the box, breaks it once, and forgets it between sessions', () => {
    const ctx = driving()

    // The opening range forms over the first five minutes.
    driveTick(ctx, { ts: LONDON + 1000, px: 100 })
    driveTick(ctx, { ts: LONDON + 60000, px: 105 })
    driveTick(ctx, { ts: LONDON + 120000, px: 98 })
    expect(ctx.state.range).toMatchObject({ high: 105, low: 98 })

    // A break inside the trading window fires once.
    driveTick(ctx, { ts: LONDON + 400000, px: 104 })
    const fired = driveTick(ctx, { ts: LONDON + 410000, px: 106 })
    expect(fired).toMatchObject({ action: 'buy' })
    expect(ctx.state.entries).toBe(1)

    // The trailing stop takes it out on the pullback.
    driveTick(ctx, { ts: LONDON + 420000, px: 120 })
    const exit = driveTick(ctx, { ts: LONDON + 430000, px: 110 })
    expect(exit).toMatchObject({ action: 'flat', reason: 'trailing stop' })

    // Well outside the window the box is discarded: yesterday's opening range is a memory.
    driveTick(ctx, { ts: LONDON + 4000000, px: 100 })
    expect(ctx.state.range).toBeNull()

    expect(driveTick(null, { px: 1 })).toBeNull()
  })
})

describe('openDriveStrategy', () => {
  it('publishes its countdown, so the desk knows when it will wake up', () => {
    expect(openDriveStrategy.id).toBe('open-drive')
    expect(openDriveStrategy.params.maxEntries.default).toBe(1)

    const ctx = driving()
    driveTick(ctx, { ts: LONDON - 600000 + DAY, px: 100 })

    expect(ctx.state.countdown).toBeGreaterThan(0)
    expect(ctx.state.session).toBeTruthy()
    expect(openDriveStrategy.onCandle()).toBeNull()
  })
})
