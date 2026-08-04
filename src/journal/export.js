import { appState, serialize } from '../app/engine.js'
import { APP_VERSION } from '../app/version.js'
import { registerAction } from '../actions/registry.js'
import { ACTIONS } from '../actions/names.js'
import { journalTrades } from './pairing.js'
import { createLogger } from '../utils/log.js'

/**
 * The session, as a file the trader owns.
 *
 * A trading day that exists only inside one browser tab is a trading day one cache clear
 * from never having happened. This is the whole session in one JSON file: the state tree,
 * the paired trades, the annotations, the metrics.
 *
 * **Redaction is not a feature here, it is the precondition.** The state tree is exported
 * verbatim and a desk holds venue credentials; an export that leaked a key would hand
 * whoever received the file the ability to trade the account. So the redaction runs over the
 * serialized payload by *key name*, deep, before anything is written — matching on the words
 * rather than on a list of known paths, because a list of paths is a list that goes stale the
 * first time somebody adds a field. Anything named like a secret is replaced with a marker
 * that says it was removed, so a reader can tell redaction from absence.
 *
 * The envelope exists for the same reason every serialized format needs one: an export with
 * no schema version is an export nothing can ever safely import.
 */

const log = createLogger('journal-export')

/** Bumped whenever the exported shape changes. */
export const EXPORT_SCHEMA = 1

/** Key fragments that mean "never write this down". */
export const SECRET_KEYS = Object.freeze([
  'apikey',
  'secret',
  'passphrase',
  'password',
  'token',
  'credential',
  'privatekey',
])

/** What replaces a redacted value, so a reader can tell removal from absence. */
export const REDACTED = '[redacted]'

/**
 * Is this key one that must never be written down?
 *
 * @param {string} key - the property name.
 * @returns {boolean} true when it must go.
 */
export function isSecretKey(key) {
  const flat = String(key ?? '').toLowerCase().replace(/[^a-z]/g, '')

  return SECRET_KEYS.some((needle) => flat.includes(needle))
}

/**
 * Strip anything that looks like a credential, however deeply it is buried.
 *
 * @param {unknown} value - the payload.
 * @returns {unknown} a redacted copy.
 */
export function redactSecrets(value) {
  if (Array.isArray(value)) return value.map(redactSecrets)
  if (!value || typeof value !== 'object') return value

  const clean = {}
  for (const [key, held] of Object.entries(value)) {
    // Matched on the key name rather than a list of known paths: a path list is a list that
    // goes stale the first time somebody adds a field, and the failure is silent.
    clean[key] = isSecretKey(key) ? REDACTED : redactSecrets(held)
  }

  return clean
}

/**
 * Wrap a payload so it can be read back later.
 *
 * @param {object} payload - the state.
 * @param {{now?: number, trades?: object[]}} [context] - extras.
 * @returns {object} the envelope.
 */
export function buildEnvelope(payload, context = {}) {
  const at = Number(context.now) || 0

  return {
    schemaVersion: EXPORT_SCHEMA,
    app: 'stockz',
    appVersion: APP_VERSION,
    // ISO, because an epoch millisecond in a file a human opens is a number they have to go
    // and convert somewhere else.
    exportedAt: new Date(at).toISOString(),
    instruments: [
      ...new Set((context.trades ?? journalTrades()).map((trade) => String(trade?.instrument ?? ''))),
    ].filter(Boolean),
    trades: context.trades ?? journalTrades(),
    state: redactSecrets(payload),
  }
}

/**
 * The session as a file's worth of text.
 *
 * @param {{now?: number, snapshot?: Function}} [deps] - injectable plumbing.
 * @returns {{name: string, text: string, bytes: number}} the file.
 */
export function exportSession(deps = {}) {
  const snapshot = deps.snapshot ?? serialize
  let payload
  try {
    payload = snapshot() ?? {}
  } catch (err) {
    // A serialize failure exports the journal alone rather than nothing: the trades are the
    // part nobody can reconstruct, and the state tree is the part nobody needs to.
    log.warn(`serialize failed: ${err?.message ?? err}`)
    payload = { note: 'state unavailable' }
  }

  const envelope = buildEnvelope(typeof payload === 'string' ? JSON.parse(payload) : payload, deps)
  const text = JSON.stringify(envelope, null, 2)

  return { name: exportName(deps.now), text, bytes: text.length }
}

/**
 * What the file is called.
 *
 * @param {number} [now] - the export time.
 * @returns {string} the filename.
 */
export function exportName(now = 0) {
  const stamp = new Date(Number(now) || 0).toISOString().slice(0, 10).replace(/-/g, '')

  return `stockz-session-${stamp}.json`
}

/**
 * Put a file on the trader's disk.
 *
 * @param {{name: string, text: string}} file - the file.
 * @param {{doc?: Document, url?: object}} [deps] - injectable plumbing.
 * @returns {boolean} true when the download was triggered.
 */
export function downloadFile(file, deps = {}) {
  const doc = deps.doc ?? globalThis.document
  const url = deps.url ?? globalThis.URL
  if (!doc?.createElement || !url?.createObjectURL) return false

  // The MIME type travels with the file rather than being hard-coded: a CSV served as JSON
  // is a CSV some spreadsheets refuse to open by double-click.
  const type = String(file?.type ?? 'application/json')
  const href = url.createObjectURL(new Blob([String(file?.text ?? '')], { type }))
  const anchor = doc.createElement('a')
  anchor.href = href
  anchor.download = String(file?.name ?? 'stockz-session.json')
  anchor.click()
  // Revoked immediately: a held object URL keeps the whole session's JSON alive in memory
  // for the life of the tab, and a trader exporting hourly would accumulate every one.
  url.revokeObjectURL?.(href)

  return true
}

/**
 * Register the export action.
 *
 * @returns {string} the action name.
 */
export function registerExportActions() {
  registerAction(ACTIONS.journal.export, () => downloadFile(exportSession({ now: Date.now() })))

  return ACTIONS.journal.export
}

/**
 * A quick check that nothing secret survived.
 *
 * @param {string} text - the serialized export.
 * @returns {string[]} the key names that leaked, empty when clean.
 */
export function auditExport(text) {
  const body = String(text ?? '')
  // Run over the finished text rather than the object: the guarantee that matters is about
  // the bytes that leave, and a redaction that was correct on a structure a serializer then
  // re-expanded would be a guarantee about the wrong thing.
  const found = []
  for (const [key, value] of Object.entries(appState.settings ?? {})) {
    if (!isSecretKey(key)) continue
    const held = String(value ?? '')
    if (held.length >= 8 && body.includes(held)) found.push(key)
  }

  return found
}
