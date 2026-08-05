import { describe, it, expect, beforeEach } from 'vitest'
import { eeaAccount, okxRestBase, OKX_REST_HOSTS } from './region.js'
import { setValue, tick, resetState } from '../../app/engine.js'
import { PATHS } from '../../state/paths.js'

beforeEach(() => {
  resetState()
})

describe('eeaAccount', () => {
  it('is true only when the trader has explicitly said their account is on the EU platform', () => {
    expect(eeaAccount()).toBe(false)
    expect(eeaAccount({ settings: { okxEea: true } })).toBe(true)

    // Anything short of the boolean true is "global" — a truthy string from a corrupted
    // settings import must not silently re-aim every signed request at another platform.
    expect(eeaAccount({ settings: { okxEea: 'true' } })).toBe(false)
    expect(eeaAccount({})).toBe(false)
    expect(eeaAccount(null)).toBe(false)
  })
})

describe('okxRestBase', () => {
  it('aims requests at the platform the keys were created on', () => {
    expect(okxRestBase()).toBe(OKX_REST_HOSTS.global)
    expect(okxRestBase({ settings: { okxEea: true } })).toBe(OKX_REST_HOSTS.eea)
    expect(OKX_REST_HOSTS.eea).toBe('https://eea.okx.com')

    // Read from live state at call time: flipping the checkbox redirects the next request.
    setValue(PATHS.settings.okxEea, true)
    tick()
    expect(okxRestBase()).toBe('https://eea.okx.com')
  })
})
