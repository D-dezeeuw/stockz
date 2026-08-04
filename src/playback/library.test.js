// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import {
  recordingSize,
  durationLabel,
  libraryRow,
  listRecordings,
  refreshLibrary,
  libraryView,
  deleteRecording,
  renameRecording,
  registerLibraryActions,
} from './library.js'
import { openRecordingDb, putRecord, deleteSession, SESSION_STORE, CHUNK_STORE } from './recordings.js'
import { appState, tick, resetState } from '../app/engine.js'
import { clearActions, actionNames } from '../actions/registry.js'
import { ACTIONS } from '../actions/names.js'

const AT = new Date(2026, 7, 12, 14, 30).getTime()

/** Two recordings in the store, one bigger and newer than the other. */
async function seed(db) {
  await putRecord(db, SESSION_STORE, {
    id: 'rec-old', venue: 'okx', instruments: ['ETH-USDT'], startedAt: AT - 86400000,
    endedAt: AT - 86400000 + 30000, durationMs: 30000, ticks: 300, chunks: 1,
  })
  await putRecord(db, CHUNK_STORE, { sessionId: 'rec-old', seq: 0, ticks: [{ px: 1 }] })
  await putRecord(db, SESSION_STORE, {
    id: 'rec-new', venue: 'okx', instruments: ['BTC-USDT', 'SOL-USDT'], startedAt: AT,
    endedAt: AT + 125000, durationMs: 125000, ticks: 9000, chunks: 2,
  })
  await putRecord(db, CHUNK_STORE, { sessionId: 'rec-new', seq: 0, ticks: [{ px: 1 }, { px: 2 }, { px: 3 }] })
}

beforeEach(() => {
  resetState()
  clearActions()
})

describe('recordingSize', () => {
  it('measures what is stored rather than trusting a number written at record time', () => {
    const chunks = [{ ticks: [{ px: 1 }] }, { ticks: [{ px: 2 }, { px: 3 }] }]

    expect(recordingSize(chunks)).toBeGreaterThan(0)
    // More ticks, more bytes - the point is to be trusted when deciding what to delete.
    expect(recordingSize(chunks)).toBeGreaterThan(recordingSize([{ ticks: [{ px: 1 }] }]))

    expect(recordingSize([{ ticks: [] }])).toBe(2)
    expect(recordingSize([])).toBe(0)
    expect(recordingSize(null)).toBe(0)
  })
})

describe('durationLabel', () => {
  it('reads at a glance at every scale, and never goes negative', () => {
    expect(durationLabel(125000)).toBe('2m 05s')
    expect(durationLabel(30000)).toBe('0m 30s')
    expect(durationLabel(3900000)).toBe('1h 05m')

    // A clock that went backwards is not a negative recording.
    expect(durationLabel(-5)).toBe('0m 00s')
    expect(durationLabel(null)).toBe('0m 00s')
  })
})

describe('libraryRow', () => {
  it('names a recording by something a person recognises', () => {
    const row = libraryRow(
      { id: 'rec-1', venue: 'okx', instruments: ['BTC-USDT'], startedAt: AT, durationMs: 125000, ticks: 9000 },
      2097152,
    )

    expect(row).toMatchObject({ id: 'rec-1', venue: 'okx', duration: '2m 05s', sizeLabel: '2.0 MB' })
    // No label yet, so the timestamp stands in - `rec-lz4k9x-3f0a` is a name nobody picks
    // deliberately.
    expect(row.label).toMatch(/^2026-08-12 /)

    const named = libraryRow({ id: 'rec-1', label: 'CPI spike 14:30', startedAt: AT })
    expect(named.label).toBe('CPI spike 14:30')

    // A recording that saw forty instruments must not push the row's numbers off the edge.
    const many = libraryRow({ id: 'x', instruments: ['A', 'B', 'C', 'D', 'E'], startedAt: AT })
    expect(many.instrumentLabel).toBe('A, B, C +2')
    expect(libraryRow(null).id).toBe('')
  })
})

