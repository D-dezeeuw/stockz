import { describe, it, expect } from 'vitest'
import pkg from '../../package.json'
import { appVersion, APP_VERSION } from './version.js'

describe('appVersion', () => {
  it('returns a semver string that still matches package.json', () => {
    expect(appVersion()).toMatch(/^\d+\.\d+\.\d+(-[\w.]+)?$/)
    // The constant is hand-declared so the browser can load this module unbundled;
    // this guards it against drifting from the manifest.
    expect(appVersion()).toBe(pkg.version)
    expect(appVersion()).toBe(APP_VERSION)
  })
})
