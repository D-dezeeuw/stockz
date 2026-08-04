import { describe, it, expect, beforeEach } from 'vitest'
import {
  safeInvoke,
  errorTally,
  logStrategyError,
  strategyErrors,
  quarantine,
  isQuarantined,
  release,
  publishQuarantined,
  resetSandbox,
  recordResult,
  QUARANTINE_AFTER,
  ERROR_LOG_SIZE,
} from './sandbox.js'
import { crashyStrategy } from './builtin/crashy.js'
import {
  registerStrategy,
  startStrategy,
  liveRuns,
  resetStrategies,
  resumeStrategy,
  runQuarantined,
} from './registry.js'
import { defineStrategy } from './contract.js'
import { appState, tick, resetState } from '../app/engine.js'

function fakeBus() {
  const listeners = new Set()
  return {
    subscribe: (fn) => (listeners.add(fn), () => listeners.delete(fn)),
    emit: (t) => [...listeners].forEach((fn) => fn(t)),
    get size() {
      return listeners.size
    },
  }
}

beforeEach(() => {
  resetSandbox()
  resetStrategies()
  resetState()
})

describe('safeInvoke', () => {
  it('turns an exception into data instead of a crash', () => {
    expect(safeInvoke((a) => a * 2, 'a@x', 3)).toEqual({
      ok: true,
      value: 6,
      error: '',
      runKey: 'a@x',
    })

    const failed = safeInvoke(() => {
      throw new Error('boom')
    }, 'a@x')
    // The message, not the Error: what lands in state must survive serialize() and a
    // journal export, and an Error object survives neither.
    expect(failed).toEqual({ ok: false, value: undefined, error: 'boom', runKey: 'a@x' })
    expect(typeof failed.error).toBe('string')

    expect(safeInvoke(null, 'a@x').error).toBe('not callable')
  })
})

describe('errorTally', () => {
  it('counts consecutive failures, so an hourly throw is not treated as a constant one', () => {
    expect(errorTally(0, { ok: false })).toBe(1)
    expect(errorTally(1, { ok: false })).toBe(2)

    // Any success clears it; a cumulative counter would eventually bench a strategy that
    // throws once an hour.
    expect(errorTally(2, { ok: true })).toBe(0)
    expect(errorTally(undefined, { ok: false })).toBe(1)
    expect(QUARANTINE_AFTER).toBe(3)
  })
})

describe('logStrategyError', () => {
  it('keeps recent failures inspectable after the fact', () => {
    expect(logStrategyError({ ok: false, runKey: 'a@x', error: 'boom' }, 1000)).toEqual({
      runKey: 'a@x',
      error: 'boom',
      ts: 1000,
    })

    expect(logStrategyError({ ok: true })).toBeNull()
    expect(ERROR_LOG_SIZE).toBe(64)
  })
})

describe('strategyErrors', () => {
  it('is bounded, so a strategy throwing every tick cannot eat the session', () => {
    for (let i = 0; i < ERROR_LOG_SIZE + 10; i += 1) {
      logStrategyError({ ok: false, runKey: 'a@x', error: `e${i}` }, i)
    }

    const errors = strategyErrors()
    expect(errors).toHaveLength(ERROR_LOG_SIZE)
    expect(errors.at(-1).error).toBe(`e${ERROR_LOG_SIZE + 9}`)
  })
})

describe('quarantine', () => {
  it('stops the run rather than merely flagging it', () => {
    const stopped = []
    const record = quarantine(
      { key: 'a@x', strategyId: 'a', instrument: 'okx:BTC-USDT', ticks: 12 },
      'boom',
      (key) => stopped.push(key),
    )

    // A benched run whose subscription survived would keep throwing every tick behind a
    // UI that says it is off.
    expect(stopped).toEqual(['a@x'])
    expect(record).toMatchObject({ key: 'a@x', error: 'boom', at: 12 })
    expect(quarantine(null, 'boom')).toBeNull()
  })
})

