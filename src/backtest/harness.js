import { createStrategyContext, toSignal } from '../strategy/contract.js'
import { createSandbox, invokeStrategy } from './sandbox.js'
import {
  resolveFillConfig,
  orderFromSignal,
  applyLatency,
  simMarketFill,
  simLimitFill,
  simFees,
} from './fills.js'

/**
 * The tick driver — a recording in, a signal log out, as fast as the CPU allows.
 *
 * This is the same loop the live desk runs, minus the desk. No rendering, no `setValue`, no
 * frame budget, no rAF: ninety thousand recorded ticks that took fifteen minutes to arrive
 * are crunched in a second or two, because the only thing between two ticks here is the
 * strategy itself.
 *
 * Worker-safe by construction: everything it imports resolves through relative paths, so
 * the whole loop runs inside `worker.js` where it belongs and the trader's desk stays at
 * sixty frames while a sweep of forty parameter combos grinds behind it.
 */

/** How often a run reports progress, at most. Ten a second is smooth and near-free. */
export const PROGRESS_MS = 100

/**
 * Which way a signal points, in order terms.
 *
 * @param {object} signal - a normalised or raw signal.
 * @returns {string} 'buy', 'sell', 'flat', or '' when the strategy said nothing.
 */
export function signalSide(signal) {
  const action = String(toSignal(signal)?.action ?? '')
  // 'none' is silence and must not reach the log: a run that recorded every quiet tick
  // would produce a signal list the length of the recording and a report of nothing.
  return action === 'none' ? '' : action
}

/**
 * Append one strategy emission to the run's signal log.
 *
 * @param {object[]} log - the log so far; mutated, because this runs per tick.
 * @param {object} signal - what the hook returned.
 * @param {object} tick - the tick it was returned for.
 * @returns {object[]} the same log.
 */
export function collectSignals(log, signal, tick) {
  const list = Array.isArray(log) ? log : []
  const side = signalSide(signal)
  if (!side) return list

  const normalised = toSignal(signal)
  list.push({
    side,
    // The price and moment the signal was formed at, not the one it might fill at. What
    // a fill costs is F27.6's question, and mixing the two here would bake one set of
    // assumptions into the record every later run is scored from.
    price: Number(tick?.px) || 0,
    ts: Number(tick?.ts) || 0,
    strength: Number(normalised.strength) || 0,
    reason: String(normalised.reason ?? ''),
  })

  return list
}

/**
 * Build a progress emitter that cannot flood the caller.
 *
 * @param {(update: object) => unknown} emit - where progress goes.
 * @param {{now?: () => number, everyMs?: number}} [options] - injectable clock and rate.
 * @returns {(update: object, force?: boolean) => boolean} true when it actually emitted.
 */
export function progressReporter(emit, options = {}) {
  const send = typeof emit === 'function' ? emit : () => {}
  const now = typeof options.now === 'function' ? options.now : () => Date.now()
  const everyMs = Number(options.everyMs) > 0 ? Number(options.everyMs) : PROGRESS_MS
  let lastAt = -Infinity

  return (update, force = false) => {
    const at = now()
    // `force` exists for the final 100%: a run that finished inside one throttle window
    // would otherwise leave the bar frozen at whatever the last emission said.
    if (!force && at - lastAt < everyMs) return false

    lastAt = at
    send({ ...update, at })
    return true
  }
}

/**
 * Fill whatever has arrived by this tick, leaving the rest in flight.
 *
 * Orders in flight are checked against *every* tick, not only the one that matches their
 * arrival stamp: a recording is an irregular clock, and an order that arrives between two
 * prints must fill on the next one rather than never.
 *
 * @param {object[]} pending - orders in flight; not mutated.
 * @param {object} tick - the tick now playing.
 * @param {object} config - the resolved fill assumptions.
 * @returns {{fills: object[], pending: object[]}} what filled and what is still out.
 */
export function drainPending(pending, tick, config) {
  const queue = Array.isArray(pending) ? pending : []
  const at = Number(tick?.ts) || 0
  const fills = []
  const still = []

  for (const order of queue) {
    if (Number(order?.arrivesAt) > at) {
      still.push(order)
      continue
    }

    const fill = order?.type === 'limit' ? simLimitFill(order, tick, config) : simMarketFill(order, tick, config)
    if (!fill.filled) {
      // A market order that could not price is dead; a limit the tape has not reached yet
      // is still working, and dropping it would score a passive strategy as if it had
      // cancelled every quote it ever posted.
      if (order?.type === 'limit') still.push(order)
      continue
    }

    const fee = simFees(fill, config)
    fills.push({ ...fill, fee: fee.amount, feeBps: fee.bps, reason: String(order?.reason ?? '') })
  }

  return { fills, pending: still }
}

