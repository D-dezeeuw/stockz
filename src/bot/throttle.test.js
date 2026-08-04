import { describe, it, expect, beforeEach } from 'vitest'
import {
  createThrottle,
  currentThrottle,
  throttleGate,
  onFillClosed,
  startCooldown,
  cooldownGate,
  clearCooldown,
  refreshLimits,
  resetThrottle,
  DEFAULT_RATE,
  DEFAULT_STREAK,
  DEFAULT_COOLDOWN_MIN,
} from './throttle.js'
import { botDecisions, resetRunner } from './runner.js'
import { appState, setValue, tick, resetState } from '../app/engine.js'

beforeEach(() => {
  resetThrottle()
  resetRunner()
  resetState()
})

describe('createThrottle', () => {
  it('prunes inside the check, so no timer has to keep a tab awake', () => {
    const limiter = createThrottle(3)

    expect(limiter.allow(1000)).toBe(true)
    expect(limiter.allow(1100)).toBe(true)
    expect(limiter.allow(1200)).toBe(true)
    expect(limiter.allow(1300)).toBe(false)

    // A minute later the window has slid past all three, with no sweep in between.
    expect(limiter.allow(62000)).toBe(true)
    expect(limiter.used(62000)).toBe(1)

    limiter.reset()
    expect(limiter.used(62000)).toBe(0)
    expect(limiter.allow(NaN)).toBe(false)
    expect(DEFAULT_RATE).toBe(30)
  })
})

describe('currentThrottle', () => {
  it('rebuilds when the limit changes, because the window size is the limit', () => {
    const first = currentThrottle({ botMaxPerMin: 2 })
    expect(first.allow(1000)).toBe(true)
    expect(first.allow(1100)).toBe(true)
    expect(first.allow(1200)).toBe(false)

    // A limiter built for 2 cannot answer a question about 10.
    const wider = currentThrottle({ botMaxPerMin: 10 })
    expect(wider).not.toBe(first)
    expect(wider.allow(1200)).toBe(true)

    expect(currentThrottle({ botMaxPerMin: 10 })).toBe(wider)
  })
})

describe('throttleGate', () => {
  it('reports the limit it refused at, not just that it refused', () => {
    setValue('settings.botMaxPerMin', 2)
    tick()

    expect(throttleGate({}, { now: 1000 }).pass).toBe(true)
    expect(throttleGate({}, { now: 1100 }).pass).toBe(true)

    const blocked = throttleGate({}, { now: 1200 })
    expect(blocked.pass).toBe(false)
    expect(blocked.reason).toMatch(/throttled at 2\/min/)
  })
})

describe('onFillClosed', () => {
  it('counts consecutive losses, which is evidence a win resets outright', () => {
    const settings = { botCooldownAfter: 3, botCooldownMinutes: 10 }

    expect(onFillClosed(-5, 1000, settings).streak).toBe(1)
    expect(onFillClosed(-5, 2000, settings).streak).toBe(2)

    // Three losers among ten is evidence about nothing; three in a row is evidence about
    // the strategy.
    expect(onFillClosed(3, 3000, settings).streak).toBe(0)

    expect(onFillClosed(-1, 4000, settings).streak).toBe(1)
    expect(onFillClosed(-1, 5000, settings).streak).toBe(2)
    expect(onFillClosed(-1, 6000, settings)).toMatchObject({ streak: 3, benched: true })

    // A scratch is neither.
    expect(onFillClosed(0, 7000, settings).streak).toBe(3)
    expect(DEFAULT_STREAK).toBe(3)
    expect(DEFAULT_COOLDOWN_MIN).toBe(10)
  })
})

describe('startCooldown', () => {
  it('puts the bench on the record with the streak that caused it', () => {
    expect(startCooldown(60000, 1000)).toBe(60000)
    tick()

    expect(appState.bot.cooldownUntil).toBe(60000)
    expect(botDecisions().at(-1)).toMatchObject({ action: 'COOLDOWN', ts: 1000 })
  })
})

describe('cooldownGate', () => {
  it('says how long is left, so the trader is not guessing', () => {
    expect(cooldownGate({}, { now: 1000 }).pass).toBe(true)

    startCooldown(61000, 1000)
    expect(cooldownGate({}, { now: 1000 })).toMatchObject({ pass: false })
    expect(cooldownGate({}, { now: 1000 }).reason).toMatch(/cooling down 60s/)

    expect(cooldownGate({}, { now: 61000 }).pass).toBe(true)
  })
})

describe('clearCooldown', () => {
  it('ends the bench without a dialog, and says who ended it', () => {
    startCooldown(61000, 1000)

    expect(clearCooldown(2000)).toBe(true)
    tick()
    expect(appState.bot.cooldownUntil).toBe(0)
    expect(botDecisions().at(-1)).toMatchObject({ action: 'RESUME' })

    expect(clearCooldown(3000)).toBe(false)
  })
})

describe('refreshLimits', () => {
  it('goes hot before the ceiling, which is the point of a meter', () => {
    setValue('settings.botMaxPerMin', 5)
    tick()
    const limiter = currentThrottle()
    for (let i = 0; i < 4; i += 1) limiter.allow(1000 + i)

    const limits = refreshLimits(1100)
    tick()

    expect(limits).toMatchObject({ used: 4, limit: 5, hot: true })
    expect(appState.bot.limits.used).toBe(4)

    startCooldown(1100 + 125000, 1100)
    expect(refreshLimits(1100).cooldownLabel).toBe('2:05')
  })
})

describe('resetThrottle', () => {
  it('gives a re-armed bot a clean window and a clean streak', () => {
    const limiter = currentThrottle({ botMaxPerMin: 1 })
    limiter.allow(1000)
    onFillClosed(-5, 1000, { botCooldownAfter: 3 })

    expect(resetThrottle()).toBe(true)
    expect(refreshLimits(1000)).toMatchObject({ used: 0, streak: 0, cooldownLeft: 0 })
  })
})
