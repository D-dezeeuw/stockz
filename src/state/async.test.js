// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  ASYNC_STATUS,
  retryDelay,
  setAsyncStatus,
  loadAsync,
  abortAsync,
  abortAllAsync,
  refreshServerTime,
  defaultServerTimeLoader,
} from './async.js'
import { appState, tick, resetState } from '../app/engine.js'
import { PATHS } from './paths.js'

/** The server-time source's paths, reused as the probe for the generic helpers. */
const PROBE = {
  value: PATHS.app.serverTime,
  status: PATHS.app.serverTimeStatus,
  error: PATHS.app.serverTimeError,
}

beforeEach(() => {
  resetState()
  abortAllAsync()
})

describe('retryDelay', () => {
  it('doubles per attempt up to a ceiling, so a blip cannot silence a venue for an hour', () => {
    expect(retryDelay(0)).toBe(250)
    expect(retryDelay(1)).toBe(500)
    expect(retryDelay(2)).toBe(1000)
    expect(retryDelay(10)).toBe(8000)
    expect(retryDelay(3, { baseMs: 100, capMs: 300 })).toBe(300)
    expect(retryDelay(-1)).toBe(250)
    expect(retryDelay(NaN)).toBe(250)
  })
})

describe('setAsyncStatus', () => {
  it('writes the status trio and clears the error once a source recovers', () => {
    setAsyncStatus(PROBE, ASYNC_STATUS.error, { error: 'venue down' })
    tick()
    expect(appState.app.serverTimeStatus).toBe('error')
    expect(appState.app.serverTimeError).toBe('venue down')

    setAsyncStatus(PROBE, ASYNC_STATUS.ready, { value: 42 })
    tick()
    expect(appState.app.serverTimeStatus).toBe('ready')
    expect(appState.app.serverTime).toBe(42)
    expect(appState.app.serverTimeError).toBe('')

    // An unknown status degrades to idle rather than corrupting the convention.
    expect(setAsyncStatus(PROBE, 'nonsense')).toBe('idle')
    expect(setAsyncStatus(PROBE, ASYNC_STATUS.error, {})).toBe('error')
  })
})

describe('loadAsync', () => {
  it('records loading then ready, and turns a failure into an error status', async () => {
    const ok = await loadAsync('probe', PROBE, async () => 123)
    tick()
    expect(ok).toEqual({ status: 'ready', value: 123 })
    expect(appState.app.serverTime).toBe(123)
    expect(appState.app.serverTimeStatus).toBe('ready')

    const failed = await loadAsync('probe', PROBE, async () => {
      throw new Error('venue timeout')
    })
    tick()
    expect(failed).toEqual({ status: 'error', error: 'venue timeout' })
    expect(appState.app.serverTimeStatus).toBe('error')
    expect(appState.app.serverTimeError).toBe('venue timeout')

    // The loader is handed a signal it can honour.
    let seenSignal = null
    await loadAsync('probe', PROBE, async (signal) => {
      seenSignal = signal
      return 1
    })
    expect(seenSignal).toBeInstanceOf(AbortSignal)
  })
})

describe('abortAsync', () => {
  it('cancels an in-flight request so a late reply cannot overwrite a newer one', async () => {
    let release = null
    const slow = loadAsync('probe', PROBE, () => new Promise((r) => (release = r)))

    expect(abortAsync('probe')).toBe(true)
    release(999)

    // The aborted request lands as idle and never writes its stale value.
    expect(await slow).toEqual({ status: 'idle' })
    tick()
    expect(appState.app.serverTime).not.toBe(999)

    // Nothing in flight is not an error.
    expect(abortAsync('probe')).toBe(false)
    expect(abortAsync('never-started')).toBe(false)
  })
})

describe('abortAllAsync', () => {
  it('cancels every source at once, for teardown and lock', async () => {
    loadAsync('a', PROBE, () => new Promise(() => {}))
    loadAsync('b', PROBE, () => new Promise(() => {}))

    expect(abortAllAsync()).toBe(2)
    expect(abortAllAsync()).toBe(0)
  })
})

describe('defaultServerTimeLoader', () => {
  it('falls back to the browser clock until a venue endpoint is wired', async () => {
    const before = Date.now()
    const value = await defaultServerTimeLoader()

    expect(value).toBeGreaterThanOrEqual(before)
    expect(Number.isFinite(value)).toBe(true)
  })
})

describe('refreshServerTime', () => {
  it('drives the server-time source through the shared status convention', async () => {
    const result = await refreshServerTime(async () => 1700000000000)
    tick()

    expect(result).toEqual({ status: 'ready', value: 1700000000000 })
    expect(appState.app.serverTime).toBe(1700000000000)
    expect(appState.app.serverTimeStatus).toBe(ASYNC_STATUS.ready)

    // A failing venue leaves the rest of the desk trading.
    const failed = await refreshServerTime(async () => {
      throw new Error('429 rate limited')
    })
    tick()
    expect(failed.status).toBe('error')
    expect(appState.app.serverTimeError).toBe('429 rate limited')
    expect(appState.app.serverTime).toBe(1700000000000)
  })
})
