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
  isExitSignal,
  drainTick,
  flushDecisions,
  createBotRunner,
  resetRunner,
  toggleMasterArm,
  setAutoEnabled,
  disableAllAuto,
  refreshBotStatus,
  registerBotActions,
  killBot,
  INTAKE_SIZE,
  DECISION_SIZE,
  DRAIN_MS,
} from './runner.js'
import { resetAlerts, alertLog } from '../alerts/bus.js'
import { appState, setValue, tick, resetState } from '../app/engine.js'
import { ACTIONS } from '../actions/names.js'
import { dispatchAction, clearActions } from '../actions/registry.js'
import { transientSettings } from '../state/settings-schema.js'

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
  clearActions()
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

    // Explicitly live: dry run is the default, and an order that reaches a venue has to
    // have been asked for.
    const result = await dispatchOrder(signal(), {
      dry: false,
      send: async (order) => (sent.push(order), { ok: true, clientId: 'c1', reason: '' }),
    })

    expect(result.ok).toBe(true)
    expect(sent[0]).toMatchObject({
      venue: 'okx',
      // Routed to the venue's own symbol rather than the desk's qualified one.
      instrument: 'BTC-USDT',
      side: 'buy',
      type: 'market',
      size: 0.05,
      // Tagged so the journal and an audit can tell a bot order from a clicked one.
      origin: 'bot',
      strategy: 'momentum-burst',
    })

    // An exit closes the position rather than placing an order of its own - flattening is
    // the position layer's job because only it knows the size. This assertion used to
    // expect `false` and so encoded the bug: nothing carried exits to the position layer,
    // so every `flat` a strategy emitted was decided, logged as taken, and dropped. The bot
    // opened and never closed.
    const flattened = []
    const exit = await dispatchOrder(signal({ action: 'flat' }), {
      flatten: async (key) => (flattened.push(key), { ok: true, reason: '' }),
    })
    expect(exit.ok).toBe(true)
    expect(flattened).toEqual(['okx:BTC-USDT'])

    // "Nothing to close" is the normal case, not a failure: a strategy times out of a
    // position the desk never took, and crying about it would fill the log with noise.
    const nothing = await dispatchOrder(signal({ action: 'flat' }), {
      flatten: async () => ({ ok: false, reason: 'no position' }),
    })
    expect(nothing).toMatchObject({ ok: false, reason: 'no position' })

    expect((await dispatchOrder(signal({ instrument: '' }), { send: async () => ({}) })).ok).toBe(false)

    // Refused at the mapper is refused before the network: a size that rounds to zero is
    // not worth a round trip to find out.
    const refused = await dispatchOrder(signal(), {
      dry: false,
      rules: { size: 0.0001, lotSize: 0.001, mid: 1 },
      send: async () => ({ ok: true }),
    })
    expect(refused).toMatchObject({ ok: false, reason: 'size rounds to zero' })
  })
})

describe('isExitSignal', () => {
  it('treats anything that is not an entry as a way out', () => {
    expect(isExitSignal({ action: 'flat' })).toBe(true)
    expect(isExitSignal({ action: 'close' })).toBe(true)

    expect(isExitSignal({ action: 'buy' })).toBe(false)
    expect(isExitSignal({ action: 'sell' })).toBe(false)

    // `enqueueSignal` already drops 'none', and an empty action is not a call to act.
    expect(isExitSignal({ action: '' })).toBe(false)
    expect(isExitSignal({})).toBe(false)
  })
})

describe('drainTick', () => {
  it('tells the trader when the engine refuses, rather than looking quietly idle', async () => {
    armed()
    enqueueSignal(signal())
    enqueueSignal(signal({ source: 'not-enabled', ts: 1100 }))

    const taken = await drainTick({
      dry: false,
      send: async () => ({ ok: false, reason: 'size above limit' }),
    })

    // Only the enabled strategy got as far as an order.
    expect(taken).toHaveLength(1)
    expect(alertLog().some((a) => a.text.includes('size above limit'))).toBe(true)

    // The queue is drained, so a second call with nothing new does nothing.
    expect(await drainTick({ dry: false, send: async () => ({ ok: true }) })).toEqual([])
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

describe('toggleMasterArm', () => {
  it('is never restored at boot, and every flip is on the record', () => {
    expect(toggleMasterArm(undefined, 1000)).toBe(true)
    tick()
    expect(appState.settings.botArmed).toBe(true)

    // "When did I arm this" is the first question asked about any trade the bot took.
    expect(botDecisions().at(-1)).toMatchObject({ action: 'ARMED', ts: 1000 })
    expect(alertLog().at(-1).text).toMatch(/AUTO-TRADING ARMED/)

    expect(toggleMasterArm(false, 2000)).toBe(false)
    tick()
    expect(botDecisions().at(-1).action).toBe('DISARMED')

    // A bot that came back armed because it was armed yesterday is the most dangerous
    // default this desk could have.
    expect(transientSettings()).toContain('botArmed')
  })
})

describe('setAutoEnabled', () => {
  it('grants one strategy without disturbing the others', () => {
    setAutoEnabled('a', true)
    tick()
    setAutoEnabled('b', true)
    tick()
    setAutoEnabled('a', false)
    tick()

    expect(appState.settings.botStrategies).toEqual({ a: false, b: true })
    expect(setAutoEnabled('', true)).toBeTruthy()
  })
})

describe('disableAllAuto', () => {
  it('writes every key false, because setValue merges and a bare {} changes nothing', () => {
    setValue('settings.botStrategies', { a: true, b: true })
    tick()

    expect(disableAllAuto()).toEqual({ a: false, b: false })
    tick()
    expect(Object.values(appState.settings.botStrategies).some(Boolean)).toBe(false)
  })
})

describe('refreshBotStatus', () => {
  it('publishes what the block needs without the block computing anything', () => {
    armed()
    enqueueSignal(signal())

    const status = refreshBotStatus()
    tick()

    expect(status).toEqual({ armed: true, enabled: 1, queued: 1 })
    expect(appState.bot.status.armed).toBe(true)
  })
})

describe('registerBotActions', () => {
  it('wires the arm switch, the per-strategy grant and the revoke-all', () => {
    expect(registerBotActions()).toBe(ACTIONS.bot.toggleArm)

    dispatchAction(ACTIONS.bot.toggleArm, {})
    tick()
    expect(appState.settings.botArmed).toBe(true)

    dispatchAction(ACTIONS.bot.setAuto, { strategy: 'a', checked: true })
    tick()
    expect(appState.settings.botStrategies.a).toBe(true)

    dispatchAction(ACTIONS.bot.disableAll, {})
    tick()
    expect(appState.settings.botStrategies.a).toBe(false)
  })
})

describe('killBot', () => {
  it('disarms even with no runner attached, because an exception is not a kill switch', () => {
    setValue('settings.botArmed', true)
    tick()

    // No loop started yet: a kill that did nothing here would be a kill switch with an
    // exception, and a kill switch with an exception is not one.
    expect(killBot('breaker tripped', 1000)).toBe(true)
    tick()
    expect(appState.settings.botArmed).toBe(false)
    expect(botDecisions().at(-1)).toMatchObject({ action: 'KILLED', reason: 'breaker tripped' })

    // With a runner, the loop is stopped as well.
    let cleared = 0
    createBotRunner({
      timer: { setInterval: () => 1, clearInterval: () => (cleared += 1) },
    })
    expect(killBot('manual', 2000)).toBe(true)
    expect(cleared).toBe(1)
  })
})
