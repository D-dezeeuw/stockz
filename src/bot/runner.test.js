import { describe, it, expect, beforeEach } from 'vitest'
import {
  enqueueSignal,
  pushDecision,
  botDecisions,
  armGate,
  optInGate,
  runGates,
  decide,
  dispatchOrder,
  drainTick,
  flushDecisions,
  createBotRunner,
  resetRunner,
  INTAKE_SIZE,
  DECISION_SIZE,
  DRAIN_MS,
} from './runner.js'
import { resetAlerts, alertLog } from '../alerts/bus.js'
import { appState, setValue, tick, resetState } from '../app/engine.js'

/** A signal as the strategy engine publishes them. */
function signal(overrides = {}) {
  return {
    action: 'buy',
    strength: 0.8,
    reason: 'burst',
    source: 'momentum-burst',
    instrument: 'okx:BTC-USDT',
    ts: 1000,
    ...overrides,
  }
}

/** Arm the bot and enable one strategy. */
function armed(strategyId = 'momentum-burst') {
  setValue('settings.botArmed', true)
  setValue('settings.botStrategies', { [strategyId]: true })
  setValue('settings.botSize', 0.05)
  tick()
}

beforeEach(() => {
  resetRunner()
  resetAlerts()
  resetState()
})

describe('enqueueSignal', () => {
  it('refuses a non-event, which would push the real calls out of the queue', () => {
    expect(enqueueSignal(signal())).toBe(true)

    // 'none' is a strategy having no opinion.
    expect(enqueueSignal(signal({ action: 'none' }))).toBe(false)
    expect(enqueueSignal({})).toBe(false)
    expect(INTAKE_SIZE).toBe(256)
  })
})

describe('pushDecision', () => {
  it('always carries a reason, because "did not trade" alone is unfileable', () => {
    expect(pushDecision({ ts: 1, strategy: 'a', instrument: 'x', action: 'buy', reason: 'disarmed' })).toEqual({
      ts: 1,
      strategy: 'a',
      instrument: 'x',
      action: 'buy',
      taken: false,
      reason: 'disarmed',
    })

    expect(pushDecision({ taken: true }).taken).toBe(true)
    expect(DECISION_SIZE).toBe(200)
  })
})

describe('botDecisions', () => {
  it('is bounded, so a bot deciding fifty times a second cannot eat the session', () => {
    for (let i = 0; i < DECISION_SIZE + 10; i += 1) pushDecision({ ts: i, reason: 'x' })

    expect(botDecisions()).toHaveLength(DECISION_SIZE)
    expect(botDecisions().at(-1).ts).toBe(DECISION_SIZE + 9)
    expect(botDecisions(3)).toHaveLength(3)
  })
})

describe('armGate', () => {
  it('is off by default and off after a reload, the only safe default here', () => {
    // A bot that came back armed because it was armed yesterday is the most dangerous
    // default available.
    expect(armGate({})).toEqual({ pass: false, reason: 'disarmed' })
    expect(armGate({ botArmed: true }).pass).toBe(true)
    expect(armGate({ botArmed: 'true' }).pass).toBe(false)
  })
})

describe('optInGate', () => {
  it('is opt-in, unlike the alert toggles, because money is not a notification', () => {
    expect(optInGate('a', { botStrategies: { a: true } }).pass).toBe(true)

    // Being told about a signal and having money placed on it differ enough that the
    // defaults must differ too.
    expect(optInGate('a', {})).toMatchObject({ pass: false })
    expect(optInGate('a', {}).reason).toMatch(/not enabled/)
    expect(optInGate('b', { botStrategies: { a: true } }).pass).toBe(false)
  })
})

describe('runGates', () => {
  it('stops at the first failure and reports that reason, not the last one', () => {
    const calls = []
    const pass = (name) => () => (calls.push(name), { pass: true, reason: '' })
    const fail = (name) => () => (calls.push(name), { pass: false, reason: name })

    expect(runGates(signal(), { gates: [pass('a'), fail('b'), pass('c')] })).toEqual({
      pass: false,
      reason: 'b',
    })
    // Running the rest would cost work for an already-rejected signal.
    expect(calls).toEqual(['a', 'b'])

    expect(runGates(signal(), { gates: [pass('a')] }).pass).toBe(true)
    expect(runGates(signal(), {}).pass).toBe(true)
    expect(runGates(signal(), { gates: [null] }).pass).toBe(true)
  })
})

