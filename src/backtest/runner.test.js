// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  BACKTEST_STATE,
  progressPercent,
  backtestSummary,
  backtestRecordingOptions,
  fillConfigFromSettings,
  publishBacktest,
  backtestRunId,
  spawnBacktestWorker,
  runBacktest,
  cancelBacktest,
  setBacktestConfig,
  startBacktest,
  activeBacktest,
  resetBacktestRunner,
  registerBacktestActions,
} from './runner.js'
import { appState, setValue, tick, resetState } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { clearActions, actionNames } from '../actions/registry.js'
import { seedBlocks } from '../blocks/seed.js'

const TICKS = [
  { symbol: 'BTC-USDT', px: 100, ts: 1000 },
  { symbol: 'BTC-USDT', px: 130, ts: 1001 },
  { symbol: 'BTC-USDT', px: 90, ts: 1002 },
]

/** A database double shaped like the two stores `recordings.js` reads. */
function fakeDb() {
  return {
    transaction: (store) => ({
      objectStore: () => ({
        getAll: () => {
          const request = {}
          const rows =
            String(store) === 'sessions'
              ? [{ id: 'rec-1', label: 'quiet open' }]
              : [{ sessionId: 'rec-1', seq: 0, ticks: TICKS }]
          queueMicrotask(() => request.onsuccess?.())
          Object.defineProperty(request, 'result', { value: rows })
          return request
        },
      }),
    }),
  }
}

/** A Worker double that echoes a scripted conversation back. */
function fakeWorker(script) {
  return class {
    constructor() {
      this.sent = []
      this.terminated = false
      script?.register?.(this)
    }
    postMessage(message) {
      this.sent.push(message)
      script?.onPost?.(this, message)
    }
    terminate() {
      this.terminated = true
    }
  }
}

beforeEach(() => {
  resetState()
  resetBacktestRunner()
  clearActions()
  seedBlocks(true)
  tick()
})

describe('progressPercent', () => {
  it('floors into 0..100 and calls an empty run finished', () => {
    expect(progressPercent(0, 200)).toBe(0)
    expect(progressPercent(1, 3)).toBe(33)
    expect(progressPercent(200, 200)).toBe(100)

    // Over-reporting is clamped rather than shown: a bar past its own end is a bug the
    // trader cannot act on.
    expect(progressPercent(500, 200)).toBe(100)
    expect(progressPercent(-5, 200)).toBe(0)

    // A run with no ticks is done, not stuck at zero — a bar frozen at 0% looks exactly
    // like a hung worker.
    expect(progressPercent(0, 0)).toBe(100)
    expect(progressPercent(null, null)).toBe(100)
  })
})

describe('backtestSummary', () => {
  it('reads a finished run, and reads as idle when there is none', () => {
    const summary = backtestSummary({
      strategyId: 'momentum-burst',
      instrument: 'BTC-USDT',
      played: 3,
      errors: 1,
      elapsedMs: 12,
      signals: [{ side: 'buy' }, { side: 'buy' }, { side: 'sell' }],
      fills: [{ side: 'buy', fee: 0.25 }, { side: 'sell', fee: 0.25 }],
      unfilled: 1,
      fillConfig: { latencyMs: 40, slippageBps: 1, orderType: 'market' },
    })

    // Split by side, because a strategy that only ever emitted buys is broken and the
    // total alone hides it completely.
    expect(summary).toEqual({
      ran: true,
      strategyId: 'momentum-burst',
      instrument: 'BTC-USDT',
      signals: 3,
      buys: 2,
      sells: 1,
      // Fills beside signals, never instead of them: a strategy that signalled three
      // times and filled twice did not trade three times.
      fills: 2,
      unfilled: 1,
      fees: 0.5,
      played: 3,
      errors: 1,
      elapsed: '12ms',
      assumptions: '40ms · 1bp · market',
    })

    // Always shaped: a template cannot read through a null result, and a block that
    // renders nothing until the first run looks broken rather than idle.
    expect(backtestSummary(null)).toEqual({
      ran: false,
      strategyId: '',
      instrument: 'all',
      signals: 0,
      buys: 0,
      sells: 0,
      fills: 0,
      unfilled: 0,
      fees: 0,
      played: 0,
      errors: 0,
      elapsed: '—',
      assumptions: '—',
    })
  })
})

