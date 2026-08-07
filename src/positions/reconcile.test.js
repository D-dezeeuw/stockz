import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  diffPositions,
  adoptVenueTruth,
  reconcile,
  resetReconciler,
  startReconciler,
  DRIFT_EPSILON,
} from './reconcile.js'
import { ingestFill, openPositions, resetPositions } from './store.js'
import { appState, tick, setValue, resetState } from '../app/engine.js'
import { PATHS } from '../state/paths.js'

beforeEach(() => {
  resetReconciler()
  resetPositions()
  resetState()
  // The poller is gated on the key preflight's verdict; these tests are about the diffing,
  // so they run with the keys already verified. The gate has its own assertion below.
  setValue(PATHS.ui.keyCheck, { ok: true, code: '0', reason: 'OKX keys accepted', fix: '' })
  tick()
})

describe('diffPositions', () => {
  it('separates drift from positions that should not exist at all', () => {
    const local = [
      { venue: 'okx', instrument: 'BTC-USDT', qty: 2 },
      { venue: 'okx', instrument: 'ETH-USDT', qty: 1 },
      { venue: 'etoro', instrument: 'AAPL', qty: 5 },
    ]
    const remote = [
      { instrument: 'BTC-USDT', qty: 3 },
      { instrument: 'SOL-USDT', qty: 4 },
    ]

    const diff = diffPositions(local, remote, 'okx')

    expect(diff.drifted).toEqual([
      { key: 'okx:BTC-USDT', local: 2, remote: 3, instrument: 'BTC-USDT' },
    ])
    // A position the venue never heard of is usually a fill booked from an order that
    // was later rejected.
    expect(diff.missingRemote).toEqual([{ key: 'okx:ETH-USDT', local: 1, remote: 0 }])
    // The dangerous direction: the venue holds something nothing here is protecting.
    expect(diff.missingLocal).toEqual([{ key: 'okx:SOL-USDT', local: 0, remote: 4 }])

    // Another venue's positions are not this venue's business.
    expect(diff.missingRemote.some((r) => r.key.startsWith('etoro'))).toBe(false)

    // Venues name these fields differently — OKX sends `instId` and `pos`, the mapped
    // shape sends `instrument` and `qty` — and reconciliation must read either without
    // reporting the whole book as missing.
    const okxShaped = diffPositions(
      [{ venue: 'okx', instrument: 'BTC-USDT', qty: 2 }],
      [{ instId: 'BTC-USDT', pos: 3 }],
      'okx',
    )
    expect(okxShaped.drifted[0]).toMatchObject({ local: 2, remote: 3 })
    expect(okxShaped.missingRemote).toEqual([])

    expect(
      diffPositions([], [{ symbol: 'ETH-USDT', qty: 1 }], 'okx').missingLocal[0],
    ).toMatchObject({ key: 'okx:ETH-USDT', remote: 1 })

    // Float residue is not drift.
    const noise = diffPositions(
      [{ venue: 'okx', instrument: 'BTC-USDT', qty: 2 }],
      [{ instrument: 'BTC-USDT', qty: 2 + DRIFT_EPSILON / 2 }],
      'okx',
    )
    expect(noise.drifted).toEqual([])
  })
})

describe('adoptVenueTruth', () => {
  it('replaces the local number outright rather than meeting it halfway', () => {
    ingestFill({ venue: 'okx', instrument: 'BTC-USDT', side: 'buy', qty: 2, px: 100 })

    const remote = [{ instrument: 'BTC-USDT', qty: 3, avgPx: 105 }]
    const diff = diffPositions(openPositions(), remote, 'okx')

    // Averaging the two, or waiting to see whether it settles, leaves the desk sizing
    // against a number it invented.
    expect(adoptVenueTruth(diff, remote, 'okx')).toBe(1)
    expect(openPositions()[0]).toMatchObject({ qty: 3, avgPx: 105 })

    // Entry price is read from either name the venues use.
    const alt = [{ instId: 'BTC-USDT', pos: 4, avgEntry: 99 }]
    adoptVenueTruth(diffPositions(openPositions(), alt, 'okx'), alt, 'okx')
    expect(openPositions()[0]).toMatchObject({ qty: 4, avgPx: 99 })

    // A position the venue does not have goes to zero, which prunes it.
    const gone = diffPositions(openPositions(), [], 'okx')
    adoptVenueTruth(gone, [], 'okx')
    expect(openPositions()).toEqual([])

    expect(adoptVenueTruth(null, [], 'okx')).toBe(0)
  })
})

