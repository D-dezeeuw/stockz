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
  it('arms only on paper, and grounds the bot the moment the desk goes live', () => {
    // Paper is the default, so a fresh desk flies.
    expect(syncArm()).toBe(true)
    tick()
    expect(appState.settings.botArmed).toBe(true)
    // An armed bot with nothing opted in is armed in name only — the runner gates on both.
    expect(appState.settings.botStrategies['momentum-burst']).toBe(true)

    // "It was trading a minute ago" is the worst possible reason for real money to start
    // moving, so going live disarms rather than carrying on.
    setValue(PATHS.trade.mode, 'live')
    tick()
    expect(syncArm()).toBe(false)
    tick()
    expect(appState.settings.botArmed).toBe(false)
    expect(appState.settings.botStrategies['momentum-burst']).toBe(false)

    setValue(PATHS.trade.mode, 'paper')
    setValue(PATHS.settings.autopilot, false)
    tick()
    expect(syncArm()).toBe(false)
  })
})

describe('startAutopilot', () => {
  it('follows focus while on paper and grounds everything when it cannot act', () => {
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

    // Going live stops it dead rather than leaving strategies firing signals nobody acts on.
    setValue(PATHS.trade.mode, 'live')
    tick()
    expect(liveRuns()).toEqual([])
    expect(appState.settings.botArmed).toBe(false)

    setValue(PATHS.trade.mode, 'paper')
    tick()
    expect(liveRuns()).toHaveLength(AUTOPILOT_STRATEGIES.length)

    stop()
    expect(liveRuns()).toEqual([])
  })
})
