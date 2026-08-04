// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  AUTOPILOT_STRATEGIES,
  autopilotEnabled,
  flyOn,
  syncArm,
  startAutopilot,
} from './autopilot.js'
import { registerStrategyActions, liveRuns, resetStrategies } from '../strategy/registry.js'
import { appState, setValue, tick, resetState } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { clearActions } from '../actions/registry.js'

beforeEach(() => {
  resetState()
  clearActions()
  resetStrategies()
  registerStrategyActions()
})

describe('autopilotEnabled', () => {
  it('is on unless switched off, because a paper desk that sits idle teaches nothing', () => {
    expect(autopilotEnabled({})).toBe(true)
    expect(autopilotEnabled({ settings: {} })).toBe(true)
    expect(autopilotEnabled({ settings: { autopilot: false } })).toBe(false)
  })
})

describe('flyOn', () => {
  it('puts the set on one instrument and takes it off the last one', () => {
    const started = flyOn('okx:BTC-USDT')

    expect(started).toHaveLength(AUTOPILOT_STRATEGIES.length)
    expect(liveRuns().every((run) => run.instrument === 'BTC-USDT')).toBe(true)

    // The set is chosen to disagree: a burst and a fade take opposite sides of the same
    // stretch, and four strategies that always agree are one strategy with four names.
    expect(AUTOPILOT_STRATEGIES).toContain('momentum-burst')
    expect(AUTOPILOT_STRATEGIES).toContain('vwap-revert')
    // Paper cannot honestly simulate queue position, so the passive quoter stays out.
    expect(AUTOPILOT_STRATEGIES).not.toContain('spread-capture')

    // A focus change moves the whole set rather than accumulating runs on instruments
    // that no longer receive ticks.
    flyOn('okx:ETH-USDT')
    expect(liveRuns()).toHaveLength(AUTOPILOT_STRATEGIES.length)
    expect(liveRuns().every((run) => run.instrument === 'ETH-USDT')).toBe(true)

    // Idempotent: re-pointing at the same instrument must not double-subscribe.
    flyOn('okx:ETH-USDT')
    expect(liveRuns()).toHaveLength(AUTOPILOT_STRATEGIES.length)

    expect(flyOn('')).toEqual([])
  })
})

describe('syncArm', () => {
  it('arms in both modes and never leaves dry run stacked on top', () => {
    // Paper is the default, so a fresh desk flies.
    expect(syncArm()).toBe(true)
    tick()
    expect(appState.settings.botArmed).toBe(true)
    // An armed bot with nothing opted in is armed in name only — the runner gates on both.
    expect(appState.settings.botStrategies['momentum-burst']).toBe(true)
    // And dry run comes off. Stacking dry run on paper means nothing happens twice over:
    // dry run logs an order and returns a fake id, so a paper desk produced no fills, no
    // positions and no P&L - the exact "why is nothing trading".
    expect(appState.settings.botDryRun).toBe(false)

    // Live keeps flying. Ticking live trading in the key modal — which cannot be done
    // without credentials — is the decision; a desk that stopped trading the moment its
    // owner said "trade for real" would do the opposite of what it was told.
    setValue(PATHS.trade.mode, 'live')
    tick()
    expect(syncArm()).toBe(true)
    tick()
    expect(appState.settings.botArmed).toBe(true)
    expect(appState.settings.botStrategies['momentum-burst']).toBe(true)
    // And dry run stays off here too: narrating orders it declines to send is the same
    // bug wearing a safety label. The gates that actually stop a bad session — breakers,
    // caps, throttle, kill switch — are downstream of this and unchanged.
    expect(appState.settings.botDryRun).toBe(false)

    // The one switch that does ground it is its own.
    setValue(PATHS.trade.mode, 'paper')
    setValue(PATHS.settings.autopilot, false)
    tick()
    expect(syncArm()).toBe(false)
    tick()
    expect(appState.settings.botArmed).toBe(false)
    expect(appState.settings.botStrategies['momentum-burst']).toBe(false)
  })
})

describe('startAutopilot', () => {
  it('follows focus in both modes and grounds everything when switched off', () => {
    setValue(PATHS.market.focus, 'okx:BTC-USDT')
    tick()

    const stop = startAutopilot()
    expect(liveRuns()).toHaveLength(AUTOPILOT_STRATEGIES.length)
    expect(liveRuns()[0].instrument).toBe('BTC-USDT')

    // Strategies read the tick bus and the socket streams the focused instrument only, so
    // the set has to move with what is on screen or it gets no data.
    setValue(PATHS.market.focus, 'okx:SOL-USDT')
    tick()
    expect(liveRuns().every((run) => run.instrument === 'SOL-USDT')).toBe(true)

    // Going live keeps the set flying — the same strategies, now reaching the real
    // adapter. Only which adapter the order arrives at changes; every gate it passes on
    // the way is the same one.
    setValue(PATHS.trade.mode, 'live')
    tick()
    expect(liveRuns()).toHaveLength(AUTOPILOT_STRATEGIES.length)
    expect(appState.settings.botArmed).toBe(true)

    // Switching the autopilot itself off does ground it: leaving strategies running while
    // the bot cannot act fills the log with signals nobody acted on and makes the desk
    // look busy doing nothing.
    setValue(PATHS.settings.autopilot, false)
    setValue(PATHS.trade.mode, 'paper')
    tick()
    expect(liveRuns()).toEqual([])
    expect(appState.settings.botArmed).toBe(false)

    setValue(PATHS.settings.autopilot, true)
    setValue(PATHS.trade.mode, 'live')
    tick()
    expect(liveRuns()).toHaveLength(AUTOPILOT_STRATEGIES.length)

    stop()
    expect(liveRuns()).toEqual([])
  })
})
