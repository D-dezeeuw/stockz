import { learnInstruments } from './map.js'

/**
 * Offline EToro.
 *
 * Two things make this necessary rather than a nicety: EToro's API refuses browser
 * origins (CORS), so a plain dev session cannot reach it at all, and the desk must stay
 * developable and testable without keys. Mock mode keeps the whole pipeline exercised —
 * the same mappers, the same poller, the same blocks — with the network replaced.
 *
 * The prices move. A frozen mock teaches nothing about a UI whose entire job is
 * displaying change.
 */

/** A small, recognisable instrument set. */
export const MOCK_INSTRUMENTS = Object.freeze([
  { instrumentId: 1001, symbolFull: 'AAPL' },
  { instrumentId: 1002, symbolFull: 'TSLA' },
  { instrumentId: 1003, symbolFull: 'NVDA' },
])

/** Starting prices, roughly plausible so the layout is exercised at real magnitudes. */
const BASE = Object.freeze({ 1001: 190.2, 1002: 245.6, 1003: 121.4 })

/**
 * A deterministic pseudo-random walk.
 *
 * Seeded rather than `Math.random()` so a test can assert an exact sequence and a replay
 * reproduces it — the same reason the backtester will need determinism in phase 27.
 *
 * @param {number} seed - any integer.
 * @returns {() => number} generator returning 0..1.
 */
export function seededRandom(seed) {
  let state = Number.isFinite(seed) ? Math.floor(seed) || 1 : 1

  return () => {
    // xorshift32: tiny, fast, and good enough for a price wiggle.
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return Math.abs(state % 100000) / 100000
  }
}

/**
 * Build a quote for an instrument at a point in a walk.
 *
 * @param {number|string} instrumentId - instrument.
 * @param {number} drift - -1..1 offset from the base price.
 * @param {number} ts - epoch ms.
 * @returns {object} an EToro-shaped quote (so the real mapper handles it).
 */
export function mockQuote(instrumentId, drift, ts) {
  const base = BASE[String(instrumentId)] ?? 100
  const mid = base * (1 + drift * 0.002)
  const halfSpread = Math.max(0.01, mid * 0.0001)

  return {
    instrumentId,
    bid: (mid - halfSpread).toFixed(2),
    ask: (mid + halfSpread).toFixed(2),
    bidSize: '100',
    askSize: '100',
    date: new Date(ts).toISOString(),
    previousClose: String(base),
    volume: '10000',
  }
}

/**
 * A fetch stand-in that answers the EToro endpoints the desk calls.
 *
 * @param {{seed?: number, now?: () => number}} [options] - determinism controls.
 * @returns {Function} a fetch-compatible function.
 */
export function createMockFetch(options = {}) {
  const { seed = 42, now = () => 0 } = options
  const random = seededRandom(seed)

  return async (url) => {
    const path = String(url)

    if (path.includes('/Metadata/V1/instruments')) {
      return { ok: true, status: 200, json: async () => ({ instrumentDisplayDatas: MOCK_INSTRUMENTS }) }
    }

    if (path.includes('/Market/V1/quotes')) {
      const ids = (path.split('instrumentIds=')[1] ?? '').split(',').filter(Boolean)
      const rates = ids.map((id) => mockQuote(id, random() * 2 - 1, now()))
      return { ok: true, status: 200, json: async () => ({ rates }) }
    }

    if (path.includes('/portfolio/positions')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          positions: [{ instrumentId: 1001, isBuy: true, amount: '10', openRate: '188.40', profit: '18.2' }],
        }),
      }
    }

    return { ok: false, status: 404, json: async () => ({ message: 'not mocked' }) }
  }
}

/**
 * Prime the mappers with the mock catalogue, for tests that skip the fetch.
 *
 * @returns {number} instruments known after priming.
 */
export function primeMockInstruments() {
  return learnInstruments(MOCK_INSTRUMENTS)
}
