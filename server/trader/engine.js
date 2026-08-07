import { createStrategyContext, toSignal } from '../../src/strategy/contract.js'
import { momentumStrategy } from '../../src/strategy/builtin/momentum.js'
import { vwapRevertStrategy } from '../../src/strategy/builtin/vwap-revert.js'
import { bookImbalanceStrategy } from '../../src/strategy/builtin/book-imbalance.js'
import { tapePressureStrategy } from '../../src/strategy/builtin/tape-pressure.js'
import { signalGate, throttleGate, capGate, cooldownGate } from './gates.js'
import { tunedParams, tunedMinStrength } from './tuning.js'
import { placeMarketOrder } from './venue.js'
import { createLogger } from '../../src/utils/log.js'

/**
 * The trading loop, server-side.
 *
 * The strategies are **the same modules the browser runs** — imported straight out of
 * `src/strategy/`, not reimplemented. That was possible because the strategy contract was
 * written decoupled from the start: a strategy is handed a context and returns a signal,
 * it never touches state and never places an order. So the one thing that must never
 * differ between the desk you watch and the loop that trades — what a strategy *decides* —
 * is not two implementations that could drift, it is one module imported twice.
 *
 * What is NOT shared is everything around them: the browser's runner is built on the
 * reactive engine and an animation frame, and neither belongs in a headless process.
 */

const log = createLogger('trader')

/** The set that trades. Chosen to disagree with each other, as on the desk. */
export const STRATEGIES = Object.freeze([
  momentumStrategy,
  vwapRevertStrategy,
  bookImbalanceStrategy,
  tapePressureStrategy,
])

/** Losing trades in a row before an instrument is benched. */
export const COOLDOWN_AFTER = 3

/** How long the bench lasts. */
export const COOLDOWN_MS = 10 * 60 * 1000

/**
 * Fresh per-instrument bookkeeping.
 *
 * One record per instrument rather than a pile of parallel maps: everything here is read
 * together on every tick, and a single object is one lookup instead of six.
 *
 * @param {string} instrument - the instrument id.
 * @returns {object} the record.
 */
export function createDesk(instrument, sensitivity = 0) {
  return {
    instrument,
    position: 0,
    avgPx: 0,
    realized: 0,
    book: { bid: 0, ask: 0, bidSize: 0, askSize: 0, mid: 0, ts: 0 },
    // Each strategy keeps its own scratchpad — a ring buffer, a running baseline. Shared
    // state between two strategies on one instrument would make them one strategy.
    // Params are resolved once, here: the dial is a deployment setting, and recomputing
    // the same overrides on every print would be work done thousands of times a minute to
    // reach the same answer.
    runs: STRATEGIES.map((strategy) => ({
      strategy,
      state: {},
      started: false,
      params: tunedParams(strategy, sensitivity),
    })),
    streak: 0,
    cooldownUntil: 0,
  }
}

/**
 * Apply a fill to a desk's position, returning the realised amount.
 *
 * Average-price bookkeeping: adding to a position moves the average, reducing it realises
 * against that average. A flip through zero realises the whole old side and opens the
 * remainder at the fill price — anything else would carry a long's cost basis into a short.
 *
 * @param {object} desk - the instrument's record, mutated.
 * @param {{side: string, size: number, px: number}} fill - the fill.
 * @returns {number} realised P&L from this fill.
 */
export function applyFill(desk, fill) {
  const size = Math.abs(Number(fill?.size) || 0)
  const px = Number(fill?.px) || 0
  if (size <= 0 || px <= 0) return 0

  const delta = String(fill?.side ?? '').toLowerCase() === 'sell' ? -size : size
  const before = desk.position
  const after = before + delta
  let realized = 0

  if (before === 0 || Math.sign(before) === Math.sign(delta)) {
    // Opening or adding: the average moves, nothing is realised.
    desk.avgPx = (Math.abs(before) * desk.avgPx + size * px) / (Math.abs(before) + size)
  } else {
    // Reducing or flipping: realise against the old average, for as much as was closed.
    const closed = Math.min(Math.abs(before), size)
    realized = (px - desk.avgPx) * closed * Math.sign(before)
    // A flip leaves the remainder open at the fill price; a pure reduction keeps the
    // average it had, and a flat position has no average at all.
    if (Math.sign(after) !== Math.sign(before) && after !== 0) desk.avgPx = px
    else if (after === 0) desk.avgPx = 0
  }

  desk.position = after
  desk.realized += realized
  return realized
}

/**
 * Fold a closed trade into the loss streak, benching after enough of them.
 *
 * @param {object} desk - the instrument's record, mutated.
 * @param {number} realized - the realised amount.
 * @param {number} now - epoch ms.
 * @param {{cooldownAfter?: number, cooldownMs?: number}} [limits] - the configured bench.
 * @returns {boolean} whether the instrument is now benched.
 */
export function recordOutcome(desk, realized, now, limits = {}) {
  const after = Math.max(1, Number(limits.cooldownAfter) || COOLDOWN_AFTER)
  const benchMs = Number.isFinite(Number(limits.cooldownMs)) ? Number(limits.cooldownMs) : COOLDOWN_MS
  const amount = Number(realized) || 0
  if (amount === 0) return desk.cooldownUntil > now

  // A win resets outright: "consecutive" is the entire claim being made.
  if (amount > 0) {
    desk.streak = 0
    return false
  }

  desk.streak += 1
  if (desk.streak >= after) {
    desk.cooldownUntil = (Number(now) || 0) + benchMs
    desk.streak = 0
    return true
  }
  return false
}