describe('backtestRecordingOptions', () => {
  it('puts a placeholder row in front, and says so when there is nothing to pick', () => {
    expect(backtestRecordingOptions([{ id: 'rec-1', label: 'quiet open' }, { id: 'rec-2' }])).toEqual([
      { id: '', name: 'pick a recording…' },
      { id: 'rec-1', name: 'quiet open' },
      { id: 'rec-2', name: 'rec-2' },
    ])

    // The placeholder is a row rather than a literal option because `data-each` binds the
    // container and repeats its first child — a select cannot hold both.
    expect(backtestRecordingOptions([])).toEqual([{ id: '', name: 'no recordings yet' }])
    expect(backtestRecordingOptions(null)).toEqual([{ id: '', name: 'no recordings yet' }])
  })
})

describe('fillConfigFromSettings', () => {
  it('reads the assumptions off the drawer so a run and the screen cannot disagree', () => {
    // Nothing set yet is the defaults, not an empty config the fill functions would
    // divide by.
    expect(fillConfigFromSettings({})).toMatchObject({
      spreadBps: 2,
      latencyMs: 40,
      slippageBps: 1,
      orderType: 'market',
      venue: 'okx',
    })

    expect(
      fillConfigFromSettings({
        settings: { btLatencyMs: 120, btSlippageBps: 3, btOrderType: 'limit', btVenue: 'etoro', btSize: 5 },
      }),
    ).toMatchObject({ latencyMs: 120, slippageBps: 3, orderType: 'limit', venue: 'etoro', size: 5 })
  })
})

describe('publishBacktest', () => {
  it('merges onto its own copy and derives the percentage', () => {
    publishBacktest({ running: true, runId: 'bt-1', played: 5, total: 20 })
    // Two publishes in one turn: `setValue` lands next tick, so a version that merged onto
    // appState would drop the first.
    publishBacktest({ played: 10 })
    tick()

    expect(appState.backtest.progress).toEqual({
      ...BACKTEST_STATE,
      running: true,
      runId: 'bt-1',
      played: 10,
      total: 20,
      pct: 50,
    })
  })
})

describe('backtestRunId', () => {
  it('stamps a run with a sortable id that names its strategy', () => {
    expect(backtestRunId(0, 'noop')).toBe('bt-0-noop')
    expect(backtestRunId(1785000000000, 'momentum-burst')).toBe(
      `bt-${(1785000000000).toString(36)}-momentum-burst`,
    )
    expect(backtestRunId(null, null)).toBe('bt-0-run')
  })
})

describe('spawnBacktestWorker', () => {
  it('builds a module worker where there is one, and admits it where there is not', () => {
    const Ctor = fakeWorker()
    const worker = spawnBacktestWorker({ Worker: Ctor, url: 'about:blank' })
    expect(worker).toBeInstanceOf(Ctor)

    // No Worker is a slower backtest, never a broken desk.
    expect(spawnBacktestWorker({ Worker: undefined })).toBeNull()
    expect(
      spawnBacktestWorker({
        Worker: () => {
          throw new Error('blocked by CSP')
        },
        url: 'about:blank',
      }),
    ).toBeNull()
  })
})

describe('runBacktest', () => {
  it('runs in process when there is no Worker, and publishes the result', async () => {
    const result = await runBacktest(
      { sessionId: 'rec-1', strategyId: 'momentum-burst', instrument: 'BTC-USDT' },
      { Worker: undefined, db: fakeDb(), now: () => 0 },
    )
    tick()

    expect(result).toMatchObject({ played: 3, total: 3, strategyId: 'momentum-burst' })
    expect(appState.backtest.result).toEqual(result)
    expect(appState.backtest.summary.ran).toBe(true)
    expect(appState.backtest.progress.running).toBe(false)
    expect(appState.backtest.progress.pct).toBe(100)
    expect(activeBacktest()).toBeNull()

    // An unknown strategy never starts a run at all.
    expect(await runBacktest({ sessionId: 'rec-1', strategyId: 'nope' }, { Worker: undefined })).toBeNull()

    // A recording with nothing in it is an error on screen, not a silent zero-signal run.
    const missing = await runBacktest(
      { sessionId: 'gone', strategyId: 'noop' },
      { Worker: undefined, db: null, now: () => 0 },
    )
    tick()
    expect(missing).toBeNull()
    expect(appState.backtest.error).toBe('recording has no ticks')
  })

  it('talks to a Worker when there is one', async () => {
    const Ctor = fakeWorker({
      onPost: (worker, message) => {
        if (message.type !== 'run') return
        worker.onmessage({ data: { type: 'progress', runId: message.runId, played: 1, total: 2, signals: 0 } })
        worker.onmessage({
          data: { type: 'done', runId: message.runId, result: { played: 2, signals: [{ side: 'buy' }] } },
        })
      },
    })

    const result = await runBacktest(
      { sessionId: 'rec-1', strategyId: 'noop' },
      { Worker: Ctor, url: 'about:blank', now: () => 0 },
    )
    tick()

    expect(result).toEqual({ played: 2, signals: [{ side: 'buy' }] })
    expect(appState.backtest.summary.signals).toBe(1)
  })
})