describe('listRecordings', () => {
  it('returns every recording with its real size, newest first', async () => {
    const db = await openRecordingDb()
    await seed(db)

    const rows = await listRecordings({ db })
    expect(rows.map((r) => r.id)).toEqual(['rec-new', 'rec-old'])
    expect(rows[0].bytes).toBeGreaterThan(rows[1].bytes)
    expect(rows[0].tickLabel).toBe('9.0K')

    expect(await listRecordings({ db: null })).toEqual([])
    await deleteSession(db, 'rec-old')
    await deleteSession(db, 'rec-new')
  })
})

describe('refreshLibrary', () => {
  it('publishes the library so the block renders without asking for it', async () => {
    const db = await openRecordingDb()
    await seed(db)

    const rows = await refreshLibrary({ db })
    tick()
    expect(appState.playback.library).toHaveLength(2)
    expect(rows[0].id).toBe('rec-new')

    await deleteSession(db, 'rec-old')
    await deleteSession(db, 'rec-new')
  })
})

describe('libraryView', () => {
  it('sorts by date or size and finds a session among dozens', () => {
    const rows = [
      { id: 'a', label: 'CPI spike', instruments: 'BTC-USDT', startedAt: 200, bytes: 10 },
      { id: 'b', label: 'quiet', instruments: 'ETH-USDT', startedAt: 900, bytes: 5 },
    ]

    expect(libraryView(rows).map((r) => r.id)).toEqual(['b', 'a'])
    expect(libraryView(rows, { sort: 'size' }).map((r) => r.id)).toEqual(['a', 'b'])

    // Matches the label or the instruments, because people remember either.
    expect(libraryView(rows, { filter: 'eth' }).map((r) => r.id)).toEqual(['b'])
    expect(libraryView(rows, { filter: 'CPI' }).map((r) => r.id)).toEqual(['a'])
    expect(libraryView(rows, { filter: 'nothing' })).toEqual([])

    // Never sorted in place: the published array is shared with the binding, and reordering
    // it would move what is on screen with no state write to explain why.
    const original = [...rows]
    libraryView(rows, { sort: 'size' })
    expect(rows).toEqual(original)
    expect(libraryView(null)).toEqual([])
  })
})

describe('deleteRecording', () => {
  it('reclaims the space and takes the row off screen with no confirm step', async () => {
    const db = await openRecordingDb()
    await seed(db)
    await refreshLibrary({ db })
    tick()

    expect(await deleteRecording({}, { id: 'rec-old', db })).toBe(true)
    tick()
    // Off the view immediately: a row that survives a delete the trader watched happen
    // reads as a desk that ignored them.
    expect(appState.playback.library.map((r) => r.id)).toEqual(['rec-new'])
    expect(appState.ui.toasts[0].message).toContain('deleted')

    expect(await deleteRecording({}, { id: '', db })).toBe(false)
    await deleteSession(db, 'rec-new')
  })
})

describe('renameRecording', () => {
  it('gives a recording a name that will still mean something next week', async () => {
    const db = await openRecordingDb()
    await seed(db)

    expect(await renameRecording({}, { id: 'rec-new', label: 'CPI spike 14:30', db })).toBe('CPI spike 14:30')
    tick()
    expect(appState.playback.library.find((r) => r.id === 'rec-new').label).toBe('CPI spike 14:30')

    // The DOM sends an input's text as `value`; both shapes are accepted.
    expect(await renameRecording({}, { id: 'rec-new', value: ' trimmed ', db })).toBe('trimmed')

    expect(await renameRecording({}, { id: 'missing', label: 'x', db })).toBe('')
    expect(await renameRecording({}, { label: 'x', db })).toBe('')
    expect(await renameRecording({}, { id: 'rec-new', label: 'x', db: null })).toBe('')

    await deleteSession(db, 'rec-old')
    await deleteSession(db, 'rec-new')
  })
})

describe('registerLibraryActions', () => {
  it('registers delete and rename', () => {
    expect(registerLibraryActions()).toEqual([
      ACTIONS.playback.deleteRecording,
      ACTIONS.playback.renameRecording,
    ])
    expect(actionNames()).toContain('playback.deleteRecording')
  })
})
