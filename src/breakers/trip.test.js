import { describe, it, expect, beforeEach } from 'vitest'
import {
  TRIP_ACTIONS,
  actionFor,
  retryOnce,
  markPending,
  clearPending,
  reconcilePending,
  watchPending,
  pendingInstruments,
  executeTripAction,
  watchTrip,
  resetTrip,
} from './trip.js'
import { TRIP } from './core.js'
import { appState, tick, setValue, resetState } from '../app/engine.js'
import { PATHS } from '../state/paths.js'

const POSITIONS = [{ instrument: 'okx:BTC-USDT' }, { instrument: 'okx:ETH-USDT' }]

/** Records the order the wipe fired in. */
function wipe() {
  const order = []
  return {
    order,
    positions: POSITIONS,
    disarm: () => order.push('disarm'),
    cancel: async () => (order.push('cancel'), { cancelled: 1 }),
    flatten: async () => (order.push('flatten'), { closed: 2 }),
  }
}

beforeEach(() => {
  resetTrip()
  resetState()
  // Armed, because the wipe only re-disarms what is still armed — a trip has already done
  // it by the time the orchestrator runs.
  setValue(PATHS.settings.botArmed, true)
  tick()
})

describe('actionFor', () => {
  it('wipes for a halt and never for a losing streak', () => {
    expect(actionFor(TRIP.KILL)).toEqual({ wipe: true, disarm: true })
    expect(actionFor(TRIP.DAILY_LOSS)).toEqual({ wipe: true, disarm: true })

    // A bad run is not an emergency. Flattening over one realises losses the trader never
    // asked to take.
    expect(actionFor(TRIP.LOSS_STREAK)).toEqual({ wipe: false, disarm: true })
    expect(actionFor(TRIP.POSITION)).toEqual({ wipe: false, disarm: false })

    expect(actionFor(99)).toEqual({ wipe: false, disarm: false })
    expect(TRIP_ACTIONS[TRIP.KILL].wipe).toBe(true)
  })
})

describe('retryOnce', () => {
  it('fires the first attempt in the same turn and the second only on failure', async () => {
    const calls = []
    const timers = []
    const timer = (fn) => timers.push(fn)

    // Synchronous first attempt: the cancel/flatten ordering depends on it, and so does
    // the promise that the press reaches the venue in the same turn.
    retryOnce(() => calls.push('ok'), { timer })
    expect(calls).toEqual(['ok'])
    expect(timers).toHaveLength(0)

    const failing = retryOnce(
      () => {
        calls.push('try')
        if (calls.length < 3) throw new Error('venue down')
        return 'recovered'
      },
      { timer },
    )

    await Promise.resolve()
    expect(timers).toHaveLength(1)
    timers[0]()
    await expect(failing).resolves.toBe('recovered')
  })
})

describe('markPending', () => {
  it('lists what the flatten was sent for, so anything left over is visible', () => {
    expect(markPending(POSITIONS)).toEqual(['okx:BTC-USDT', 'okx:ETH-USDT'])
    tick()
    expect(appState.breaker.flattenPending).toEqual(['okx:BTC-USDT', 'okx:ETH-USDT'])

    expect(markPending([{}, { key: 'okx:SOL-USDT' }])).toEqual(['okx:SOL-USDT'])
  })
})

describe('clearPending', () => {
  it('drops an instrument however the caller spells it', () => {
    markPending(POSITIONS)

    // The store keys by venue and the ticket does not, and a pending list that never
    // emptied would read as a flatten that never finished.
    expect(clearPending('BTC-USDT')).toEqual(['okx:ETH-USDT'])
    expect(clearPending('okx:ETH-USDT')).toEqual([])

    expect(clearPending('SOL-USDT')).toEqual([])
  })
})

describe('reconcilePending', () => {
  it('clears the marks off what is actually flat, not off an acknowledgement', () => {
    expect(reconcilePending([])).toEqual([])

    markPending(POSITIONS)
    // An ack says the close was accepted; only the book going flat says it happened.
    expect(reconcilePending(POSITIONS)).toHaveLength(2)
    expect(reconcilePending([{ instrument: 'okx:ETH-USDT' }])).toEqual(['okx:ETH-USDT'])
    expect(reconcilePending(null)).toEqual([])
  })
})

describe('watchPending', () => {
  it('follows the published book so the store never has to know this exists', () => {
    markPending(POSITIONS)
    const watcher = watchPending()

    watcher({ trade: { positions: [{ instrument: 'okx:BTC-USDT' }] } })
    tick()
    expect(appState.breaker.flattenPending).toEqual(['okx:BTC-USDT'])
  })
})

describe('pendingInstruments', () => {
  it('reads back what is still outstanding', () => {
    expect(pendingInstruments()).toEqual([])

    markPending(POSITIONS)
    expect(pendingInstruments()).toHaveLength(2)
  })
})

describe('executeTripAction', () => {
  it('disarms, cancels then flattens — once, whatever fires it twice', async () => {
    const w = wipe()

    expect(executeTripAction(TRIP.KILL, w)).toEqual({
      ran: true,
      disarmed: true,
      cancelled: true,
      flattened: true,
    })
    // Disarm first so the loop stops adding to the pile being cleared; cancel before
    // flatten so a resting bid cannot fill behind the close.
    expect(w.order).toEqual(['disarm', 'cancel', 'flatten'])

    // A hotkey and the watch firing on the same trip must not flatten the book twice.
    expect(executeTripAction(TRIP.KILL, w).ran).toBe(false)
    expect(w.order.filter((step) => step === 'flatten')).toHaveLength(1)

    // A streak disarms the bot and leaves the book alone.
    const streak = wipe()
    expect(executeTripAction(TRIP.LOSS_STREAK, streak).ran).toBe(false)
    expect(streak.order).toEqual(['disarm'])
  })
})

describe('watchTrip', () => {
  it('runs the wipe for a trip that has no other reaction path', () => {
    const w = wipe()
    const watcher = watchTrip(w)

    watcher({ breaker: { tripped: TRIP.NONE } })
    expect(w.order).toEqual([])

    // The daily-loss trip publishes a code and returns a rejection; without this the desk
    // would halt with its orders still resting.
    watcher({ breaker: { tripped: TRIP.DAILY_LOSS } })
    expect(w.order).toEqual(['disarm', 'cancel', 'flatten'])
  })
})

describe('resetTrip', () => {
  it('clears the guard, or the next kill dispatches nothing at all', () => {
    const first = wipe()
    executeTripAction(TRIP.KILL, first)

    setValue(PATHS.breaker.flattenPending, ['stale'])
    expect(resetTrip()).toBe(true)
    tick()
    expect(appState.breaker.flattenPending).toEqual([])

    const second = wipe()
    expect(executeTripAction(TRIP.KILL, second).ran).toBe(true)
  })
})
