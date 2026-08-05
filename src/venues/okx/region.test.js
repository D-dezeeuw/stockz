import { describe, it, expect, beforeEach } from 'vitest'
import { eeaAccount, okxRestBase, okxPublicBase, OKX_REST_HOSTS } from './region.js'
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
  it('aims requests at the platform the keys were created on, EU first', () => {
    expect(okxRestBase()).toBe(OKX_REST_HOSTS.eea)
    expect(okxRestBase({ settings: { okxEea: false } })).toBe(OKX_REST_HOSTS.global)
    expect(OKX_REST_HOSTS.eea).toBe('https://eea.okx.com')

    // Read from live state at call time: flipping the checkbox redirects the next request.
    setValue(PATHS.settings.okxEea, false)
    tick()
    expect(okxRestBase()).toBe('https://www.okx.com')

    // The write must be visible while still *queued*, before any tick lands it. Boot is
    // exactly this moment: restoreSettings queues the persisted value and the clock sync
    // fires in the same synchronous pass — reading only landed state there would probe the
    // wrong platform's clock on every single boot.
    setValue(PATHS.settings.okxEea, true)
    expect(okxRestBase()).toBe('https://eea.okx.com')
    tick()
  })
})

describe('okxPublicBase', () => {
  it('always answers with the global platform, because it is the only one browsers may ask', () => {
    // Probed, not assumed: www reflects any Origin; eea.okx.com and my.okx.com send no
    // CORS headers and 405 the OPTIONS preflight. Public data is the shared global book,
    // so asking the venue that answers costs nothing.
    expect(okxPublicBase()).toBe(OKX_REST_HOSTS.global)

    setValue(PATHS.settings.okxEea, true)
    tick()
    expect(okxPublicBase()).toBe('https://www.okx.com')
  })
})