describe('reconcile', () => {
  it('adopts the venue and does nothing at all when it cannot ask', async () => {
    ingestFill({ venue: 'okx', instrument: 'BTC-USDT', side: 'buy', qty: 2, px: 100 })

    // Until the preflight's verdict is green, a signed snapshot can only repeat the
    // refusal — and at boot it raced the key probe, spraying 401s from an aim still being
    // corrected. Skipped silently: the preflight owns explaining key failures.
    const untouched = vi.fn()
    const gated = await reconcile({ fetch: untouched, now: () => 500, ready: () => false })
    expect(gated).toEqual({ ok: false, corrected: 0, reason: 'keys not verified yet' })
    expect(untouched).not.toHaveBeenCalled()

    const result = await reconcile({
      fetch: async () => ({ ok: true, positions: [{ instrument: 'BTC-USDT', qty: 5, avgPx: 100 }] }),
      now: () => 1000,
    })
    tick()

    expect(result).toEqual({ ok: true, corrected: 1, reason: '' })
    expect(openPositions()[0].qty).toBe(5)
    expect(appState.ui.toasts.at(-1).message).toContain('position drift')

    // Treating "I could not ask" as "there is nothing there" would flatten the book on
    // every network hiccup. The venue's own reason is carried out and said once — staying
    // silent is how a valid key with a skewed clock produced nothing but raw 401s in the
    // console and no explanation anywhere on screen.
    const failed = await reconcile({
      fetch: async () => ({ ok: false, error: 'OKX rejected the timestamp' }),
      now: () => 2000,
    })
    tick()
    expect(failed).toMatchObject({ ok: false, corrected: 0, reason: 'OKX rejected the timestamp' })
    expect(openPositions()[0].qty).toBe(5)
    expect(appState.ui.toasts.some((t) => t.message.includes('OKX rejected the timestamp'))).toBe(true)

    // And said *once*: this polls every thirty seconds, so a repeat would bury the desk.
    const before = appState.ui.toasts.length
    await reconcile({ fetch: async () => ({ ok: false, error: 'OKX rejected the timestamp' }), now: () => 2001 })
    tick()
    expect(appState.ui.toasts).toHaveLength(before)

    const threw = await reconcile({
      fetch: async () => {
        throw new Error('offline')
      },
      now: () => 3000,
    })
    expect(threw.reason).toBe('Error: offline')

    // Agreement is silent: no toast for a book that was already right. Counted after a
    // flush, because `setValue` lands next tick and the offline toast is still pending.
    tick()
    const toasts = appState.ui.toasts.length
    await reconcile({
      fetch: async () => ({ ok: true, positions: [{ instrument: 'BTC-USDT', qty: 5, avgPx: 100 }] }),
    })
    tick()
    expect(appState.ui.toasts).toHaveLength(toasts)
  })
})

describe('startReconciler', () => {
  it('checks often enough to catch drift inside a scalp\'s lifetime', () => {
    const scheduled = []
    const stop = startReconciler({
      everyMs: 30000,
      timer: {
        setInterval: (fn, ms) => {
          scheduled.push([fn, ms])
          return 1
        },
        clearInterval: () => scheduled.splice(0, scheduled.length),
      },
      run: () => scheduled.push(['ran']),
    })

    expect(scheduled[0][1]).toBe(30000)
    scheduled[0][0]()
    expect(scheduled.at(-1)).toEqual(['ran'])

    stop()
    expect(scheduled).toEqual([])

    // A floor on the interval: a one-millisecond reconciler would spend the rate limit
    // on asking rather than on trading.
    const fast = []
    startReconciler({
      everyMs: 1,
      timer: { setInterval: (fn, ms) => fast.push(ms), clearInterval: () => {} },
    })
    expect(fast[0]).toBe(1000)

    expect(() => startReconciler({ timer: null })()).not.toThrow()
  })
})
