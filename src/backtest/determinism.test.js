import { describe, it, expect } from 'vitest'
import {
  DEFAULT_SEED,
  createSeededRng,
  roundToTick,
  sumMoney,
  canonicalJson,
  hashRunResult,
  verifyDeterminism,
  checkDeterminism,
} from './determinism.js'
import { driveBacktest } from './harness.js'
import { findBacktestStrategy } from './strategies.js'
import fixture from './fixture.json'

const RESULT = {
  fills: [{ side: 'buy', price: 100, size: 1, ts: 1 }],
  signals: [{ side: 'buy', price: 100, ts: 1 }],
  played: 12,
  unfilled: 0,
}

describe('createSeededRng', () => {
  it('replays the same sequence for the same seed and diverges for another', () => {
    const a = createSeededRng(42)
    const b = createSeededRng(42)
    const first = [a(), a(), a()]

    expect(first).toEqual([b(), b(), b()])
    for (const draw of first) {
      expect(draw).toBeGreaterThanOrEqual(0)
      expect(draw).toBeLessThan(1)
    }

    // A different seed is a different sequence, or the seed is decoration.
    expect(createSeededRng(43)()).not.toBe(first[0])

    // Coerced into a uint32 rather than trusted: a float or a negative seed would shift the
    // state into a different sequence on different engines.
    expect(createSeededRng(7.9)()).toBe(createSeededRng(7)())
    expect(createSeededRng(0)()).toBe(createSeededRng(1)())
    expect(createSeededRng()()).toBe(createSeededRng(DEFAULT_SEED)())
  })
})

describe('roundToTick', () => {
  it('snaps to the grid and settles the float error the multiply leaves behind', () => {
    expect(roundToTick(100.037, 0.01)).toBe(100.04)
    expect(roundToTick(100.034, 0.01)).toBe(100.03)
    expect(roundToTick(1234.5, 0.5)).toBe(1234.5)

    // 0.1 * 3 is 0.30000000000000004, and two runs accumulating that in a different order
    // hash differently for identical trades.
    expect(roundToTick(0.30000000000000004, 0.1)).toBe(0.3)

    // No tick is not "no rounding at all": a raw double still gets settled.
    expect(roundToTick(1 / 3, 0)).toBe(0.33333333)
    expect(roundToTick('nonsense', 0.01)).toBe(0)
  })
})

describe('sumMoney', () => {
  it('adds as integers so the order of the fills cannot change the total', () => {
    expect(sumMoney([0.1, 0.2])).toBe(0.3)
    expect(sumMoney([0.1, 0.2, 0.3])).toBe(sumMoney([0.3, 0.2, 0.1]))

    // Rounding per addition would make the total depend on arrival order, and a hash over
    // an identical run must match.
    const many = Array.from({ length: 1000 }, () => 0.001)
    expect(sumMoney(many)).toBe(1)

    expect(sumMoney([1.005, 2.005], 2)).toBe(3.01)
    expect(sumMoney(['x', null, 1])).toBe(1)
    expect(sumMoney(null)).toBe(0)
  })
})

describe('canonicalJson', () => {
  it('sorts keys at every depth and names the numbers JSON cannot hold', () => {
    // `JSON.stringify` preserves insertion order, so two runs that built the same object
    // by different routes would hash differently while being identical.
    expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }))
    expect(canonicalJson({ z: { y: 1, x: 2 } })).toBe('{"z":{"x":2,"y":1}}')
    expect(canonicalJson([{ b: 1, a: 2 }])).toBe('[{"a":2,"b":1}]')

    // Infinity and NaN both stringify to `null`, which would make them hash the same.
    expect(canonicalJson({ n: Infinity })).toBe('{"n":"#Infinity"}')
    expect(canonicalJson({ n: NaN })).toBe('{"n":"#NaN"}')
    expect(canonicalJson(null)).toBe('null')
  })
})

describe('hashRunResult', () => {
  it('digests the outcome and ignores what differs every run by construction', () => {
    const hash = hashRunResult(RESULT)

    expect(hash).toMatch(/^[0-9a-f]{8}$/)
    expect(hashRunResult({ ...RESULT })).toBe(hash)

    // `elapsedMs` differs on every run by construction — folding it in would make the
    // check impossible to pass.
    expect(hashRunResult({ ...RESULT, elapsedMs: 999 })).toBe(hash)

    // But the outcome itself does not.
    expect(hashRunResult({ ...RESULT, played: 13 })).not.toBe(hash)
    expect(hashRunResult({ ...RESULT, fills: [{ side: 'sell', price: 100, size: 1, ts: 1 }] })).not.toBe(hash)
    expect(hashRunResult(null)).toMatch(/^[0-9a-f]{8}$/)
  })
})

describe('verifyDeterminism', () => {
  it('runs twice and compares one string, with no tolerance to argue about', async () => {
    const stable = async () => ({ ...RESULT, elapsedMs: Math.round(Math.random() * 100) })
    expect(await verifyDeterminism({ seed: 7 }, { run: stable })).toMatchObject({
      ok: true,
      deterministic: true,
      seed: 7,
      reason: '',
    })

    // A sim with unseeded randomness fails visibly rather than "close enough".
    let n = 0
    const drifting = async () => ({ ...RESULT, played: (n += 1) })
    const bad = await verifyDeterminism({}, { run: drifting })
    expect(bad.deterministic).toBe(false)
    expect(bad.reason).toContain('hashes differ')
    expect(bad.hashes[0]).not.toBe(bad.hashes[1])

    expect(await verifyDeterminism({}, {})).toMatchObject({ ok: false, reason: 'no runner' })
    expect(await verifyDeterminism({}, { run: async () => null })).toMatchObject({ reason: 'a run failed' })
  })
})

describe('checkDeterminism', () => {
  it('publishes the verdict it produced', async () => {
    const published = []
    const verdict = await checkDeterminism(null, {
      run: async () => RESULT,
      publish: (v) => published.push(v),
    })

    expect(verdict.deterministic).toBe(true)
    expect(published).toEqual([verdict])
    expect((await checkDeterminism(null, {})).ok).toBe(false)
  })
})

describe('the committed fixture', () => {
  it('produces the same fills twice, and a hash that must not change silently', () => {
    const run = () =>
      driveBacktest({
        ticks: fixture.ticks,
        strategy: findBacktestStrategy('momentum-burst'),
        instrument: fixture.instrument,
        fillConfig: { jitter: 0.5, latencyMs: 200, tickSize: 0.01 },
        seed: 1234,
        now: () => 0,
      })

    const a = run()
    const b = run()

    // The jitter is real — the config asks for 50% — and the two runs still agree, which is
    // only possible because every draw came from the seeded generator.
    expect(hashRunResult(a)).toBe(hashRunResult(b))
    expect(a.seed).toBe(1234)
    // The fixture is long enough to actually fill, or the agreement above would be two
    // empty runs agreeing about nothing.
    expect(a.fills).toHaveLength(1)
    expect(a.fills[0].slippageBps).not.toBe(1)

    // A different seed moves the fills, or the seed is not reaching the fill model.
    const other = driveBacktest({
      ticks: fixture.ticks,
      strategy: findBacktestStrategy('momentum-burst'),
      instrument: fixture.instrument,
      fillConfig: { jitter: 0.5, latencyMs: 200, tickSize: 0.01 },
      seed: 4321,
      now: () => 0,
    })
    expect(hashRunResult(other)).not.toBe(hashRunResult(a))

    // The fixture is committed so this pipeline has one outcome that cannot change
    // silently: if this number moves, something in the fill model moved with it.
    expect(hashRunResult(a)).toBe('eaca108e')
  })
})