/**
 * Run every strategy over one tick and return the strongest opinion.
 *
 * Strongest rather than first or majority: the set is chosen to disagree, so a vote would
 * usually deadlock, and taking the first would make the array order a trading decision.
 *
 * @param {object} desk - the instrument's record.
 * @param {object} tick - the trade print.
 * @param {number} now - epoch ms.
 * @returns {{action: string, strength: number, reason: string, strategy: string}} the call.
 */
export function strongestSignal(desk, tick, now) {
  let best = { action: 'none', strength: 0, reason: '', strategy: '' }

  // One tick shape that satisfies all four: the print (px, size, side, ts) that momentum,
  // vwap-revert and tape-pressure read, plus the current ladders that book-imbalance reads
  // straight off the tick. Composed here rather than at the call site so a caller only
  // ever has to hand over the trade it just received.
  const enriched = {
    ...tick,
    size: Number(tick?.size ?? tick?.sz) || 0,
    bids: desk.book.bids ?? [],
    asks: desk.book.asks ?? [],
  }

  for (const run of desk.runs) {
    const ctx = createStrategyContext({
      strategy: run.strategy,
      instrument: desk.instrument,
      state: run.state,
      params: run.params,
      now,
      // The book goes in as an indicator reading, which is how book-imbalance sees depth
      // without the contract growing a second argument.
      ind: { book: desk.book },
    })

    try {
      if (!run.started) {
        run.strategy.init?.(ctx)
        run.started = true
      }
      const signal = toSignal(run.strategy.onTick?.(ctx, enriched))
      if (signal.strength > best.strength) {
        best = { ...signal, strategy: run.strategy.id }
      }
    } catch (err) {
      // One broken strategy must not stop the other three, and must not stop the loop.
      log.warn(`${run.strategy.id} threw on ${desk.instrument}: ${err?.message ?? err}`)
    }
  }

  return best
}

/**
 * Turn a signal into an order, or explain why not.
 *
 * @param {object} desk - the instrument's record.
 * @param {object} signal - the strongest signal.
 * @param {{now: number, sent: number[], config: object}} context - loop state.
 * @returns {{send: boolean, reason: string, order?: object}} the decision.
 */
export function decide(desk, signal, context) {
  const now = Number(context?.now) || 0
  const config = context?.config ?? {}

  // 'flat' is an exit, and an exit is not subject to the gates that govern *entering*
  // risk. Ignoring it — as this did at first — meant every strategy's carefully written
  // exit was discarded, positions only ever grew, and the loop built to its cap and then
  // refused everything forever. A trader who cannot close is not being protected.
  if (String(signal?.action ?? '').toLowerCase() === 'flat') {
    // Not a refusal and not a missed trade: there was nothing to close. Categorised as
    // 'noop' so it can be left out of "what did we pass on", where it would otherwise be
    // the single biggest slice and mean nothing.
    if (desk.position === 0) return { send: false, why: 'noop', reason: 'already flat' }

    return {
      send: true,
      why: 'exit',
      reason: signal.reason || 'exit',
      order: {
        instId: desk.instrument,
        side: desk.position > 0 ? 'sell' : 'buy',
        size: Math.abs(desk.position),
      },
    }
  }

  const strength = signalGate(signal, tunedMinStrength(config.sensitivity))
  if (!strength.pass) return { send: false, why: 'weak', reason: strength.reason }

  const bench = cooldownGate(desk.cooldownUntil, now)
  if (!bench.pass) return { send: false, why: 'benched', reason: bench.reason }

  const throttle = throttleGate(context?.sent, now, config.maxPerMin)
  if (!throttle.pass) return { send: false, why: 'throttled', reason: throttle.reason }

  const order = {
    instId: desk.instrument,
    side: String(signal.action).toLowerCase(),
    size: Number(config.size) || 0,
  }
  if (order.size <= 0) return { send: false, why: 'misconfigured', reason: 'size is zero' }

  const cap = capGate(order, desk.position, config.maxPerInstrument)
  if (!cap.pass) return { send: false, why: 'cap', reason: cap.reason }

  return { send: true, why: 'entry', reason: signal.reason, order }
}

/**
 * Send an order — to the venue, or to the paper book.
 *
 * Paper fills cross the spread rather than filling at the mid: a simulation that fills
 * better than reality teaches the wrong lesson, and the whole point of running this on
 * paper first is to find out whether the edge survives the spread.
 *
 * @param {object} order - the order.
 * @param {object} desk - the instrument's record.
 * @param {object} config - the trader config.
 * @param {object} [deps] - injectable venue.
 * @returns {Promise<{ok: boolean, px: number, id: string, error: string}>} the fill.
 */
export async function sendOrder(order, desk, config, deps = {}) {
  const buying = String(order?.side).toLowerCase() === 'buy'
  const px = buying ? desk.book.ask : desk.book.bid

  if (!config?.live) {
    if (!(px > 0)) return { ok: false, px: 0, id: '', error: 'no book to fill against' }
    return { ok: true, px, id: `paper-${desk.instrument}-${order.side}`, error: '' }
  }

  const place = deps.placeOrder ?? placeMarketOrder
  const result = await place(order, config, deps)
  // The venue's market order fills at whatever it fills at; the touch is the honest
  // estimate until a fills feed says otherwise.
  return {
    ok: result.ok,
    px: result.ok ? px : 0,
    id: result.id,
    code: result.code ?? '',
    error: result.error,
  }
}