describe('decide', () => {
  it('records why it did not trade, so the trader never needs a debugger to ask', () => {
    const blocked = decide(signal())
    expect(blocked).toMatchObject({ taken: false, reason: 'disarmed', strategy: 'momentum-burst' })

    armed()
    expect(decide(signal())).toMatchObject({ taken: true, reason: 'passed' })

    // An extra gate composes on top of the built-in two.
    const capped = decide(signal(), { gates: [() => ({ pass: false, reason: 'at cap' })] })
    expect(capped.reason).toBe('at cap')
    expect(botDecisions()).toHaveLength(3)
  })
})

describe('dispatchOrder', () => {
  it('goes through submit, so a bot order passes every guard a typed one does', async () => {
    armed()
    const sent = []

    const result = await dispatchOrder(signal(), {
      send: async (order) => (sent.push(order), { ok: true, clientId: 'c1', reason: '' }),
    })

    expect(result.ok).toBe(true)
    expect(sent[0]).toMatchObject({
      venue: 'okx',
      instrument: 'okx:BTC-USDT',
      side: 'buy',
      type: 'market',
      size: 0.05,
      // Tagged so the journal and an audit can tell a bot order from a clicked one.
      origin: 'bot',
    })

    // An exit signal is not an entry to place; flattening is the position layer's job.
    expect((await dispatchOrder(signal({ action: 'flat' }), { send: async () => ({}) })).ok).toBe(false)
    expect((await dispatchOrder(signal({ instrument: '' }), { send: async () => ({}) })).ok).toBe(false)
  })
})

describe('drainTick', () => {
  it('tells the trader when the engine refuses, rather than looking quietly idle', async () => {
    armed()
    enqueueSignal(signal())
    enqueueSignal(signal({ source: 'not-enabled', ts: 1100 }))

    const taken = await drainTick({ send: async () => ({ ok: false, reason: 'size above limit' }) })

    // Only the enabled strategy got as far as an order.
    expect(taken).toHaveLength(1)
    expect(alertLog().some((a) => a.text.includes('size above limit'))).toBe(true)

    // The queue is drained, so a second call with nothing new does nothing.
    expect(await drainTick({ send: async () => ({ ok: true }) })).toEqual([])
  })
})

describe('flushDecisions', () => {
  it('publishes newest first, which is the order the question gets asked in', () => {
    pushDecision({ ts: 1, reason: 'disarmed' })
    pushDecision({ ts: 2, reason: 'passed', taken: true })

    const rows = flushDecisions()
    tick()

    expect(rows[0].ts).toBe(2)
    expect(appState.bot.decisions).toHaveLength(2)
  })
})

describe('createBotRunner', () => {
  it('drains on a clock rather than on the signal, bounding a burst to one frame', () => {
    const timers = []
    let cleared = 0
    let subscriber = null

    const stop = createBotRunner({
      timer: {
        setInterval: (fn, ms) => (timers.push([fn, ms]), timers.length),
        clearInterval: () => (cleared += 1),
      },
      subscribe: (fn) => {
        subscriber = fn
        return () => {
          subscriber = null
        }
      },
    })

    expect(timers[0][1]).toBe(DRAIN_MS)
    // The subscription feeds the queue rather than acting directly.
    expect(subscriber(signal())).toBe(true)

    stop()
    expect(cleared).toBe(1)
    expect(subscriber).toBeNull()
  })
})

describe('resetRunner', () => {
  it('drops the queue and the decision history together', () => {
    enqueueSignal(signal())
    pushDecision({ ts: 1, reason: 'x' })

    expect(resetRunner()).toBe(true)
    expect(botDecisions()).toEqual([])
  })
})
