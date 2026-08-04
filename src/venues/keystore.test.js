// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { describe, it, expect } from 'vitest'
import {
  KEYSTORE_DB,
  KEYSTORE_STORE,
  WRAP_ID,
  openKeyDb,
  getWrapKey,
  idbGet,
  idbPut,
  encryptBlob,
  decryptBlob,
  resetKeystore,
} from './keystore.js'

describe('openKeyDb', () => {
  it('resolves null rather than rejecting when storage is unavailable', async () => {
    const db = await openKeyDb()
    expect(db).toBeTruthy()
    expect(db.objectStoreNames.contains(KEYSTORE_STORE)).toBe(true)
    expect(KEYSTORE_DB).toBe('stockz-keystore')

    // Private browsing and blocked-storage modes must mean "no caching", never a boot that
    // throws, so every failure path lands on one value the callers already handle.
    expect(await openKeyDb(null)).toBeNull()
    expect(await openKeyDb({ open: () => { const r = {}; queueMicrotask(() => r.onerror?.()); return r } })).toBeNull()
  })
})

describe('getWrapKey', () => {
  it('mints a key JavaScript can never read back out', async () => {
    const key = await getWrapKey()

    expect(key).toBeTruthy()
    // The entire premise: the browser will encrypt and decrypt with this forever, and no
    // script — ours or an attacker's — can export the bytes to use elsewhere.
    expect(key.extractable).toBe(false)
    expect(key.algorithm.name).toBe('AES-GCM')

    // Stable across calls, or every reload would orphan the previous session's ciphertext.
    // Asserted functionally rather than by identity: IndexedDB structured-clones the key on
    // read, so each call hands back a different object wrapping the same material — and it
    // is the material, not the wrapper, that has to survive a reload.
    const sealed = await encryptBlob('stability-probe', { key })
    expect(await decryptBlob(sealed, { key: await getWrapKey() })).toBe('stability-probe')

    // No IndexedDB at all means no keystore, which callers treat as "do not cache".
    expect(await getWrapKey({ factory: null })).toBeNull()
  })
})

describe('idbPut', () => {
  it('reports failure instead of throwing into the caller', async () => {
    const db = await openKeyDb()

    expect(await idbPut(db, 'probe', { a: 1 })).toBe(true)
    expect(await idbPut(null, 'probe', 1)).toBe(false)
  })
})

describe('idbGet', () => {
  it('reads a value back, and null for anything missing', async () => {
    const db = await openKeyDb()
    await idbPut(db, 'probe2', { a: 2 })

    expect(await idbGet(db, 'probe2')).toEqual({ a: 2 })
    expect(await idbGet(db, 'nope')).toBeNull()
    expect(await idbGet(null, 'probe2')).toBeNull()
  })
})

describe('encryptBlob', () => {
  it('never repeats an IV, because AES-GCM reuse leaks the plaintext', async () => {
    const one = await encryptBlob('hello')
    const two = await encryptBlob('hello')

    expect(one.data.length).toBeGreaterThan(0)
    // Same plaintext, same key, different envelope. Reusing an IV would not merely weaken
    // this — two messages under one key and IV leak their XOR outright.
    expect(one.iv).not.toEqual(two.iv)
    expect(one.data).not.toEqual(two.data)

    // And the ciphertext carries none of the input.
    expect(JSON.stringify(one)).not.toContain('hello')

    // No keystore, no envelope — the caller must not be handed something it would then
    // write out believing it was encrypted.
    expect(await encryptBlob('x', { factory: null })).toBeNull()
  })
})

describe('decryptBlob', () => {
  it('round-trips, and returns empty for anything tampered with', async () => {
    const sealed = await encryptBlob('super-secret-value')
    expect(await decryptBlob(sealed)).toBe('super-secret-value')

    // A flipped byte fails the GCM tag. Empty rather than throwing: an unreadable cache
    // should mean "ask for the keys again", never "the desk will not boot".
    const tampered = { ...sealed, data: [...sealed.data.slice(0, -1), sealed.data.at(-1) ^ 0xff] }
    expect(await decryptBlob(tampered)).toBe('')

    expect(await decryptBlob(null)).toBe('')
    expect(await decryptBlob({ iv: 'no', data: 'no' })).toBe('')
  })
})

describe('resetKeystore', () => {
  it('destroys the key, so any surviving ciphertext is noise forever', async () => {
    const sealed = await encryptBlob('doomed')
    expect(await decryptBlob(sealed)).toBe('doomed')

    expect(await resetKeystore()).toBe(true)

    // The envelope may already be on a backup somewhere; without the key it stays unreadable.
    const db = await openKeyDb()
    expect(await idbGet(db, WRAP_ID)).toBeNull()

    expect(await resetKeystore({ factory: null })).toBe(false)
  })
})
