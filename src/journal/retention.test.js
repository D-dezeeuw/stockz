import { describe, it, expect, beforeEach } from 'vitest'
import {
  DEFAULT_POLICY,
  retentionPolicy,
  pruneTrades,
  pruneTicks,
  pruneCheckpoints,
  archiveBeforePrune,
  storageUsage,
  runRetention,
  scheduleRetention,
  registerRetentionActions,
} from './retention.js'
import { ACTIONS } from '../actions/names.js'
import { clearActions } from '../actions/registry.js'
import { appState, tick, setValue, resetState } from '../app/engine.js'
import { PATHS } from '../state/paths.js'

const DAY = 86400000
const NOW = 100 * DAY

const TRADES = [
  { id: 'old', closeTs: NOW - 200 * DAY, net: 1, pnl: 1, fees: 0 },
  { id: 'mid', closeTs: NOW - 10 * DAY, net: 2, pnl: 2, fees: 0 },
  { id: 'new', closeTs: NOW - DAY, net: 3, pnl: 3, fees: 0 },
]

beforeEach(() => {
  resetState()
  clearActions()
})

describe('retentionPolicy', () => {
  it('treats zero as "keep everything", like every other limit on this desk', () => {
    expect(retentionPolicy({})).toEqual(DEFAULT_POLICY)
    expect(retentionPolicy({ maxDays: 30 }).maxDays).toBe(30)

    // A zero meaning "keep nothing" would delete a trader's history the first time they
    // cleared a box to see what happened.
    expect(retentionPolicy({ maxDays: 0 }).maxDays).toBe(0)
    expect(retentionPolicy({ maxTrades: -5 }).maxTrades).toBe(DEFAULT_POLICY.maxTrades)
  })
})

describe('pruneTrades', () => {
  it('drops by age before count, because recency is what makes an entry useful', () => {
    const byAge = pruneTrades(TRADES, { maxDays: 90, maxTrades: 0 }, NOW)
    expect(byAge.kept.map((trade) => trade.id)).toEqual(['mid', 'new'])
    expect(byAge.pruned.map((trade) => trade.id)).toEqual(['old'])

    // Count applies to what survived the window, so a thousand ancient trades can never
    // crowd out last week's.
    const byCount = pruneTrades(TRADES, { maxDays: 0, maxTrades: 1 }, NOW)
    expect(byCount.kept.map((trade) => trade.id)).toEqual(['new'])

    expect(pruneTrades(TRADES, { maxDays: 0, maxTrades: 0 }, NOW).pruned).toEqual([])
    expect(pruneTrades(null).kept).toEqual([])
  })
})

describe('pruneTicks', () => {
  it('drops a trail nobody has traded since the window opened', () => {
    const ring = (marks) => ({ toArray: () => marks })
    const trails = new Map([
      ['BTC-USDT', ring([{ ts: NOW - DAY }])],
      ['DEAD-USDT', ring([{ ts: NOW - 200 * DAY }])],
      ['EMPTY', ring([])],
    ])

    expect(pruneTicks(trails, { maxDays: 90 }, NOW)).toBe(2)
    expect([...trails.keys()]).toEqual(['BTC-USDT'])

    // Zero keeps everything.
    expect(pruneTicks(trails, { maxDays: 0 }, NOW)).toBe(0)
    expect(pruneTicks(null, { maxDays: 90 }, NOW)).toBe(0)
  })
})

describe('pruneCheckpoints', () => {
  it('drops the oldest, since a snapshot from March restores a desk that no longer exists', () => {
    const pins = [{ tradeId: 'a' }, { tradeId: 'b' }, { tradeId: 'c' }]

    expect(pruneCheckpoints(pins, { maxCheckpoints: 2 })).toEqual({
      kept: [{ tradeId: 'b' }, { tradeId: 'c' }],
      dropped: 1,
    })

    expect(pruneCheckpoints(pins, { maxCheckpoints: 0 }).dropped).toBe(0)
    expect(pruneCheckpoints(null, { maxCheckpoints: 2 }).kept).toEqual([])
  })
})

describe('archiveBeforePrune', () => {
  it('offers the file rather than asking, because a dialog lands mid-trade', () => {
    const written = []

    expect(archiveBeforePrune(TRADES, { now: 0, download: (file) => written.push(file) })).toBe(true)
    expect(written[0].name).toBe('stockz-archive-3.csv')
    expect(written[0].text).toContain('old')

    // Nothing to lose, nothing offered.
    expect(archiveBeforePrune([], {})).toBe(false)
  })
})

describe('storageUsage', () => {
  it('reads zero rather than throwing when the browser declines to answer', async () => {
    const usage = await storageUsage({ estimate: async () => ({ usage: 50, quota: 200 }) })
    tick()

    // The label is built here because Spektrum expressions do not carry `Math`, and a
    // binding that silently evaluates to nothing is the worst kind of broken.
    expect(usage).toEqual({ used: 50, quota: 200, pct: 0.25, label: '25%' })
    expect(appState.journal.storage.pct).toBe(0.25)

    // No browser should be able to break the journal by declining a readout.
    expect(
      await storageUsage({
        estimate: async () => {
          throw new Error('blocked')
        },
      }),
    ).toEqual({ used: 0, quota: 0, pct: 0, label: '—' })
    // No storage API at all reports "did not say" rather than "nothing used" — 0% would be
    // a readout claiming a fact nobody supplied.
    expect(await storageUsage(null)).toEqual({ used: 0, quota: 0, pct: 0, label: '—' })
  })
})

describe('runRetention', () => {
  it('archives what it is about to delete', () => {
    const archived = []

    const result = runRetention({
      now: NOW,
      trades: TRADES,
      pins: [{ tradeId: 'a' }, { tradeId: 'b' }],
      policy: { maxDays: 90, maxTrades: 0, maxCheckpoints: 1 },
      archive: (pruned) => archived.push(...pruned),
    })
    tick()

    expect(result).toEqual({ trades: 1, pins: 1, kept: 2 })
    // A trader who set a window and then lost the one trade they wanted to show somebody has
    // been failed by the feature, not served by it.
    expect(archived.map((trade) => trade.id)).toEqual(['old'])
    expect(appState.journal.pruned).toMatchObject({ trades: 1, pins: 1, at: NOW })
  })
})

describe('scheduleRetention', () => {
  it('waits for idle rather than firing mid-session', () => {
    const queued = []
    const ran = []

    expect(scheduleRetention({ idle: (fn) => queued.push(fn), run: () => ran.push(1) })).toBe(true)
    // Cleanup competing with a live order book for a frame costs the trader money to save
    // disk nobody was short of.
    expect(ran).toEqual([])
    queued[0]()
    expect(ran).toEqual([1])

    expect(scheduleRetention({ idle: null })).toBe(true)
  })
})

describe('registerRetentionActions', () => {
  it('binds a manual prune', () => {
    setValue(PATHS.journal.pruned, null)
    tick()

    expect(registerRetentionActions()).toBe(ACTIONS.journal.prune)
  })
})
