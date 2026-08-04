import { describe, it, expect, beforeEach } from 'vitest'
import {
  PIN_CAP,
  LIVE_LABEL,
  checkpointLabel,
  pinTrade,
  addPin,
  checkpoints,
  jumpToCheckpoint,
  pinLive,
  returnToLive,
  registerCheckpointActions,
  resetCheckpoints,
} from './checkpoints.js'
import { ACTIONS } from '../actions/names.js'
import { clearActions, dispatchAction } from '../actions/registry.js'
import { appState, tick, resetState } from '../app/engine.js'

const TRADE = { id: 't1', instrument: 'BTC-USDT', side: 'long', net: 12.5, closeTs: 4000 }

/** A snapshot stand-in that records what it was asked to pin. */
function recorder() {
  const taken = []
  const jumped = []
  return {
    taken,
    jumped,
    snapshot: (label) => (taken.push(label), `h:${label}`),
    jump: (handle) => jumped.push(handle),
  }
}

beforeEach(() => {
  resetCheckpoints()
  resetState()
  clearActions()
})

describe('checkpointLabel', () => {
  it('names a pin by the trade, because a frame number is not an answer anybody uses', () => {
    expect(checkpointLabel(TRADE)).toBe('BTC-USDT long +12.50')
    expect(checkpointLabel({ ...TRADE, net: -3 })).toBe('BTC-USDT long -3.00')

    // A trade with only a gross number still gets named by it.
    expect(checkpointLabel({ instrument: 'ETH', pnl: 1 })).toBe('ETH +1.00')
    expect(checkpointLabel(null)).toBe('trade +0.00')
  })
})

describe('pinTrade', () => {
  it('defers off the fill path and never pins the same trade twice', () => {
    const deferred = []
    const rec = recorder()
    const deps = { defer: (fn) => deferred.push(fn), snapshot: rec.snapshot }

    expect(pinTrade(TRADE, deps)).toBe(true)
    // A journal feature that added latency to execution would trade the thing the desk is
    // for against the thing that merely records it.
    expect(rec.taken).toEqual([])
    deferred.pop()()
    expect(rec.taken).toEqual(['BTC-USDT long +12.50'])

    // A re-published row must not multiply the history.
    expect(pinTrade(TRADE, deps)).toBe(false)
    expect(pinTrade({}, deps)).toBe(false)
  })
})

describe('addPin', () => {
  it('loses a pin rather than a trade when the snapshot fails', () => {
    const rec = recorder()

    expect(addPin({ tradeId: 't1', label: 'x', ts: 5 }, rec).handle).toBe('h:x')
    tick()
    expect(appState.journal.checkpoints[0]).toMatchObject({ tradeId: 't1', label: 'x' })

    const broken = addPin(
      { tradeId: 't2', label: 'y' },
      {
        snapshot: () => {
          throw new Error('no history')
        },
      },
    )
    // The journal row is the record; this is only the ability to stand in it again.
    expect(broken.handle).toBeNull()
    expect(checkpoints()).toHaveLength(2)
  })
})

describe('checkpoints', () => {
  it('keeps a bounded, ordered list', () => {
    const rec = recorder()
    expect(checkpoints()).toEqual([])

    for (let i = 0; i < PIN_CAP + 5; i += 1) addPin({ tradeId: `t${i}`, label: `l${i}` }, rec)
    expect(checkpoints()).toHaveLength(PIN_CAP)
    expect(checkpoints()[0].tradeId).toBe('t5')
  })
})

describe('jumpToCheckpoint', () => {
  it('pins the present before it leaves it', () => {
    const rec = recorder()
    addPin({ tradeId: 't1', label: 'BTC long' }, rec)

    expect(jumpToCheckpoint('t1', rec)).toBe(true)
    tick()
    // Browsing history must never strand a trader in the past with live orders working.
    expect(rec.taken).toEqual(['BTC long', LIVE_LABEL])
    expect(rec.jumped).toEqual(['h:BTC long'])
    expect(appState.journal.replaying).toBe('t1')

    expect(jumpToCheckpoint('nope', rec)).toBe(false)
  })
})

describe('pinLive', () => {
  it('marks the present, and survives an engine that cannot', () => {
    const rec = recorder()

    expect(pinLive(rec)).toBe(`h:${LIVE_LABEL}`)
    expect(
      pinLive({
        snapshot: () => {
          throw new Error('no history')
        },
      }),
    ).toBeNull()
  })
})

describe('returnToLive', () => {
  it('always clears the flag, even with nothing to return to', () => {
    const rec = recorder()

    // A desk stuck displaying "viewing history" with no way out is worse than one that
    // simply carries on.
    expect(returnToLive(rec)).toBe(false)

    pinLive(rec)
    expect(returnToLive(rec)).toBe(true)
    tick()
    expect(rec.jumped).toEqual([`h:${LIVE_LABEL}`])
    expect(appState.journal.replaying).toBe('')
  })
})

describe('registerCheckpointActions', () => {
  it('binds the jump and the way back', () => {
    expect(registerCheckpointActions()).toEqual([ACTIONS.journal.jump, ACTIONS.journal.live])

    expect(dispatchAction(ACTIONS.journal.jump, { id: 'missing' })).toBe(false)
    expect(dispatchAction(ACTIONS.journal.live)).toBe(false)
  })
})

describe('resetCheckpoints', () => {
  it('forgets the pins and the way back together', () => {
    const rec = recorder()
    addPin({ tradeId: 't1', label: 'x' }, rec)

    expect(resetCheckpoints()).toBe(true)
    tick()
    expect(checkpoints()).toEqual([])
    expect(appState.journal.checkpoints).toEqual([])
  })
})
