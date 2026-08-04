import { createLogger } from '../utils/log.js'

/**
 * Encryption at rest for remembered credentials.
 *
 * The question this answers is "can the cached keys be hashed?" — and they cannot, because a
 * hash is one-way and the desk has to hand OKX the real key to sign a request. Obfuscating
 * them (base64, XOR, a scramble) would be pure security-by-obscurity: the code that decodes
 * it ships in the same page as the ciphertext, so anyone reading `localStorage` in devtools
 * can read the decoder in the next tab.
 *
 * What actually helps is a key **JavaScript cannot read**. WebCrypto can mint an AES-GCM key
 * with `extractable: false`; the browser holds the material and will encrypt and decrypt with
 * it on request, but no amount of script can export it. IndexedDB is the only place such a
 * key can persist, which is why this module reaches for it when nothing else here does.
 *
 * **What this defends against**, honestly and exhaustively: a `localStorage` dump — a browser
 * profile copied off a disk, a sync backup, a shared machine, somebody glancing at devtools,
 * a support bundle. In every one of those the attacker gets ciphertext and no way to turn it
 * back into a key.
 *
 * **What it does not defend against**: script running on this origin. An attacker with XSS
 * can simply ask the same non-extractable key to decrypt, exactly as the desk does. No static
 * client-side app can prevent that — the only real mitigation is at the venue, where a key
 * scoped to trade-only with an IP allowlist has a far smaller blast radius than anything a
 * browser can offer.
 */

const log = createLogger('keystore')

/** Where the wrapping key lives. */
export const KEYSTORE_DB = 'stockz-keystore'
export const KEYSTORE_STORE = 'wrap'
export const WRAP_ID = 'v1'

/**
 * Open (or create) the keystore database.
 *
 * @param {IDBFactory} [factory] - injectable indexedDB.
 * @returns {Promise<IDBDatabase|null>} the database, or null when unavailable.
 */
export function openKeyDb(factory = globalThis.indexedDB) {
  if (!factory?.open) return Promise.resolve(null)

  return new Promise((resolve) => {
    const request = factory.open(KEYSTORE_DB, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(KEYSTORE_STORE)) {
        request.result.createObjectStore(KEYSTORE_STORE)
      }
    }
    request.onsuccess = () => resolve(request.result)
    // Private browsing and blocked-storage modes reject rather than throw. Resolving null
    // rather than rejecting keeps every caller on one path: no keystore means no caching,
    // never a broken boot.
    request.onerror = () => resolve(null)
    request.onblocked = () => resolve(null)
  })
}

/**
 * Read or create the non-extractable wrapping key.
 *
 * @param {{factory?: IDBFactory, subtle?: SubtleCrypto}} [deps] - injectable plumbing.
 * @returns {Promise<CryptoKey|null>} the key, or null when crypto is unavailable.
 */
export async function getWrapKey(deps = {}) {
  const subtle = deps.subtle ?? globalThis.crypto?.subtle
  const db = await openKeyDb(deps.factory)
  if (!subtle || !db) return null

  const existing = await idbGet(db, WRAP_ID)
  if (existing) return existing

  // `extractable: false` is the whole point: the browser will encrypt and decrypt with this
  // key forever, and no script — ours or anybody's — can ever read the bytes out of it.
  const key = await subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ])
  await idbPut(db, WRAP_ID, key)

  return key
}

/**
 * Read one value from the keystore.
 *
 * @param {IDBDatabase} db - the database.
 * @param {string} id - the record id.
 * @returns {Promise<unknown>} the value, or null.
 */
export function idbGet(db, id) {
  return new Promise((resolve) => {
    try {
      const request = db.transaction(KEYSTORE_STORE, 'readonly').objectStore(KEYSTORE_STORE).get(id)
      request.onsuccess = () => resolve(request.result ?? null)
      request.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

/**
 * Write one value into the keystore.
 *
 * @param {IDBDatabase} db - the database.
 * @param {string} id - the record id.
 * @param {unknown} value - what to store.
 * @returns {Promise<boolean>} true when written.
 */
export function idbPut(db, id, value) {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(KEYSTORE_STORE, 'readwrite')
      tx.objectStore(KEYSTORE_STORE).put(value, id)
      tx.oncomplete = () => resolve(true)
      tx.onerror = () => resolve(false)
      tx.onabort = () => resolve(false)
    } catch {
      resolve(false)
    }
  })
}

/**
 * Encrypt a string.
 *
 * @param {string} text - the plaintext.
 * @param {object} [deps] - injectable plumbing.
 * @returns {Promise<{iv: number[], data: number[]}|null>} the envelope, or null.
 */
export async function encryptBlob(text, deps = {}) {
  const subtle = deps.subtle ?? globalThis.crypto?.subtle
  const key = deps.key ?? (await getWrapKey(deps))
  if (!subtle || !key) return null

  // A fresh IV every time. Reusing one with AES-GCM does not merely weaken the encryption,
  // it breaks it outright — two messages under the same key and IV leak their XOR.
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12))
  const bytes = new TextEncoder().encode(String(text ?? ''))

  try {
    const data = await subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes)
    return { iv: [...iv], data: [...new Uint8Array(data)] }
  } catch (err) {
    log.warn(`could not encrypt: ${err?.message ?? err}`)
    return null
  }
}

/**
 * Decrypt an envelope.
 *
 * @param {{iv: number[], data: number[]}} payload - the envelope.
 * @param {object} [deps] - injectable plumbing.
 * @returns {Promise<string>} the plaintext, or '' when it cannot be read.
 */
export async function decryptBlob(payload, deps = {}) {
  const subtle = deps.subtle ?? globalThis.crypto?.subtle
  const key = deps.key ?? (await getWrapKey(deps))
  if (!subtle || !key || !Array.isArray(payload?.iv) || !Array.isArray(payload?.data)) return ''

  try {
    const plain = await subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(payload.iv) },
      key,
      new Uint8Array(payload.data),
    )
    return new TextDecoder().decode(plain)
  } catch (err) {
    // A wrong key or tampered ciphertext lands here. Empty rather than throwing: an
    // unreadable cache should mean "ask for the keys again", never "the desk will not boot".
    log.warn(`could not decrypt the key cache: ${err?.message ?? err}`)
    return ''
  }
}

/**
 * Drop the wrapping key, making every stored envelope permanently unreadable.
 *
 * @param {{factory?: IDBFactory}} [deps] - injectable plumbing.
 * @returns {Promise<boolean>} true when it is gone.
 */
export async function resetKeystore(deps = {}) {
  const db = await openKeyDb(deps.factory)
  if (!db) return false

  // Destroying the key is what makes `lock` final: the ciphertext in localStorage may
  // survive on a disk somewhere, and without this key it is noise forever.
  return idbPut(db, WRAP_ID, null)
}
