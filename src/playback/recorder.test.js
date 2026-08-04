// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import {
  CHUNK_TICKS,
  CHUNK_MS,
  sessionId,
  finalizeSession,
  startRecording,
  stopRecording,
  isRecording,
  toggleRecording,
  resetRecorder,
  registerRecorderActions,
} from './recorder.js'
import { openRecordingDb, readChunks, listSessions, deleteSession } from './recordings.js'
import { appState, tick, resetState } from '../app/engine.js'
import { clearActions, actionNames } from '../actions/registry.js'
import { ACTIONS } from '../actions/names.js'

const AT = 1785000000000

/** A tick bus double the test drives by hand. */
function fakeBus() {
  const listeners = new Set()
  return {
    subscribe: (fn) => (listeners.add(fn), () => listeners.delete(fn)),
    emit: (tick) => listeners.forEach((fn) => fn(tick)),
    get size() {
      return listeners.size
    },
  }
}

/** A timer double whose interval the test fires. */
function fakeTimer() {
  const fns = []
  return {
    fns,
    setInterval: (fn) => (fns.push(fn), fns.length),
    clearInterval: () => {},
  }
}

beforeEach(() => {
  resetState()
  clearActions()
  resetRecorder()
})

describe('sessionId', () => {
  it('sorts chronologically and cannot collide inside one millisecond', () => {
    const id = sessionId(AT, () => 0.5)

    expect(id.startsWith('rec-')).toBe(true)
    // Base36 of the timestamp, so ids sort in the order the recordings were made.
    expect(id).toContain(AT.toString(36))

    // Two recordings started in the same millisecond must still be two recordings.
    expect(sessionId(AT, () => 0.1)).not.toBe(sessionId(AT, () => 0.9))
    expect(sessionId(0, () => 0)).toMatch(/^rec-0-\d*0*$/)
  })
})

describe('finalizeSession', () => {
  it('describes a recording well enough to pick it later without reading a tick', () => {
    const row = finalizeSession(
      { id: 'rec-1', venue: 'okx', instruments: new Set(['ETH-USDT', 'BTC-USDT']), startedAt: AT, ticks: 1200, seq: 3 },
      AT + 60000,
    )

    expect(row).toEqual({
      id: 'rec-1',
      venue: 'okx',
      // Every instrument that actually appeared, sorted - a recording is judged later by
      // what is in it, not by what was focused when REC was pressed.
      instruments: ['BTC-USDT', 'ETH-USDT'],
      startedAt: AT,
      endedAt: AT + 60000,
      durationMs: 60000,
      ticks: 1200,
      chunks: 3,
    })

    // A clock that went backwards must not produce a negative duration.
    expect(finalizeSession({ startedAt: AT }, AT - 5000).durationMs).toBe(0)
    expect(finalizeSession(null, 0).ticks).toBe(0)
  })
})

describe('startRecording', () => {
  it('buffers ticks and writes them in batches, never one transaction per tick', async () => {
    const bus = fakeBus()
    const timer = fakeTimer()
    const db = await openRecordingDb()

    const rec = await startRecording({ db, timer, subscribe: bus.subscribe, now: () => AT, chunkTicks: 3 })
    expect(rec).toBeTruthy()
    tick()
    expect(isRecording()).toBe(true)

    // Under the chunk size nothing is written: an IndexedDB transaction per tick would sit
    // on the hot path of every message from every feed.
    bus.emit({ symbol: 'BTC-USDT', px: 1, ts: AT })
    bus.emit({ symbol: 'BTC-USDT', px: 2, ts: AT + 1 })
    expect(await readChunks(db, rec.session.id)).toHaveLength(0)

    // The third crosses the threshold and flushes.
    bus.emit({ symbol: 'ETH-USDT', px: 3, ts: AT + 2 })
    await new Promise((resolve) => setTimeout(resolve, 10))
    const chunks = await readChunks(db, rec.session.id)
    expect(chunks).toHaveLength(1)
    expect(chunks[0].ticks).toHaveLength(3)

    // The timer flushes a quiet market too, so a closed tab does not lose the tail.
    bus.emit({ symbol: 'BTC-USDT', px: 4, ts: AT + 3 })
    await timer.fns[0]()
    expect(await readChunks(db, rec.session.id)).toHaveLength(2)

    // A second start is the same recording, not a second one racing it.
    expect(await startRecording({ db, timer, subscribe: bus.subscribe })).toBe(rec)

    const row = await stopRecording()
    tick()
    expect(row).toMatchObject({ ticks: 4, chunks: 2, instruments: ['BTC-USDT', 'ETH-USDT'] })
    expect(isRecording()).toBe(false)
    // The subscription goes with it: a recorder that kept listening after stop would grow
    // a buffer nothing ever writes.
    expect(bus.size).toBe(0)

    expect((await listSessions(db)).some((s) => s.id === row.id)).toBe(true)
    await deleteSession(db, row.id)
  })

  it('says so rather than throwing when the browser has no IndexedDB', async () => {
    expect(await startRecording({ db: null })).toBeNull()
    tick()
    expect(appState.ui.toasts[0].message).toContain('recording unavailable')
    expect(isRecording()).toBe(false)
    expect(CHUNK_TICKS).toBe(500)
    expect(CHUNK_MS).toBe(2000)
  })
})

describe('stopRecording', () => {
  it('is safe to call when nothing is running', async () => {
    expect(await stopRecording()).toBeNull()
  })
})

describe('isRecording', () => {
  it('reads the live flag, which is never restored from a closed tab', () => {
    expect(isRecording({})).toBe(false)
    expect(isRecording({ playback: { recording: null } })).toBe(false)
    expect(isRecording({ playback: { recording: { id: 'rec-1' } } })).toBe(true)
  })
})

describe('toggleRecording', () => {
  it('starts when stopped and stops when started', async () => {
    const bus = fakeBus()
    const db = await openRecordingDb()

    const started = await toggleRecording({}, { db, timer: fakeTimer(), subscribe: bus.subscribe, now: () => AT })
    expect(started).toBeTruthy()
    tick()
    expect(isRecording()).toBe(true)

    const stopped = await toggleRecording({}, {})
    tick()
    expect(stopped).toMatchObject({ id: started.session.id })
    expect(isRecording()).toBe(false)
    await deleteSession(db, stopped.id)
  })
})

describe('resetRecorder', () => {
  it('drops the running recorder without writing anything', () => {
    expect(resetRecorder()).toBe(true)
  })
})

describe('registerRecorderActions', () => {
  it('registers the REC toggle', () => {
    expect(registerRecorderActions()).toEqual([ACTIONS.playback.record])
    expect(actionNames()).toContain('playback.record')
  })
})
