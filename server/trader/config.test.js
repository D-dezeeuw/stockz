import { describe, it, expect } from 'vitest'
import {
  traderConfig,
  parseSymbols,
  positiveNumber,
  DEFAULT_SYMBOLS,
  DEFAULT_SIZE,
} from './config.js'

describe('positiveNumber', () => {
  it('keeps a configured zero rather than treating it as absent', () => {
    expect(positiveNumber('0.5', 9)).toBe(0.5)
    expect(positiveNumber(2, 9)).toBe(9 - 7)

    // A configured 0 is a real instruction ("no exposure") for a cap. `|| fallback` would
    // silently replace it, which is how a limit somebody set stops applying.
    expect(positiveNumber('0', 9)).toBe(0)

    expect(positiveNumber(undefined, 9)).toBe(9)
    expect(positiveNumber('abc', 9)).toBe(9)
    expect(positiveNumber('-1', 9)).toBe(9)
  })
})

describe('parseSymbols', () => {
  it('reads a comma list and never yields an empty universe', () => {
    expect(parseSymbols('btc-usdt,eth-usdt')).toEqual(['BTC-USDT', 'ETH-USDT'])
    expect(parseSymbols(' BTC-USDT , , SOL-USDT ')).toEqual(['BTC-USDT', 'SOL-USDT'])

    // A trader with no symbols would run, connect, and do nothing — which looks exactly
    // like a broken loop. The default is the deepest book on the venue.
    expect(parseSymbols('')).toEqual([...DEFAULT_SYMBOLS])
    expect(parseSymbols(undefined)).toEqual([...DEFAULT_SYMBOLS])
  })
})

describe('traderConfig', () => {
  it('is off and on paper unless explicitly told otherwise', () => {
    // The whole safety story: a pulled image must not start trading because a default
    // changed, and enabling the loop must not by itself enable spending money.
    const bare = traderConfig({})
    expect(bare.enabled).toBe(false)
    expect(bare.live).toBe(false)
    expect(bare.hasKeys).toBe(false)
    expect(bare.size).toBe(DEFAULT_SIZE)
    expect(bare.eea).toBe(true)

    const on = traderConfig({
      STOCKZ_TRADER: 'on',
      STOCKZ_TRADER_MODE: 'live',
      STOCKZ_TRADER_SYMBOLS: 'BTC-USDT,ETH-USDT',
      STOCKZ_TRADER_SIZE: '0.01',
      STOCKZ_TRADER_MAX_PER_MIN: '30',
      STOCKZ_OKX_API_KEY: 'ak',
      STOCKZ_OKX_SECRET_KEY: 'sk',
      STOCKZ_OKX_PASSPHRASE: 'pp',
      STOCKZ_OKX_DEMO: 'true',
    })
    expect(on.enabled).toBe(true)
    expect(on.live).toBe(true)
    expect(on.symbols).toEqual(['BTC-USDT', 'ETH-USDT'])
    expect(on.size).toBe(0.01)
    expect(on.maxPerMin).toBe(30)
    expect(on.demo).toBe(true)
    expect(on.hasKeys).toBe(true)

    // The trades-per-hour dial. Absent means the strategies exactly as shipped, and it is
    // clamped at 1 so a typo cannot ask for a threshold below what a schema allows.
    expect(bare.sensitivity).toBe(0)
    expect(traderConfig({ STOCKZ_TRADER_SENSITIVITY: '0.8' }).sensitivity).toBe(0.8)
    expect(traderConfig({ STOCKZ_TRADER_SENSITIVITY: '5' }).sensitivity).toBe(1)
    expect(traderConfig({ STOCKZ_TRADER_SENSITIVITY: 'hot' }).sensitivity).toBe(0)

    // The loss-streak bench, in minutes on the outside and ms on the inside.
    expect(bare.cooldownAfter).toBe(3)
    expect(bare.cooldownMs).toBe(600_000)
    expect(traderConfig({ STOCKZ_TRADER_COOLDOWN_MINUTES: '2' }).cooldownMs).toBe(120_000)
    // Zero minutes is a real instruction — never bench — not a missing value.
    expect(traderConfig({ STOCKZ_TRADER_COOLDOWN_MINUTES: '0' }).cooldownMs).toBe(0)
    // But a streak of zero is meaningless: every scratch would bench the instrument.
    expect(traderConfig({ STOCKZ_TRADER_COOLDOWN_AFTER: '0' }).cooldownAfter).toBe(1)

    // Enabled with only a partial credential set is not "has keys" — the loop must refuse
    // to start rather than fail on its first signed call.
    expect(traderConfig({ STOCKZ_TRADER: 'on', STOCKZ_OKX_API_KEY: 'ak' }).hasKeys).toBe(false)

    // Anything but the exact words is off / paper.
    expect(traderConfig({ STOCKZ_TRADER: 'yes' }).enabled).toBe(false)
    expect(traderConfig({ STOCKZ_TRADER_MODE: 'LIVE' }).live).toBe(true)
    expect(traderConfig({ STOCKZ_TRADER_MODE: 'real' }).live).toBe(false)
  })
})
