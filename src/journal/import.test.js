import { describe, it, expect, beforeEach } from 'vitest'
import {
  SPEEDS,
  validateSession,
  loadSession,
  replayState,
  stepReplay,
  seekReplay,
  publishStep,
  setSpeed,
  liveOnly,
  exitReplay,
  importFile,
  registerImportActions,
  resetReplay,
} from './import.js'
import { EXPORT_SCHEMA } from './export.js'
import { resetCheckpoints } from './checkpoints.js'
import { ACTIONS } from '../actions/names.js'
import { clearActions } from '../actions/registry.js'
import { appState, tick, resetState } from '../app/engine.js'

const FILE = {
  app: 'stockz',
  schemaVersion: EXPORT_SCHEMA,
  exportedAt: '2026-08-04T00:00:00.000Z',
  trades: [
    { id: 't1', instrument: 'BTC-USDT', net: 5 },
    { id: 't2', instrument: 'ETH-USDT', net: -2 },
    { id: 't3', instrument: 'BTC-USDT', net: 1 },
  ],
}

beforeEach(() => {
  resetReplay()
  resetCheckpoints()
  resetState()
  clearActions()
})

describe('validateSession', () => {
  it('refuses a newer schema by name rather than half-reading it', () => {
    expect(validateSession(FILE).ok).toBe(true)
    expect(validateSession(JSON.stringify(FILE)).ok).toBe(true)

    // A session read by a build that does not understand half its keys would replay a day
    // that never happened.
    const future = validateSession({ ...FILE, schemaVersion: EXPORT_SCHEMA + 1 })
    expect(future.ok).toBe(false)
    expect(future.reason).toMatch(/newer than this build/)

    expect(validateSession('{not json').reason).toBe('not JSON')
    expect(validateSession({ app: 'other' }).reason).toBe('not a STOCKZ export')
    expect(validateSession({ ...FILE, trades: null }).reason).toBe('no trades in file')
    expect(validateSession(null).ok).toBe(false)
  })
})

describe('loadSession', () => {
  it('raises the gate and pins the way back before the payload lands', () => {
    const taken = []

    expect(loadSession(FILE, { snapshot: (label) => (taken.push(label), label) }).ok).toBe(true)
    tick()

    // A trader who imported a file and could not get back to their live desk has lost it.
    expect(taken).toEqual(['live-head'])
    expect(appState.replay.active).toBe(true)
    expect(appState.replay.total).toBe(3)

    const bad = loadSession({ app: 'other' })
    tick()
    expect(bad.ok).toBe(false)
    expect(appState.replay.error).toBe('not a STOCKZ export')
  })
})

describe('replayState', () => {
  it('says where the transport is standing', () => {
    expect(replayState()).toEqual({ cursor: 0, total: 0, trade: null })

    loadSession(FILE)
    expect(replayState()).toMatchObject({ cursor: 0, total: 3 })
    expect(replayState().trade.id).toBe('t1')
  })
})

describe('stepReplay', () => {
  it('clamps at both ends rather than wrapping', () => {
    expect(stepReplay(1)).toBe(0)

    loadSession(FILE)
    expect(stepReplay(1)).toBe(1)
    expect(stepReplay(-5)).toBe(0)
    // Jumping from the last trade of the day back to the first reads as a bug every time.
    expect(stepReplay(99)).toBe(2)
  })
})

describe('seekReplay', () => {
  it('lands on a step, because a session is walked and not watched', () => {
    expect(seekReplay(2)).toBe(0)

    loadSession(FILE)
    expect(seekReplay(2)).toBe(2)
    expect(seekReplay(-1)).toBe(0)
    expect(seekReplay(1.8)).toBe(1)
  })
})

describe('publishStep', () => {
  it('publishes the trade being stood in', () => {
    loadSession(FILE)
    seekReplay(1)

    expect(publishStep().id).toBe('t2')
    tick()
    expect(appState.replay.trade.instrument).toBe('ETH-USDT')
  })
})

describe('setSpeed', () => {
  it('snaps to the offered set, since every value between behaves like one of them', () => {
    expect(setSpeed(2)).toBe(2)
    // A tie goes to the slower option: being asked to keep up is the failure mode here.
    expect(setSpeed(3)).toBe(2)
    expect(setSpeed(3.5)).toBe(4)
    expect(setSpeed(0.1)).toBe(0.5)

    expect(setSpeed('nonsense')).toBe(1)
    expect(SPEEDS).toContain(1)
  })
})

describe('liveOnly', () => {
  it('is the whole feature’s safety in one predicate', () => {
    expect(liveOnly()).toBe(true)

    loadSession(FILE)
    tick()
    // An order placed from inside a replay is a market order at a price that stopped
    // existing hours ago.
    expect(liveOnly()).toBe(false)
  })
})

describe('exitReplay', () => {
  it('clears the gate and puts the live desk back', () => {
    const jumped = []
    loadSession(FILE, { snapshot: (label) => label })

    expect(exitReplay({ jump: (handle) => jumped.push(handle) })).toBe(true)
    tick()
    expect(appState.replay.active).toBe(false)
    expect(jumped).toEqual(['live-head'])
    expect(replayState().total).toBe(0)
  })
})

describe('importFile', () => {
  it('reports an unreadable file rather than failing silently', async () => {
    const good = await importFile({ text: async () => JSON.stringify(FILE) })
    expect(good.ok).toBe(true)

    const broken = await importFile({
      text: async () => {
        throw new Error('disk')
      },
    })
    tick()
    expect(broken.reason).toBe('unreadable file')
    expect(appState.replay.error).toBe('unreadable file')

    expect(await importFile(null)).toEqual({ ok: false, reason: 'no file' })
  })
})

describe('registerImportActions', () => {
  it('binds the transport', () => {
    expect(registerImportActions()).toEqual([
      ACTIONS.replay.step,
      ACTIONS.replay.seek,
      ACTIONS.replay.speed,
      ACTIONS.replay.exit,
      ACTIONS.replay.import,
    ])
  })
})

describe('resetReplay', () => {
  it('drops any loaded session', () => {
    loadSession(FILE)

    expect(resetReplay()).toBe(true)
    tick()
    expect(appState.replay.active).toBe(false)
    expect(replayState().total).toBe(0)
  })
})
