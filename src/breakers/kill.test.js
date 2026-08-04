import { describe, it, expect, beforeEach } from 'vitest'
import { killSwitch, tripAction, killLatency, rearm, registerKillActions } from './kill.js'
import { resetBreaker, trippedCode, tripBreaker, TRIP } from './core.js'
import { onRealizedFill, pauseState, resetPause } from './position.js'
import { resetAlerts, alertLog } from '../alerts/bus.js'
import { ACTIONS } from '../actions/names.js'
import { clearActions } from '../actions/registry.js'
import { appState, tick, resetState } from '../app/engine.js'

/** Records the order the reaction fired in. */
function reaction() {
  const order = []
  return {
    order,
    cancel: async () => (order.push('cancel'), 3),
    flatten: async () => (order.push('flatten'), 2),
    kill: () => order.push('kill'),
  }
}

beforeEach(() => {
  resetBreaker(0)
  resetPause()
  resetAlerts()
  resetState()
  clearActions()
})

describe('killSwitch', () => {
  it('is idempotent, so hammering it in a panic fires the reaction once', () => {
    const r = reaction()

    expect(killSwitch({ now: 1000, source: 'hotkey', ...r })).toBe(true)
    tick()
    expect(trippedCode()).toBe(TRIP.KILL)
    expect(appState.breaker.values.source).toBe('hotkey')
    expect(alertLog().at(-1).text).toMatch(/TRADING HALTED/)

    // A trader hammering the button must not fire the flatten path six times.
    expect(killSwitch({ now: 1100, ...r })).toBe(false)
    expect(r.order.filter((x) => x === 'flatten')).toHaveLength(1)
  })
})

describe('tripAction', () => {
  it('cancels before it flattens, in the same synchronous turn', () => {
    const r = reaction()

    expect(tripAction(r)).toEqual({ cancelled: true, flattened: true })
    // A resting bid that fills behind the flatten leaves the trader in a fresh position
    // created by the safety mechanism itself.
    expect(r.order).toEqual(['cancel', 'flatten'])
  })

  it('swallows a venue rejection, because the desk is already halted', async () => {
    const thrown = tripAction({
      cancel: async () => {
        throw new Error('venue down')
      },
      flatten: async () => 0,
    })

    expect(thrown.cancelled).toBe(true)
    await Promise.resolve()
  })
})

describe('killLatency', () => {
  it('records how fast the press reached the first cancel', () => {
    expect(killLatency(100, 102.5)).toBe(2.5)
    tick()
    expect(appState.breaker.killLatencyMs).toBe(2.5)

    // Backwards or missing is zero, not a negative latency nobody can read.
    expect(killLatency(100, 90)).toBe(0)
    expect(killLatency(NaN, 100)).toBe(0)
  })
})

describe('rearm', () => {
  it('clears the trip and the pause together, or the desk looks armed and refuses', () => {
    tripBreaker(TRIP.DAILY_LOSS, {}, { kill: () => {} })
    onRealizedFill(-1, { maxConsecLosses: 1 })
    expect(pauseState().paused).toBe(true)

    expect(rearm(2000)).toBe(true)
    tick()
    expect(trippedCode()).toBe(TRIP.NONE)
    // The most confusing state available is armed-and-refusing-everything.
    expect(pauseState().paused).toBe(false)

    expect(rearm(3000)).toBe(false)
  })
})

describe('registerKillActions', () => {
  it('wires the button and the re-arm', () => {
    expect(registerKillActions()).toBe(ACTIONS.breaker.kill)
  })
})