/**
 * Run one strategy over one recording's ticks.
 *
 * @param {{ticks?: object[], strategy?: object, params?: object, instrument?: string,
 *   fillConfig?: object, onProgress?: Function, cancelled?: () => boolean,
 *   now?: () => number, everyMs?: number}} [options] - the run.
 * @returns {{signals: object[], fills: object[], played: number, total: number,
 *   errors: number, cancelled: boolean, instrument: string, fillConfig: object,
 *   state: object, elapsedMs: number}} the result.
 */
export function driveBacktest(options = {}) {
  const now = typeof options.now === 'function' ? options.now : () => Date.now()
  const cancelled = typeof options.cancelled === 'function' ? options.cancelled : () => false
  const strategy = options.strategy
  const instrument = String(options.instrument ?? '')
  // The instrument decides spot versus swap on the fee card, so it is folded in here
  // rather than left to whoever remembered to pass it.
  const fillConfig = resolveFillConfig({ instrument, ...(options.fillConfig ?? {}) })

  const all = Array.isArray(options.ticks) ? options.ticks : []
  // One instrument per run. A recording holds every symbol the desk was watching, and a
  // strategy handed BTC and TSLA prints down the same `onTick` would see a chart that
  // teleports between two markets and score noise.
  const ticks = instrument ? all.filter((t) => String(t?.symbol) === instrument) : all

  const startedAt = now()
  const sandbox = createSandbox()
  const report = progressReporter(options.onProgress, { now, everyMs: options.everyMs })

  const signals = []
  const fills = []
  let pending = []
  let errors = 0
  let played = 0
  let stopped = false

  // The scratchpad is created once and carried across every tick — a strategy's ring
  // buffer and running baselines are the whole reason `init` exists.
  const scratch = {}
  const context = (at) =>
    createStrategyContext({ strategy, instrument, params: options.params, now: at, state: scratch })

  const init = invokeStrategy(strategy, 'init', context(startedAt), null)
  if (!init.ok) errors += 1

  for (const tick of ticks) {
    // Checked per tick rather than per chunk: a misconfigured sweep over a long recording
    // must stop the moment it is cancelled, not at the next batch boundary.
    if (cancelled()) {
      stopped = true
      break
    }

    const at = Number(tick?.ts) || 0

    // Arrivals are settled *before* the strategy sees the tick. An order sent last tick
    // reaches the venue at a price the strategy has not reacted to yet, and settling it
    // afterwards would fill it against a book the strategy had already moved on from.
    const drained = drainPending(pending, tick, fillConfig)
    pending = drained.pending
    fills.push(...drained.fills)

    const outcome = invokeStrategy(strategy, 'onTick', context(at), tick)
    if (!outcome.ok) errors += 1
    else {
      const before = signals.length
      collectSignals(signals, outcome.value, tick)
      // Only a signal that actually landed becomes an order — `collectSignals` already
      // dropped the silence, and re-deciding that here would be two definitions of
      // "the strategy said something".
      if (signals.length > before) {
        const order = orderFromSignal(signals.at(-1), fillConfig)
        if (order) pending.push(applyLatency(order, fillConfig))
      }
    }

    played += 1
    report({ played, total: ticks.length, signals: signals.length, fills: fills.length })
  }

  report({ played, total: ticks.length, signals: signals.length, fills: fills.length }, true)
  sandbox.set('run.signals', signals.length)
  sandbox.set('run.fills', fills.length)
  sandbox.set('run.errors', errors)

  return {
    signals,
    fills,
    // Orders still in flight when the tape ran out. Reported rather than force-filled: a
    // limit that never came is a trade that never happened, and filling it at the end
    // would credit the strategy with the one fill it demonstrably did not get.
    unfilled: pending.length,
    fillConfig,
    played,
    total: ticks.length,
    errors,
    cancelled: stopped,
    instrument,
    // The end state, snapshotted for the determinism harness to hash in F27.10.
    state: sandbox.snapshot(),
    elapsedMs: Math.max(0, now() - startedAt),
  }
}
