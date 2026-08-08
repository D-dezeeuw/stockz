// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  MODES,
  HOLD_MS,
  parseModeParam,
  isPaper,
  serverTradingLive,
  setTradeMode,
  beginGoLive,
  cancelGoLive,
  applyModeParam,
  isFirstRun,
  applyFirstRunMode,
  dismissPaperHint,
  resetMode,
  registerModeActions,
} from './mode.js'
import { appState, setValue, tick, resetState } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { clearActions, actionNames } from '../actions/registry.js'
import { setKeys, clearKeys } from '../venues/vault.js'

/** A timer double that runs callbacks on demand. */
function fakeTimer() {
  const timeouts = []
  const intervals = []
  return {
    timeouts,
    intervals,
    setTimeout: (fn) => (timeouts.push(fn), timeouts.length),
    clearTimeout: (id) => (timeouts[id - 1] = null),
    setInterval: (fn) => (intervals.push(fn), intervals.length),
    clearInterval: (id) => (intervals[id - 1] = null),
  }
}

beforeEach(() => {
  resetState()
  resetMode()
  clearActions()
  clearKeys()
  // `resetState` empties the tree rather than reseeding it, so the paths this module
  // reads have to exist before it is asked anything.
  setValue(PATHS.trade.mode, 'paper')
  setValue(PATHS.trade.queue, [])
  setValue(PATHS.trade.holdPct, 0)
  setValue(PATHS.ui.toasts, [])
  setValue(PATHS.ui.paperHint, false)
  setValue(PATHS.settings.modeChosen, false)
  tick()
})

describe('parseModeParam', () => {
  it('accepts only the safe direction from a URL', () => {
    expect(parseModeParam('?mode=paper')).toBe('paper')
    expect(parseModeParam('?a=1&mode=PAPER&b=2')).toBe('paper')

    // A link may never force *live*. `?mode=live` in a URL somebody was sent is a way to
    // have a stranger's link start trading real money.
    expect(parseModeParam('?mode=live')).toBe('')
    expect(parseModeParam('?mode=nonsense')).toBe('')
    expect(parseModeParam('')).toBe('')
    expect(parseModeParam(null)).toBe('')
  })
})

describe('isPaper', () => {
  it('treats anything that is not exactly live as paper', () => {
    expect(isPaper({})).toBe(true)
    expect(isPaper({ trade: { mode: 'paper' } })).toBe(true)
    expect(isPaper({ trade: { mode: 'live' } })).toBe(false)

    // An unrecognised mode fails towards the side that cannot lose money.
    expect(isPaper({ trade: { mode: 'LIVE' } })).toBe(true)
    expect(isPaper({ trade: { mode: 'nonsense' } })).toBe(true)
  })
})

describe('serverTradingLive', () => {
  it('is true only when the host loop is both running and live', () => {
    expect(serverTradingLive({})).toBe(false)

    // Running on paper is not a conflict — two paper traders cost nothing and overlap
    // harmlessly. Only real money on both sides is the problem.
    expect(serverTradingLive({ trader: { view: { running: true, live: false } } })).toBe(false)

    // Nor is a live *configuration* that is not actually running.
    expect(serverTradingLive({ trader: { view: { running: false, live: true } } })).toBe(false)

    expect(serverTradingLive({ trader: { view: { running: true, live: true } } })).toBe(true)
  })
})

describe('setTradeMode', () => {
  it('clears the queue before it flips, and refuses live without keys', () => {
    setValue(PATHS.trade.queue, [{ id: 'queued' }])
    tick()

    // Refused rather than attempted: going live with no credentials fills the screen with
    // rejections that read as the desk being broken.
    expect(setTradeMode(null, { mode: 'live' })).toBe('paper')
    tick()
    expect(appState.trade.mode).toBe('paper')
    expect(appState.trade.queue).toHaveLength(1)

    setKeys('okx', { apiKey: 'k', secretKey: 's', passphrase: 'p' })
    expect(setTradeMode(null, { mode: 'live' })).toBe('live')
    tick()
    expect(appState.trade.mode).toBe('live')
    // Emptied *before* the flip: an intent queued a frame ago would otherwise drain
    // through whichever adapter happened to be bound when it ran.
    expect(appState.trade.queue).toEqual([])

    // Switching to the mode already in force is not a switch, so it does not clear a queue
    // that has since refilled.
    setValue(PATHS.trade.queue, [{ id: 'later' }])
    tick()
    expect(setTradeMode(null, { mode: 'live' })).toBe('live')
    tick()
    expect(appState.trade.queue).toHaveLength(1)

    expect(setTradeMode(null, { mode: 'paper' })).toBe('paper')
    expect(setTradeMode(null, { mode: 'nonsense' })).toBe('paper')
    expect(MODES).toEqual(['paper', 'live'])

    // And refused outright while the host loop is live: two traders on one account each
    // size against a position only they can see, and the venue would accept both.
    setValue(PATHS.trader.view, { running: true, live: true })
    tick()
    expect(setTradeMode(null, { mode: 'live' })).toBe('paper')
    tick()
    expect(appState.trade.mode).toBe('paper')
  })
})