describe('isQuarantined', () => {
  it('answers for one run without leaking the whole map', () => {
    quarantine({ key: 'a@x', strategyId: 'a' }, 'boom')

    expect(isQuarantined('a@x')).toBe(true)
    expect(isQuarantined('b@x')).toBe(false)
    expect(isQuarantined()).toBe(false)
  })
})

describe('release', () => {
  it('lets a fixed strategy back in, and says what it was benched for', () => {
    quarantine({ key: 'a@x', strategyId: 'a' }, 'boom')

    expect(release('a@x')).toMatchObject({ error: 'boom' })
    expect(isQuarantined('a@x')).toBe(false)
    expect(release('a@x')).toBeNull()
  })
})

describe('publishQuarantined', () => {
  it('shows who is benched and why, because a silent bench looks like silence', () => {
    quarantine({ key: 'a@x', strategyId: 'a', instrument: 'okx:BTC-USDT' }, 'boom')
    tick()

    expect(appState.strategy.quarantined).toHaveLength(1)
    expect(appState.strategy.quarantined[0]).toMatchObject({ key: 'a@x', error: 'boom' })

    release('a@x')
    tick()
    expect(appState.strategy.quarantined).toEqual([])
    expect(publishQuarantined()).toEqual([])
  })
})

describe('resetSandbox', () => {
  it('forgets every bench and every logged failure', () => {
    quarantine({ key: 'a@x', strategyId: 'a' }, 'boom')
    logStrategyError({ ok: false, runKey: 'a@x', error: 'boom' }, 1)

    expect(resetSandbox()).toBe(true)
    expect(isQuarantined('a@x')).toBe(false)
    expect(strategyErrors()).toEqual([])
  })
})

describe('recordResult', () => {
  it('benches on the third consecutive throw, not the first', () => {
    const run = { key: 'a@x', strategyId: 'a', instrument: 'okx:BTC-USDT' }
    const fail = { ok: false, error: 'boom', runKey: 'a@x' }

    expect(recordResult(run, fail)).toEqual({ errors: 1, quarantined: false })
    expect(recordResult(run, fail)).toEqual({ errors: 2, quarantined: false })

    // A single throw on a malformed frame is a bug worth surviving.
    expect(recordResult(run, fail, { now: 9 })).toEqual({ errors: 3, quarantined: true })
    expect(isQuarantined('a@x')).toBe(true)

    expect(recordResult({ errors: 2 }, { ok: true })).toEqual({ errors: 0, quarantined: false })
  })
})

describe('crashyStrategy', () => {
  it('proves the isolation against a genuinely hostile plugin, sibling included', () => {
    registerStrategy(crashyStrategy)
    registerStrategy(
      defineStrategy({
        id: 'calm',
        onTick: () => ({ action: 'buy', strength: 1, reason: 'fine' }),
        onCandle: () => null,
      }),
    )
    const bus = fakeBus()
    const crashy = startStrategy('crashy', 'okx:BTC-USDT', { subscribe: bus.subscribe })
    const calm = startStrategy('calm', 'okx:BTC-USDT', { subscribe: bus.subscribe })

    // Three scheduled failures in a row: every tick here is a multiple of 5.
    for (const ts of [5, 10, 15]) bus.emit({ symbol: 'okx:BTC-USDT', px: 1, ts })
    tick()

    expect(runQuarantined(crashy.key)).toBe(true)
    expect(liveRuns().map((r) => r.key)).toEqual([calm.key])
    // The sibling never noticed.
    expect(calm.signal).toMatchObject({ action: 'buy' })
    expect(strategyErrors().at(-1).error).toMatch(/scheduled failure/)

    // One click puts it back to work.
    const resumed = resumeStrategy(crashy.key)
    expect(resumed.key).toBe(crashy.key)
    expect(runQuarantined(crashy.key)).toBe(false)
    expect(resumeStrategy('nope@x')).toBeNull()
  })
})
