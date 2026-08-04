// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import {
  SPEEDS,
  MAX_GAP_MS,
  nextTickDelay,
  loadReplay,
  stepTick,
  playReplay,
  pauseReplay,
  seekToTick,
  setReplaySpeed,
  exitReplay,
  currentPlayer,
  resetPlayer,
  registerPlayerActions,
  publishPlayer,
} from './player.js'
import { openRecordingDb, putRecord, deleteSession, SESSION_STORE, CHUNK_STORE } from './recordings.js'
import { appState, tick, resetState } from '../app/engine.js'
import { clearActions, actionNames } from '../actions/registry.js'
import { ACTIONS } from '../actions/names.js'

const AT = 1785000000000

/** A timer double whose callbacks the test fires by hand. */
function fakeTimer() {
  const queue = []
  return {
    queue,
    setTimeout: (fn, ms) => (queue.push([fn, ms]), queue.length),
    clearTimeout: () => {},
    run: () => queue.shift()?.[0]?.(),
  }
}

async function seedRecording(db) {
  await putRecord(db, SESSION_STORE, { id: 'rec-p', label: 'CPI spike', startedAt: AT, ticks: 3 })
  await putRecord(db, CHUNK_STORE, {
    sessionId: 'rec-p',
    seq: 0,
    ticks: [
      { symbol: 'BTC-USDT', px: 1, ts: AT },
      { symbol: 'BTC-USDT', px: 2, ts: AT + 100 },
      { symbol: 'BTC-USDT', px: 3, ts: AT + 300 },
    ],
  })
}

beforeEach(() => {
  resetState()
  clearActions()
  resetPlayer()
})

describe('nextTickDelay', () => {
  it('scales the recorded gap by speed and never replays a silence in full', () => {
    expect(nextTickDelay({ ts: AT }, { ts: AT + 100 }, 1)).toBe(100)
    expect(nextTickDelay({ ts: AT }, { ts: AT + 100 }, 10)).toBe(10)

    // A four-minute quiet stretch would otherwise replay as four minutes of nothing, and
    // the trader would conclude the player had hung. Clamped before scaling, so it is
    // skipped rather than merely shortened.
    expect(nextTickDelay({ ts: AT }, { ts: AT + 240000 }, 1)).toBe(MAX_GAP_MS)

    // At 50x a burst should replay as a burst; forcing a millisecond between ticks would
    // stretch it back out.
    expect(nextTickDelay({ ts: AT }, { ts: AT + 20 }, 50)).toBe(0)

    // Time going backwards is not a negative wait.
    expect(nextTickDelay({ ts: AT + 100 }, { ts: AT }, 1)).toBe(0)
    expect(nextTickDelay(null, null, 1)).toBe(0)
    expect(nextTickDelay({ ts: AT }, { ts: AT + 100 }, 0)).toBe(100)
  })
})

describe('loadReplay', () => {
  it('flattens a session up front and publishes what the transport needs', async () => {
    const db = await openRecordingDb()
    await seedRecording(db)

    const loaded = await loadReplay('rec-p', { db })
    tick()

    expect(loaded.ticks).toHaveLength(3)
    expect(appState.replay.player.active).toBe(true)
    expect(appState.replay.player.total).toBe(3)
    expect(appState.replay.player.label).toBe('CPI spike')

    // A recording with no ticks is not something to enter replay for.
    expect(await loadReplay('missing', { db })).toBeNull()
    expect(await loadReplay('', { db })).toBeNull()
    expect(await loadReplay('rec-p', { db: null })).toBeNull()

    await deleteSession(db, 'rec-p')
  })
})

describe('stepTick', () => {
  it('publishes onto the live bus so everything replays without knowing it is replay', async () => {
    const db = await openRecordingDb()
    await seedRecording(db)
    await loadReplay('rec-p', { db })

    const seen = []
    expect(stepTick({ publish: (t) => seen.push(t) }).px).toBe(1)
    tick()
    expect(appState.replay.player.cursor).toBe(1)
    // The same bus the live feed uses - a strategy tested against a separate playback path
    // is a strategy tested against something other than the desk.
    expect(seen).toHaveLength(1)

    stepTick({ publish: () => {} })
    stepTick({ publish: () => {} })
    // Past the end is null rather than a wrap or a throw.
    expect(stepTick({ publish: () => {} })).toBeNull()

    resetPlayer()
    expect(stepTick({ publish: () => {} })).toBeNull()
    await deleteSession(db, 'rec-p')
  })
})

