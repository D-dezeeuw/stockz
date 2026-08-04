import { describe, it, expect, beforeEach } from 'vitest'
import {
  emptySession,
  isDryRun,
  logDryOrder,
  dryRunOrders,
  dispatchOrDry,
  countSignal,
  botSession,
  refreshSession,
  resetSession,
  toggleDryRun,
  hardStop,
  sessionReport,
  registerSessionActions,
} from './session.js'
import { botDecisions, resetRunner } from './runner.js'
import { ACTIONS } from '../actions/names.js'
import { dispatchAction, clearActions } from '../actions/registry.js'
import { appState, setValue, tick, resetState } from '../app/engine.js'

const ORDER = { venue: 'okx', instrument: 'BTC-USDT', side: 'buy', type: 'market', size: 0.05 }

beforeEach(() => {
  resetRunner()
  resetState()
  clearActions()
  resetSession(0)
})

describe('emptySession', () => {
  it('starts every counter at zero and stamps when it began', () => {
    expect(emptySession(1000)).toEqual({ signals: 0, orders: 0, dry: 0, blocked: 0, startedAt: 1000 })
  })
})

describe('isDryRun', () => {
  it('defaults to true, unlike every other boolean here', () => {
    // An undefined flag must mean "do not spend money", never "go ahead".
    expect(isDryRun({})).toBe(true)
    expect(isDryRun(undefined)).toBe(true)

    expect(isDryRun({ botDryRun: false })).toBe(false)
    expect(isDryRun({ botDryRun: true })).toBe(true)
  })
})

describe('logDryOrder', () => {
  it('records the full order, so the rehearsal is reviewable', () => {
    const entry = logDryOrder(ORDER, 1000)

    expect(entry).toMatchObject({ ...ORDER, ts: 1000, dry: true })
    expect(botSession().dry).toBe(1)
  })
})

describe('dryRunOrders', () => {
  it('is bounded, so a long rehearsal cannot eat the session', () => {
    for (let i = 0; i < 210; i += 1) logDryOrder({ ...ORDER, size: i }, i)

    expect(dryRunOrders()).toHaveLength(200)
    expect(dryRunOrders().at(-1).size).toBe(209)
  })
})

describe('dispatchOrDry', () => {
  it('returns the same shape either way, so nothing downstream knows which ran', async () => {
    const dry = await dispatchOrDry(ORDER, { dry: true, now: 1000 })
    expect(dry).toMatchObject({ ok: true, reason: 'dry run' })
    expect(dry.clientId).toBeTruthy()
    expect(botSession().dry).toBe(1)

    const sent = []
    const live = await dispatchOrDry(ORDER, {
      dry: false,
      send: async (order) => (sent.push(order), { ok: true, clientId: 'c1', reason: '' }),
    })
    expect(live.clientId).toBe('c1')
    expect(sent).toHaveLength(1)
    expect(botSession().orders).toBe(1)

    // A live dispatch with nowhere to send is a refusal, not a silent success.
    expect((await dispatchOrDry(ORDER, { dry: false })).ok).toBe(false)
  })
})

describe('countSignal', () => {
  it('counts the blocked ones, which is where the interesting number is', () => {
    countSignal(true)
    countSignal(false)
    countSignal(false)

    expect(botSession()).toMatchObject({ signals: 3, blocked: 2 })
  })
})

describe('botSession', () => {
  it('reads the live counters back', () => {
    countSignal(true)
    expect(botSession().signals).toBe(1)
  })
})

describe('refreshSession', () => {
  it('publishes the conversion, which is where the conversation starts', () => {
    countSignal(true)
    countSignal(false)
    logDryOrder(ORDER, 1000)

    const published = refreshSession()
    tick()

    // A bot seeing four hundred signals and placing two is either well-gated or broken.
    expect(published.conversion).toBe(0.5)
    expect(appState.bot.session.signals).toBe(2)
  })
})

describe('resetSession', () => {
  it('drops the counters and the rehearsal together', () => {
    countSignal(true)
    logDryOrder(ORDER, 1000)

    expect(resetSession(5000)).toMatchObject({ signals: 0, dry: 0, startedAt: 5000 })
    expect(dryRunOrders()).toEqual([])
  })
})

describe('toggleDryRun', () => {
  it('logs going live as its own moment, because it is one', () => {
    expect(toggleDryRun(false, 1000)).toBe(false)
    tick()

    expect(appState.settings.botDryRun).toBe(false)
    // Software that places orders should have to be switched into doing so, and the switch
    // should be a moment the trader remembers.
    expect(botDecisions().at(-1)).toMatchObject({ action: 'LIVE MODE', taken: true })

    expect(toggleDryRun(undefined, 2000)).toBe(true)
    expect(botDecisions().at(-1).action).toBe('DRY RUN')
  })
})

describe('hardStop', () => {
  it('stops the loop before disarming, so no drain can start between the two', () => {
    setValue('settings.botArmed', true)
    tick()

    const order = []
    expect(hardStop({ stop: () => order.push('stopped'), now: 1000, reason: 'breaker tripped' })).toBe(true)
    tick()

    expect(order).toEqual(['stopped'])
    expect(appState.settings.botArmed).toBe(false)
    expect(botDecisions().at(-1)).toMatchObject({ action: 'KILLED', reason: 'breaker tripped' })

    // A stop with nothing to stop still disarms.
    expect(hardStop({ now: 2000 })).toBe(true)
  })
})

describe('sessionReport', () => {
  it('carries the reasons with the counters, or the funnel is unactionable', () => {
    countSignal(false)
    logDryOrder(ORDER, 1000)

    const report = sessionReport()
    expect(report.session.signals).toBe(1)
    expect(report.dryOrders).toHaveLength(1)
    expect(Array.isArray(report.decisions)).toBe(true)
  })
})

describe('registerSessionActions', () => {
  it('wires the dry-run switch and the session reset', () => {
    expect(registerSessionActions()).toBe(ACTIONS.bot.toggleDry)

    dispatchAction(ACTIONS.bot.toggleDry, { value: false })
    tick()
    expect(appState.settings.botDryRun).toBe(false)

    countSignal(true)
    dispatchAction(ACTIONS.bot.resetSession, {})
    tick()
    expect(appState.bot.session.signals).toBe(0)
  })
})
