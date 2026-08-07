import { describe, it, expect, beforeEach } from 'vitest'
import {
  eeaAccount,
  okxRestBase,
  okxPublicBase,
  okxProxyFor,
  OKX_REST_HOSTS,
  OKX_PROXY_PREFIXES,
} from './region.js'
import { setValue, tick, resetState } from '../../app/engine.js'
import { PATHS } from '../../state/paths.js'

beforeEach(() => {
  resetState()
})

describe('eeaAccount', () => {
  it('defaults to the EU platform and only leaves it when explicitly unticked', () => {
    // EU-first: this desk's owner trades from the EU, so a fresh boot assumes the platform
    // their keys actually live on. Unticking the checkbox is the deliberate act.
    expect(eeaAccount()).toBe(true)
    expect(eeaAccount({ settings: { okxEea: true } })).toBe(true)
    expect(eeaAccount({ settings: { okxEea: false } })).toBe(false)

    // Only the boolean false the checkbox writes leaves EU. Absent or corrupted values
    // land on the default — the platform the keys actually live on — because failing
    // toward home shows a working desk, and failing away shows 50119 on every call.
    expect(eeaAccount({ settings: { okxEea: 'false' } })).toBe(true)
    expect(eeaAccount({})).toBe(true)
    expect(eeaAccount(null)).toBe(true)
  })
})

describe('okxRestBase', () => {
  it('aims requests at the backend prefix for the platform the keys live on, EU first', () => {
    expect(okxRestBase()).toBe(OKX_PROXY_PREFIXES.eea)
    expect(okxRestBase({ settings: { okxEea: false } })).toBe(OKX_PROXY_PREFIXES.global)
    // Same-origin prefixes, not venue hosts: the browser only ever talks to its own
    // backend, which is what lets it reach OKX EU (no CORS headers there) at all.
    expect(OKX_PROXY_PREFIXES.eea).toBe('/okx-eea')
    expect(OKX_PROXY_PREFIXES.global).toBe('/okx')
    // The true hosts stay documented for the backend's side of the relay.
    expect(OKX_REST_HOSTS.eea).toBe('https://eea.okx.com')

    // Read from live state at call time: flipping the checkbox redirects the next request.
    setValue(PATHS.settings.okxEea, false)
    tick()
    expect(okxRestBase()).toBe('/okx')

    // The write must be visible while still *queued*, before any tick lands it — boot is
    // exactly this moment (restoreSettings queues, the clock sync fires pre-tick).
    setValue(PATHS.settings.okxEea, true)
    expect(okxRestBase()).toBe('/okx-eea')
    tick()
  })
})

describe('okxProxyFor', () => {
  it('names a platform’s prefix without consulting — or disturbing — the setting', () => {
    expect(okxProxyFor(true)).toBe('/okx-eea')
    expect(okxProxyFor(false)).toBe('/okx')

    // Strictly the boolean: the key probe passes an explicit universe, so anything else is
    // a caller mistake and must not silently become "EU", the aim the probe is testing.
    expect(okxProxyFor(undefined)).toBe('/okx')
    expect(okxProxyFor('true')).toBe('/okx')

    // Deaf to the setting, unlike okxRestBase — that is the whole point: the probe asks
    // every platform while the desk is still aimed at the wrong one.
    setValue(PATHS.settings.okxEea, true)
    tick()
    expect(okxProxyFor(false)).toBe('/okx')
  })
})

describe('okxPublicBase', () => {
  it('always answers with the global proxy — public data is the shared global book', () => {
    expect(okxPublicBase()).toBe(OKX_PROXY_PREFIXES.global)

    setValue(PATHS.settings.okxEea, true)
    tick()
    expect(okxPublicBase()).toBe('/okx')
  })
})