describe('beginGoLive', () => {
  it('fills a ring over the hold and only then switches', () => {
    setKeys('okx', { apiKey: 'k', secretKey: 's', passphrase: 'p' })
    const timer = fakeTimer()
    let clock = 0

    expect(beginGoLive(null, { timer, now: () => clock, holdMs: 600 })).toBe(true)
    // A second press while one is running is the same press, not a second timer.
    expect(beginGoLive(null, { timer })).toBe(true)
    expect(timer.timeouts.filter(Boolean)).toHaveLength(1)

    // The ring fills from the timer, so what is shown is the progress actually kept.
    clock = 300
    timer.intervals[0]()
    tick()
    expect(appState.trade.holdPct).toBe(0.5)

    timer.timeouts[0]()
    tick()
    expect(appState.trade.mode).toBe('live')
    expect(appState.trade.holdPct).toBe(0)
    expect(HOLD_MS).toBe(600)
  })
})

describe('cancelGoLive', () => {
  it('abandons the press so releasing early costs nothing', () => {
    setKeys('okx', { apiKey: 'k', secretKey: 's', passphrase: 'p' })
    const timer = fakeTimer()
    beginGoLive(null, { timer, holdMs: 600 })

    expect(cancelGoLive(null, { timer })).toBe(true)
    tick()
    expect(timer.timeouts[0]).toBeNull()
    expect(appState.trade.mode).toBe('paper')
    expect(appState.trade.holdPct).toBe(0)

    // Nothing held is not an error.
    expect(cancelGoLive(null, { timer })).toBe(false)
  })
})

describe('applyModeParam', () => {
  it('lets a link force paper, silently, before anything binds', () => {
    setValue(PATHS.trade.mode, 'live')
    tick()

    expect(applyModeParam('?mode=paper')).toBe('paper')
    tick()
    expect(appState.trade.mode).toBe('paper')
    // Silent: this runs before the toast host exists, and a link opening into paper is not
    // news worth announcing.
    expect(appState.ui.toasts).toEqual([])

    expect(applyModeParam('?mode=live')).toBe('')
    expect(applyModeParam('')).toBe('')
  })
})

describe('isFirstRun', () => {
  it('is true until the trader has met the mode control', () => {
    expect(isFirstRun({})).toBe(true)
    expect(isFirstRun({ settings: {} })).toBe(true)
    expect(isFirstRun({ settings: { modeChosen: true } })).toBe(false)
  })
})

describe('applyFirstRunMode', () => {
  it('starts a new desk on paper and shows the hint exactly once', () => {
    setValue(PATHS.trade.mode, 'live')
    tick()

    // The first trade on STOCKZ is always a free one: the alternative is a stranger's
    // first click reaching a venue.
    expect(applyFirstRunMode()).toEqual({ mode: 'paper', hint: true })
    tick()
    expect(appState.trade.mode).toBe('paper')
    expect(appState.ui.paperHint).toBe(true)

    setValue(PATHS.settings.modeChosen, true)
    setValue(PATHS.trade.mode, 'live')
    tick()
    // A returning trader keeps the mode they chose, and is not lectured about it.
    expect(applyFirstRunMode()).toEqual({ mode: 'live', hint: false })
    tick()
    expect(appState.trade.mode).toBe('live')
    expect(appState.ui.paperHint).toBe(false)
  })
})

describe('dismissPaperHint', () => {
  it('puts the hint away for good', () => {
    applyFirstRunMode()
    tick()
    expect(appState.ui.paperHint).toBe(true)

    expect(dismissPaperHint()).toBe(true)
    tick()
    expect(appState.ui.paperHint).toBe(false)
    // Recorded in the persisted branch: a hint that came back on every reload is one
    // nobody reads by the third time.
    expect(appState.settings.modeChosen).toBe(true)
    expect(isFirstRun()).toBe(false)
  })
})

describe('resetMode', () => {
  it('forgets a hold in progress', () => {
    beginGoLive(null, { timer: fakeTimer() })
    expect(resetMode()).toBe(true)
    expect(cancelGoLive(null, {})).toBe(false)
  })
})

describe('registerModeActions', () => {
  it('binds the switch, both halves of the hold, and the account reset', () => {
    expect(registerModeActions()).toEqual([
      'trade.setMode',
      'trade.holdLive',
      'trade.releaseLive',
      'trade.resetPaper',
      'trade.holdReset',
      'trade.dismissHint',
    ])
    expect(actionNames().sort()).toEqual([
      'trade.dismissHint',
      'trade.holdLive',
      'trade.holdReset',
      'trade.releaseLive',
      'trade.resetPaper',
      'trade.setMode',
    ])
  })
})
