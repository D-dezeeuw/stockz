// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { describe, it, expect } from 'vitest'
import {
  RECORDING_DB,
  SESSION_STORE,
  CHUNK_STORE,
  DB_VERSION,
  openRecordingDb,
  putRecord,
  listSessions,
  readChunks,
  deleteSession,
} from './recordings.js'

describe('openRecordingDb', () => {
  it('creates both stores and answers null rather than throwing when unavailable', async () => {
    const db = await openRecordingDb()

    expect(db).toBeTruthy()
    expect(db.name).toBe(RECORDING_DB)
    expect(db.version).toBe(DB_VERSION)
    expect([...db.objectStoreNames].sort()).toEqual([CHUNK_STORE, SESSION_STORE].sort())

    // A browser in private mode with IndexedDB disabled costs the trader the recorder,
    // never the desk - so this resolves rather than rejects.
    expect(await openRecordingDb({ factory: null })).toBeNull()
    expect(await openRecordingDb({ factory: { open: () => { throw new Error('blocked') } } })).toBeNull()
  })
})

describe('putRecord', () => {
  it('writes a record and reports failure instead of raising it', async () => {
    const db = await openRecordingDb()

    expect(await putRecord(db, SESSION_STORE, { id: 'put-1', startedAt: 1 })).toBe(true)
    expect((await listSessions(db)).some((row) => row.id === 'put-1')).toBe(true)

    expect(await putRecord(null, SESSION_STORE, { id: 'x' })).toBe(false)
    // A store that does not exist is a programming error, but not one worth taking the
    // desk down for mid-session.
    expect(await putRecord(db, 'nosuchstore', { id: 'x' })).toBe(false)
    await deleteSession(db, 'put-1')
  })
})

describe('listSessions', () => {
  it('lists recordings newest first, because the wanted one is almost always the last', async () => {
    const db = await openRecordingDb()
    await putRecord(db, SESSION_STORE, { id: 'old', startedAt: 1000 })
    await putRecord(db, SESSION_STORE, { id: 'new', startedAt: 9000 })

    expect((await listSessions(db)).map((row) => row.id)).toEqual(['new', 'old'])
    expect(await listSessions(null)).toEqual([])

    await deleteSession(db, 'old')
    await deleteSession(db, 'new')
  })
})

describe('readChunks', () => {
  it('returns one session’s chunks in write order and nobody else’s', async () => {
    const db = await openRecordingDb()
    await putRecord(db, CHUNK_STORE, { sessionId: 'a', seq: 1, ticks: [2] })
    await putRecord(db, CHUNK_STORE, { sessionId: 'a', seq: 0, ticks: [1] })
    await putRecord(db, CHUNK_STORE, { sessionId: 'b', seq: 0, ticks: [9] })

    const chunks = await readChunks(db, 'a')
    // Ascending seq, or a replay would play the session out of order.
    expect(chunks.map((c) => c.seq)).toEqual([0, 1])
    expect(chunks.flatMap((c) => c.ticks)).toEqual([1, 2])

    expect(await readChunks(db, 'missing')).toEqual([])
    expect(await readChunks(db, '')).toEqual([])
    expect(await readChunks(null, 'a')).toEqual([])

    await deleteSession(db, 'a')
    await deleteSession(db, 'b')
  })
})

describe('deleteSession', () => {
  it('takes the ticks with the row, so nothing unreachable keeps the quota', async () => {
    const db = await openRecordingDb()
    await putRecord(db, SESSION_STORE, { id: 'gone', startedAt: 1 })
    await putRecord(db, CHUNK_STORE, { sessionId: 'gone', seq: 0, ticks: [1, 2] })

    expect(await deleteSession(db, 'gone')).toBe(true)
    expect((await listSessions(db)).some((row) => row.id === 'gone')).toBe(false)
    // Deleting the row and leaving the chunks would fill the origin's quota with data
    // nothing can ever reach again.
    expect(await readChunks(db, 'gone')).toEqual([])

    expect(await deleteSession(db, '')).toBe(false)
    expect(await deleteSession(null, 'gone')).toBe(false)
  })
})
