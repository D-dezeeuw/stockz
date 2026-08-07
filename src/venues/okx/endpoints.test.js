import { describe, it, expect } from 'vitest'
import { OKX_ENDPOINTS } from './endpoints.js'

describe('OKX_ENDPOINTS', () => {
  it('is the one home of every OKX path, frozen, and free of hosts and prefixes', () => {
    // OKX signs the path, and the rate-limit budget is keyed by it — so the map that both
    // read from must be immutable and must contain paths alone. A host or proxy prefix in
    // here would be signed into the hash and never arrive at the venue's router.
    expect(Object.isFrozen(OKX_ENDPOINTS)).toBe(true)

    for (const path of Object.values(OKX_ENDPOINTS)) {
      expect(path).toMatch(/^\/api\/v5\//)
      expect(path).not.toMatch(/okx\.com|^\/okx/)
      // Bare paths, no queries: callers own their query strings (tickers appends its
      // instType), and a query baked in here would be signed twice by accident.
      expect(path).not.toContain('?')
    }

    // The two the boot sequence depends on by name.
    expect(OKX_ENDPOINTS.config).toBe('/api/v5/account/config')
    expect(OKX_ENDPOINTS.time).toBe('/api/v5/public/time')
  })
})
