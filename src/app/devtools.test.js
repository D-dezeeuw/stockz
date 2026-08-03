// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { mountDevtools, devDumpState, devReplayTo, loadCompanion } from './devtools.js'
import { setValue, tick, resetState, appState, history } from './engine.js'
import { PATHS } from '../state/paths.js'

beforeEach(() => {
  resetState()
})

describe('mountDevtools', () => {
  it('mounts in dev and is a hard no-op in production', async () => {
    const calls = []
    const loader = async () => ({ mount: (opts) => calls.push(opts) })

    // Production: no load, no bytes, no panel.
    expect(await mountDevtools({ isDev: false, loader })).toEqual({
      mounted: false,
      reason: 'production',
    })
    expect(calls).toHaveLength(0)

    // Dev: mounted with the scrubber and inspector on.
    expect(await mountDevtools({ isDev: true, loader })).toEqual({ mounted: true })
    expect(calls).toEqual([{ scrubber: true, inspect: true }])

    // A companion that fails to load must never stop the desk booting.
    const broken = async () => {
      throw new Error('offline')
    }
    expect(await mountDevtools({ isDev: true, loader: broken })).toEqual({
      mounted: false,
      reason: 'load-failed',
    })

    expect(await mountDevtools({ isDev: true, loader: async () => ({}) })).toEqual({
      mounted: false,
      reason: 'no-mount-export',
    })
    expect(await mountDevtools({ isDev: true, loader, doc: null })).toEqual({
      mounted: false,
      reason: 'no-document',
    })
  })
})

describe('devDumpState', () => {
  it('captures state, history depth and a serialized session for a bug report', () => {
    setValue(PATHS.ui.status, 'debugging')
    tick()

    const dump = devDumpState()

    expect(dump.state).toBe(appState)
    expect(dump.state.ui.status).toBe('debugging')
    expect(dump.historyLength).toBe(history.length)
    expect(typeof dump.json).toBe('string')
    expect(dump.json.length).toBeGreaterThan(0)
  })
})

describe('devReplayTo', () => {
  it('rewinds to a point in history and rejects out-of-range indexes', () => {
    setValue(PATHS.ui.status, 'first')
    tick()
    // replay applies entries [0, index), so this many entries == "just after 'first'".
    const afterFirst = history.length
    setValue(PATHS.ui.status, 'second')
    tick()
    expect(appState.ui.status).toBe('second')

    expect(devReplayTo(afterFirst)).toBe(true)
    expect(appState.ui.status).toBe('first')

    // The full length is valid - it means "the present".
    expect(devReplayTo(history.length)).toBe(true)
    expect(devReplayTo(history.length + 1)).toBe(false)
    expect(devReplayTo(-1)).toBe(false)
    expect(devReplayTo(1.5)).toBe(false)
    expect(devReplayTo('2')).toBe(false)
  })
})

describe('loadCompanion', () => {
  it('always settles, so a missing companion cannot take the boot path down', async () => {
    const pending = loadCompanion()
    expect(pending).toBeInstanceOf(Promise)

    // Either it resolves to the companion or it rejects - both are survivable, and
    // mountDevtools turns the rejection into a reason rather than a crash.
    const outcome = await pending.then(
      (mod) => (mod ? 'loaded' : 'empty'),
      () => 'unavailable',
    )
    expect(['loaded', 'empty', 'unavailable']).toContain(outcome)
  })
})
