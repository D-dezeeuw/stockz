import { describe, it, expect } from 'vitest'
import { initialState } from './initial.js'
import { APP_VERSION } from '../app/version.js'

describe('initialState', () => {
  it('returns a fresh flat tree covering every namespace, with overrides applied', () => {
    const state = initialState()

    // Flat dotted paths only — this is what bootstrap replays into setValue.
    for (const key of Object.keys(state)) expect(key).toMatch(/^[a-z]+\.[a-zA-Z]+$/)

    // Every namespace the architecture defines is seeded.
    const namespaces = new Set(Object.keys(state).map((k) => k.split('.')[0]))
    expect([...namespaces].sort()).toEqual([
      'alerts',
      'analytics',
      'app',
      'backtest',
      'bot',
      'breaker',
      'journal',
      'market',
      'playback',
      'replay',
      'settings',
      'strategy',
      'trade',
      'trader',
      'ui',
    ])

    // Trading starts disarmed, in paper mode, flat — never hot on boot.
    expect(state['trade.armed']).toBe(false)
    expect(state['trade.mode']).toBe('paper')
    expect(state['trade.dayPnl']).toBe(0)
    expect(state['app.version']).toBe(APP_VERSION)

    // Credentials must never appear in state (it is serialized into history and journal
    // exports). Two exemptions, both facts *about* a key rather than any part of one:
    // `ui.keysPresent` says WHETHER a key exists, and `ui.keyCheck` says what the venue
    // replied when asked about it. The vault holds the values, outside the reactive tree.
    const allowed = new Set(['ui.keysPresent', 'ui.keyCheck'])
    const credentialish = Object.keys(state).filter(
      (path) => /key|secret|passphrase|token/i.test(path) && !allowed.has(path),
    )
    expect(credentialish).toEqual([])
    expect(state['ui.keysPresent']).toEqual({ okx: false, etoro: false })
    // Four prose fields and nothing that could hold a secret, checked shape-first so a later
    // edit cannot widen this into somewhere a key would fit.
    expect(Object.keys(state['ui.keyCheck']).sort()).toEqual(['code', 'fix', 'ok', 'reason'])

    // Overrides win, and each call is an independent tree.
    const custom = initialState({ version: '9.9.9', engine: '1.1.0', ts: 1234 })
    expect(custom['app.version']).toBe('9.9.9')
    expect(custom['app.engine']).toBe('1.1.0')
    expect(custom['app.bootedAt']).toBe(1234)

    state['trade.orders'].push('mutated')
    expect(initialState()['trade.orders']).toEqual([])
  })
})
