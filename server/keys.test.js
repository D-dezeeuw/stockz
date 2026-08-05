// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { venueKeys, VENUE_ENV } from './keys.js'

describe('venueKeys', () => {
  it('collects only what is really configured, never empty strings', () => {
    const env = {
      STOCKZ_OKX_API_KEY: ' k ',
      STOCKZ_OKX_SECRET_KEY: 's',
      STOCKZ_OKX_PASSPHRASE: 'p',
      STOCKZ_ETORO_API_KEY: '',
    }

    // Trimmed values, and eToro absent entirely — one empty field is not a venue.
    expect(venueKeys(env)).toEqual({ okx: { apiKey: 'k', secretKey: 's', passphrase: 'p' } })

    // A partial venue still hands over what it has; the vault ignores gaps its way.
    expect(venueKeys({ STOCKZ_ETORO_USER_KEY: 'u' })).toEqual({ etoro: { userKey: 'u' } })

    // Nothing configured is an empty bag, not an error.
    expect(venueKeys({})).toEqual({})
    // The env map names both venues and only real fields.
    expect(Object.keys(VENUE_ENV)).toEqual(['okx', 'etoro'])
  })
})