describe('playReplay', () => {
  it('paces itself through the session and stops at the end', async () => {
    const db = await openRecordingDb()
    await seedRecording(db)
    await loadReplay('rec-p', { db })
    setReplaySpeed({}, { speed: 1 })
    tick()

    const timer = fakeTimer()
    const seen = []
    expect(playReplay({ timer, publish: (t) => seen.push(t) })).toBe(true)
    tick()
    expect(appState.replay.player.playing).toBe(true)
    // The first tick goes immediately; the gap to the second is scheduled.
    expect(seen).toHaveLength(1)
    expect(timer.queue[0][1]).toBe(100)

    timer.run()
    expect(seen).toHaveLength(2)
    timer.run()
    tick()
    // The last tick has nothing after it, so playback stops rather than spinning.
    expect(seen).toHaveLength(3)
    expect(appState.replay.player.playing).toBe(false)

    // Playing twice is one playback, not two pumps racing the same cursor.
    playReplay({ timer, publish: () => {} })
    expect(playReplay({ timer, publish: () => {} })).toBe(true)

    resetPlayer()
    expect(playReplay({ timer })).toBe(false)
    await deleteSession(db, 'rec-p')
  })
})

describe('pauseReplay', () => {
  it('stops where it is, keeping the cursor for a step or a resume', async () => {
    const db = await openRecordingDb()
    await seedRecording(db)
    await loadReplay('rec-p', { db })

    const timer = fakeTimer()
    playReplay({ timer, publish: () => {} })
    expect(pauseReplay({ timer })).toBe(true)
    tick()

    expect(appState.replay.player.playing).toBe(false)
    // The cursor survives a pause - that is the difference between pause and exit.
    expect(currentPlayer().cursor).toBe(1)

    resetPlayer()
    expect(pauseReplay({ timer })).toBe(false)
    await deleteSession(db, 'rec-p')
  })
})

describe('seekToTick', () => {
  it('jumps anywhere and clamps rather than refusing the ends', async () => {
    const db = await openRecordingDb()
    await seedRecording(db)
    await loadReplay('rec-p', { db })

    expect(seekToTick(2)).toBe(2)
    tick()
    expect(appState.replay.player.cursor).toBe(2)

    // A click at the very end of the timeline is a seek to the end, not a mistake.
    expect(seekToTick(999)).toBe(3)
    expect(seekToTick(-5)).toBe(0)

    resetPlayer()
    expect(seekToTick(1)).toBe(0)
    await deleteSession(db, 'rec-p')
  })
})

describe('setReplaySpeed', () => {
  it('snaps to a speed the transport can show', () => {
    expect(setReplaySpeed({}, { speed: 25 })).toBe(25)
    tick()
    expect(appState.replay.player.speed).toBe(25)

    // The DOM sends a control's text as `value`.
    expect(setReplaySpeed({}, { value: 5 })).toBe(5)

    // A speed the six buttons cannot show is a state nothing on screen explains.
    expect(setReplaySpeed({}, { speed: 3 })).toBe(1)
    expect(setReplaySpeed({}, {})).toBe(1)
    expect(SPEEDS).toEqual([1, 2, 5, 10, 25, 50])
  })
})

describe('exitReplay', () => {
  it('returns the desk to live and drops the session', async () => {
    const db = await openRecordingDb()
    await seedRecording(db)
    await loadReplay('rec-p', { db })

    expect(exitReplay({}, { timer: fakeTimer() })).toBe(true)
    tick()

    expect(appState.replay.player.active).toBe(false)
    expect(appState.replay.player.total).toBe(0)
    expect(currentPlayer()).toBeNull()
    expect(appState.ui.toasts[0].message).toContain('back to live')

    await deleteSession(db, 'rec-p')
  })
})

describe('publishPlayer', () => {
  it('writes the transport as one object, merging rather than replacing', () => {
    publishPlayer({ active: true, total: 9 })
    tick()
    expect(appState.replay.player).toMatchObject({ active: true, total: 9, cursor: 0 })

    // The fields always move together, so a patch keeps the rest - five separate path
    // writes would repaint the block up to five times for one action.
    publishPlayer({ cursor: 4 })
    tick()
    expect(appState.replay.player).toMatchObject({ active: true, total: 9, cursor: 4 })
  })
})

describe('currentPlayer', () => {
  it('exposes the loaded session, and nothing when there is none', () => {
    expect(currentPlayer()).toBeNull()
  })
})

describe('resetPlayer', () => {
  it('drops the player without touching state', () => {
    expect(resetPlayer()).toBe(true)
    expect(currentPlayer()).toBeNull()
  })
})

describe('registerPlayerActions', () => {
  it('registers the transport', () => {
    expect(registerPlayerActions()).toEqual([
      ACTIONS.replay.play,
      ACTIONS.replay.pause,
      ACTIONS.replay.load,
      ACTIONS.replay.stepTick,
      ACTIONS.replay.tickSpeed,
      ACTIONS.replay.unload,
    ])
    expect(actionNames()).toContain('replay.play')
  })
})