describe('cancelBacktest', () => {
  it('posts, terminates and settles the pending run', async () => {
    let worker = null
    const Ctor = fakeWorker({ register: (w) => (worker = w) })

    const pending = runBacktest(
      { sessionId: 'rec-1', strategyId: 'noop' },
      { Worker: Ctor, url: 'about:blank', now: () => 0 },
    )
    expect(activeBacktest()).not.toBeNull()

    expect(cancelBacktest()).toBe(true)
    // Posted *and* terminated: the message is for a worker sitting idle, the terminate is
    // for the far commoner case of one mid-loop that will never read it.
    expect(worker.sent.at(-1)).toMatchObject({ type: 'cancel' })
    expect(worker.terminated).toBe(true)

    // The caller's promise settles rather than hanging forever on a run that is gone.
    expect(await pending).toBeNull()
    tick()
    expect(appState.backtest.progress.running).toBe(false)

    expect(cancelBacktest()).toBe(false)
  })
})

describe('setBacktestConfig', () => {
  it('remembers one launcher field at a time and ignores anything else', () => {
    setValue(PATHS.backtest.config, { sessionId: '', strategyId: 'momentum-burst', instrument: '' })
    tick()

    expect(setBacktestConfig(null, { field: 'sessionId', value: 'rec-1' })).toEqual({
      sessionId: 'rec-1',
      strategyId: 'momentum-burst',
      instrument: '',
    })
    tick()

    expect(setBacktestConfig(null, { field: 'strategyId', value: 'noop' })).toMatchObject({
      sessionId: 'rec-1',
      strategyId: 'noop',
    })
    tick()

    // An unknown field must not grow a key the runner never reads.
    expect(setBacktestConfig(null, { field: 'evil', value: 'x' })).toEqual(appState.backtest.config)
    expect(setBacktestConfig(null)).toEqual(appState.backtest.config)
  })
})

describe('startBacktest', () => {
  it('runs whatever the launcher is pointed at', async () => {
    setValue(PATHS.backtest.config, { sessionId: 'rec-1', strategyId: 'noop', instrument: '' })
    tick()

    const result = await startBacktest(appState, { Worker: undefined, db: fakeDb(), now: () => 0 })
    expect(result).toMatchObject({ sessionId: 'rec-1', strategyId: 'noop', played: 3 })

    // The payload overrides the launcher, which is what lets a sweep reuse this path.
    const override = await startBacktest(appState, {
      strategyId: 'momentum-burst',
      Worker: undefined,
      db: fakeDb(),
      now: () => 0,
    })
    expect(override.strategyId).toBe('momentum-burst')
  })
})

describe('activeBacktest', () => {
  it('names the run in flight and nothing once it lands', async () => {
    expect(activeBacktest()).toBeNull()

    const pending = runBacktest(
      { sessionId: 'rec-1', strategyId: 'noop' },
      { Worker: undefined, db: fakeDb(), now: () => 0 },
    )
    expect(activeBacktest()).toMatchObject({ runId: 'bt-0-noop', worker: null })

    await pending
    expect(activeBacktest()).toBeNull()
  })
})

describe('resetBacktestRunner', () => {
  it('drops the runner without touching the desk', () => {
    publishBacktest({ running: true, played: 9, total: 9 })
    expect(resetBacktestRunner()).toBe(true)

    publishBacktest({})
    tick()
    expect(appState.backtest.progress).toEqual({ ...BACKTEST_STATE, pct: 100 })
  })
})

describe('registerBacktestActions', () => {
  it('registers the three actions and seeds the strategy picker', () => {
    expect(registerBacktestActions()).toEqual(['backtest.start', 'backtest.cancel', 'backtest.configure'])
    tick()

    expect(actionNames().sort()).toEqual(['backtest.cancel', 'backtest.configure', 'backtest.start'])
    // The catalog is static, so the picker's options are written once rather than
    // recomputed per render.
    expect(appState.backtest.strategies[0]).toMatchObject({ id: 'momentum-burst' })
    // The recording list is derived rather than snapshotted: it grows every time somebody
    // hits REC, and a picker written once at boot would go stale on the first recording.
    setValue(PATHS.playback.library, [{ id: 'rec-1', label: 'quiet open' }])
    tick()
    expect(appState.backtest.recordings).toEqual([
      { id: '', name: 'pick a recording…' },
      { id: 'rec-1', name: 'quiet open' },
    ])
  })
})
