import { describe, it, expect } from 'vitest'
import { appVersion } from './version.js'

describe('appVersion', () => {
  it('returns the package manifest version as a semver string', () => {
    expect(appVersion()).toMatch(/^\d+\.\d+\.\d+(-[\w.]+)?$/)
  })
})
