import { describe, it, expect } from 'vitest'
import { BUILD_SHA, BUILD_AT, buildStamp } from './build.js'

describe('buildStamp', () => {
  it('reads as a fingerprint at a glance, and never renders empty', () => {
    expect(buildStamp('a1b2c3d', '2026-08-04T18:31')).toBe('a1b2c3d · 2026-08-04 18:31')

    // Space rather than the ISO 'T', and no seconds: this is read to answer "is this the
    // one I just pushed", and a full ISO string makes that a parsing exercise.
    expect(buildStamp('a1b2c3d', '2026-08-04T18:31:07Z')).toBe('a1b2c3d · 2026-08-04 18:31')

    // An unstamped tree is 'dev', never a blank where a version should be — a footer that
    // renders nothing is indistinguishable from one that failed to bind.
    expect(buildStamp('', '')).toBe('dev')
    expect(buildStamp(null, null)).toBe('dev')
    expect(buildStamp('a1b2c3d', '')).toBe('a1b2c3d')

    // The constants exist and are what the deploy script rewrites.
    expect(typeof BUILD_SHA).toBe('string')
    expect(typeof BUILD_AT).toBe('string')
    expect(buildStamp().length).toBeGreaterThan(0)
  })
})
