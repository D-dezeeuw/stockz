// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  EXPORT_SCHEMA,
  SECRET_KEYS,
  REDACTED,
  isSecretKey,
  redactSecrets,
  buildEnvelope,
  exportSession,
  exportName,
  downloadFile,
  registerExportActions,
  auditExport,
} from './export.js'
import { APP_VERSION } from '../app/version.js'
import { ACTIONS } from '../actions/names.js'
import { clearActions } from '../actions/registry.js'
import { setValue, tick, resetState } from '../app/engine.js'
import { PATHS } from '../state/paths.js'

const TRADES = [
  { id: 't1', instrument: 'BTC-USDT', net: 5 },
  { id: 't2', instrument: 'ETH-USDT', net: -2 },
]

beforeEach(() => {
  resetState()
  clearActions()
})

describe('isSecretKey', () => {
  it('matches the word however the field was spelled', () => {
    expect(isSecretKey('okxApiKey')).toBe(true)
    expect(isSecretKey('OKX_API_KEY')).toBe(true)
    expect(isSecretKey('etoro-passphrase')).toBe(true)
    expect(isSecretKey('refreshToken')).toBe(true)

    expect(isSecretKey('instrument')).toBe(false)
    expect(isSecretKey(null)).toBe(false)
    expect(SECRET_KEYS).toContain('secret')
  })
})

describe('redactSecrets', () => {
  it('reaches anything named like a credential, however deeply it is buried', () => {
    const clean = redactSecrets({
      venues: { okx: { apiKey: 'live-key-12345', instrument: 'BTC-USDT' } },
      rows: [{ secret: 'nope', qty: 2 }],
      qty: 1,
    })

    expect(clean.venues.okx.apiKey).toBe(REDACTED)
    expect(clean.rows[0].secret).toBe(REDACTED)
    // A marker rather than a deletion, so a reader can tell removal from absence.
    expect(clean.venues.okx.instrument).toBe('BTC-USDT')
    expect(clean.qty).toBe(1)

    expect(redactSecrets('plain')).toBe('plain')
    expect(redactSecrets(null)).toBeNull()
  })
})

describe('buildEnvelope', () => {
  it('carries the schema, or nothing can ever safely import it', () => {
    const envelope = buildEnvelope({ ui: { theme: 'night' } }, { now: 0, trades: TRADES })

    expect(envelope.schemaVersion).toBe(EXPORT_SCHEMA)
    expect(envelope.appVersion).toBe(APP_VERSION)
    // ISO, because an epoch millisecond in a file a human opens is a conversion job.
    expect(envelope.exportedAt).toBe('1970-01-01T00:00:00.000Z')
    expect(envelope.instruments).toEqual(['BTC-USDT', 'ETH-USDT'])
    expect(envelope.state.ui.theme).toBe('night')
  })
})

describe('exportSession', () => {
  it('exports the journal even when the state tree cannot be serialized', () => {
    const file = exportSession({
      now: 0,
      trades: TRADES,
      snapshot: () => ({ settings: { okxApiKey: 'live-key-12345' } }),
    })

    expect(file.name).toBe('stockz-session-19700101.json')
    expect(JSON.parse(file.text).state.settings.okxApiKey).toBe(REDACTED)
    expect(file.bytes).toBeGreaterThan(0)

    // The trades are the part nobody can reconstruct; the state tree is the part nobody
    // needs to.
    const degraded = exportSession({
      now: 0,
      trades: TRADES,
      snapshot: () => {
        throw new Error('no history')
      },
    })
    expect(JSON.parse(degraded.text).trades).toHaveLength(2)
  })
})

describe('exportName', () => {
  it('date-stamps the file so a week of exports sorts itself', () => {
    expect(exportName(0)).toBe('stockz-session-19700101.json')
    expect(exportName(Date.UTC(2026, 7, 4))).toBe('stockz-session-20260804.json')
  })
})

describe('downloadFile', () => {
  it('revokes the object URL rather than holding the session in memory', () => {
    const revoked = []
    const clicked = []
    const anchor = { click: () => clicked.push(anchor.download) }

    const ok = downloadFile(
      { name: 'x.json', text: '{}' },
      {
        doc: { createElement: () => anchor },
        url: { createObjectURL: () => 'blob:1', revokeObjectURL: (href) => revoked.push(href) },
      },
    )

    expect(ok).toBe(true)
    expect(clicked).toEqual(['x.json'])
    // A held object URL keeps the whole session's JSON alive for the life of the tab.
    expect(revoked).toEqual(['blob:1'])

    // No DOM to hang the anchor on — a headless or worker context — is a no-op, not a
    // crash on the way out of a session.
    expect(downloadFile({}, { doc: {}, url: {} })).toBe(false)
  })
})

describe('registerExportActions', () => {
  it('binds the export button', () => {
    expect(registerExportActions()).toBe(ACTIONS.journal.export)
  })
})

describe('auditExport', () => {
  it('checks the bytes that actually leave, not the object they came from', () => {
    setValue(PATHS.settings.theme, 'night')
    tick()

    expect(auditExport('{"ui":{"theme":"night"}}')).toEqual([])

    setValue('settings.okxApiKey', 'live-key-12345')
    tick()
    // The guarantee that matters is about the text, and a redaction correct on a structure
    // a serializer then re-expanded would be a guarantee about the wrong thing.
    expect(auditExport('{"k":"live-key-12345"}')).toEqual(['okxApiKey'])
    expect(auditExport('{"k":"[redacted]"}')).toEqual([])
  })
})
