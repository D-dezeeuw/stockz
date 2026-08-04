import { describe, it, expect } from 'vitest'
import {
  rollingMean,
  ewma,
  percentile,
  ratePerMinute,
  formatMs,
  formatBps,
  formatCompact,
  gradeLatency,
} from './metrics.js'

describe('rollingMean', () => {
  it('averages the samples it has and says nothing when it has none', () => {
    expect(rollingMean([10, 20, 30])).toBe(20)
    expect(rollingMean([5])).toBe(5)

    // Junk samples are excluded rather than poisoning the average.
    expect(rollingMean([10, NaN, 20])).toBe(15)
    expect(rollingMean([])).toBe(0)
    expect(rollingMean(null)).toBe(0)
  })
})

describe('ewma', () => {
  it('seeds on the first sample rather than crawling out of zero', () => {
    // A HUD that spends ten seconds climbing is one that gets ignored for ten seconds.
    expect(ewma(undefined, 100)).toBe(100)

    expect(ewma(100, 200, 0.5)).toBe(150)
    expect(ewma(150, 200, 0.5)).toBe(175)

    expect(ewma(100, NaN)).toBe(100)
    expect(ewma(100, 200, 0)).toBe(100)
    expect(ewma(100, 200, 1)).toBe(200)
  })
})

describe('percentile', () => {
  it('reports a number that actually happened, which interpolation would not', () => {
    const samples = [10, 20, 30, 40, 100]

    expect(percentile(samples, 0.5)).toBe(30)
    expect(percentile(samples, 0.95)).toBe(100)
    expect(percentile(samples, 0)).toBe(10)

    // With a handful of samples an interpolated p95 reports a value never observed.
    expect(samples).toContain(percentile(samples, 0.8))

    expect(percentile([], 0.5)).toBe(0)
    expect(percentile(null, 0.5)).toBe(0)
  })
})

describe('ratePerMinute', () => {
  it('counts only the window, so a quiet minute reads as quiet', () => {
    const now = 100000
    const events = [99000, 50000, 30000, 1]

    // Two of the four fall inside the last minute (cutoff 40000); the older two do not.
    expect(ratePerMinute(events, now)).toBe(2)

    // A shorter window is a faster read: one event in the last second is 60 a minute.
    expect(ratePerMinute([99500], now, 1000)).toBe(60)

    expect(ratePerMinute([], now)).toBe(0)
    expect(ratePerMinute(events, NaN)).toBe(0)
  })
})

describe('formatMs', () => {
  it('keeps the tile a fixed width, which is what stops the row jumping', () => {
    expect(formatMs(84)).toBe('84ms')
    expect(formatMs(84.6)).toBe('85ms')

    // Past a second the precision stops mattering and the width starts to.
    expect(formatMs(1240)).toBe('1.2s')

    expect(formatMs(-1)).toBe('—')
    expect(formatMs(NaN)).toBe('—')
  })
})

describe('formatBps', () => {
  it('prints spread in the unit a scalper compares against their edge', () => {
    expect(formatBps(2.44)).toBe('2.4bp')
    expect(formatBps(0)).toBe('0.0bp')
    expect(formatBps(NaN)).toBe('—')
  })
})

describe('formatCompact', () => {
  it('shortens the big numbers and keeps a decimal on the small ones', () => {
    expect(formatCompact(1234)).toBe('1.2K')
    expect(formatCompact(2500000)).toBe('2.5M')
    expect(formatCompact(120)).toBe('120')
    expect(formatCompact(4.25)).toBe('4.3')
    expect(formatCompact(NaN)).toBe('—')
  })
})

describe('gradeLatency', () => {
  it('answers the question the tile is actually asked, in three states', () => {
    // "Can I trust the fast path right now" has three answers, not a spectrum.
    expect(gradeLatency(80)).toBe('good')
    expect(gradeLatency(200)).toBe('warn')
    expect(gradeLatency(900)).toBe('bad')

    expect(gradeLatency(120)).toBe('good')
    expect(gradeLatency(400)).toBe('warn')

    expect(gradeLatency(50, { good: 20, bad: 40 })).toBe('bad')
    // Nothing measured yet is a warning, not a clean bill of health.
    expect(gradeLatency(NaN)).toBe('warn')
  })
})
