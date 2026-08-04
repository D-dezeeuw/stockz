import { setValue, appState } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { createRing } from '../pipeline/ring.js'
import { submit } from '../exec/engine.js'
import { mapSignalToOrder, rulesFor } from './mapper.js'
import { throttleGate, cooldownGate, clearCooldown } from './throttle.js'
import { capGate } from './caps.js'
import { dispatchOrDry, countSignal, hardStop } from './session.js'
import { emitAlert } from '../alerts/bus.js'
import { registerAction } from '../actions/registry.js'
import { ACTIONS } from '../actions/names.js'

/**
 * The bot runner.
 *
 * The point of the whole desk arriving at once: strategies already have opinions, the
 * execution engine already validates and guards, and this is the twenty lines that let the
 * first drive the second without a human clicking.
 *
 * It is deliberately **thin**. Every order still goes through `exec/engine.js`'s `prepare()`
 * — the same validation, capability check, grid rounding, size guard and slippage guard a
 * hand-typed order passes. A bot with its own execution path would be a second place for
 * "is this order sane" to be answered, and the two would disagree the day it mattered.
 *
 * The other half is the gate chain. A signal is not an order: it has to survive arming, the
 * per-strategy opt-in, a throttle, a cooldown and a position cap, **in that order**, and
 * every rejection is recorded with its reason. A bot that silently does nothing is
 * indistinguishable from a broken one, and the trader has to be able to answer "why did it
 * not take that" without a debugger.
 */

/** Signals held between drains. A burst must not lose the one that mattered. */
export const INTAKE_SIZE = 256

/** Decisions kept for the panel. */
export const DECISION_SIZE = 200

/** How often the queue is drained, in ms. */
export const DRAIN_MS = 50

let intake = createRing(INTAKE_SIZE)
let decisions = createRing(DECISION_SIZE)

/**
 * Queue a signal for the bot.
 *
 * @param {object} signal - a normalised strategy signal.
 * @returns {boolean} true when it was queued.
 */
export function enqueueSignal(signal) {
  const action = String(signal?.action ?? '')
  // 'none' is a strategy having no opinion. Queueing it would fill the intake with
  // non-events and push out the ones that were actual calls.
  if (!action || action === 'none') return false

  intake.push(signal)
  return true
}

/**
 * Record a decision, taken or not.
 *
 * @param {object} entry - the decision.
 * @returns {object} what was recorded.
 */
export function pushDecision(entry) {
  const record = {
    ts: Number(entry?.ts) || 0,
    strategy: String(entry?.strategy ?? ''),
    instrument: String(entry?.instrument ?? ''),
    action: String(entry?.action ?? ''),
    taken: entry?.taken === true,
    // The reason is the whole value of this record. "Did not trade" with no reason is a bug
    // report nobody can file.
    reason: String(entry?.reason ?? ''),
  }

  decisions.push(record)
  return record
}

/**
 * Every recorded decision.
 *
 * @param {number} [limit] - at most this many, newest-biased.
 * @returns {object[]} oldest first.
 */
export function botDecisions(limit) {
  return decisions.toArray(limit)
}

/**
 * Is the bot armed at all?
 *
 * @param {object} [state] - the settings slice.
 * @returns {{pass: boolean, reason: string}} the verdict.
 */
export function armGate(state = appState?.settings) {
  // Off by default and off after every reload: a bot that came back armed because it was
  // armed yesterday is the single most dangerous default available here.
  return state?.botArmed === true ? { pass: true, reason: '' } : { pass: false, reason: 'disarmed' }
}

/**
 * Has this strategy been opted in to trading?
 *
 * @param {string} strategyId - the strategy.
 * @param {object} [state] - the settings slice.
 * @returns {{pass: boolean, reason: string}} the verdict.
 */
export function optInGate(strategyId, state = appState?.settings) {
  const id = String(strategyId ?? '')
  // Opt-*in*, unlike the alert toggles which are opt-out. Being told about a signal and
  // having money placed on it are different enough that the defaults must differ too.
  const allowed = state?.botStrategies?.[id] === true

  return allowed ? { pass: true, reason: '' } : { pass: false, reason: `${id} not enabled` }
}

/**
 * Run every gate, in order.
 *
 * @param {object} signal - the queued signal.
 * @param {object} context - `{now, gates}` — the clock and the remaining gates.
 * @returns {{pass: boolean, reason: string}} the verdict.
 */
export function runGates(signal, context = {}) {
  const gates = Array.isArray(context.gates) ? context.gates : []

  for (const gate of gates) {
    const verdict = typeof gate === 'function' ? gate(signal, context) : { pass: true, reason: '' }
    // First failure wins and stops the chain. Running the rest would cost work for a signal
    // already rejected, and would report whichever reason happened to be last.
    if (verdict?.pass !== true) return { pass: false, reason: String(verdict?.reason ?? 'blocked') }
  }

  return { pass: true, reason: '' }
}

/**
 * Decide what to do with one signal.
 *
 * @param {object} signal - the queued signal.
 * @param {{now?: number, gates?: Function[]}} [context] - the clock and extra gates.
 * @returns {object} the decision.
 */
export function decide(signal, context = {}) {
  const now = Number(context.now) || Number(signal?.ts) || 0
  const strategy = String(signal?.source ?? signal?.strategyId ?? '')
  const instrument = String(signal?.instrument ?? '')

  // The order is the point: arming, then permission, then the rate ceiling, then the
  // bench. Each is cheaper than the one after it and each rules out more, so a disarmed
  // desk never touches the throttle's window at all.
  const base = [
    () => armGate(),
    () => optInGate(strategy),
    (sig, ctx) => throttleGate(sig, ctx),
    (sig, ctx) => cooldownGate(sig, ctx),
    (sig, ctx) => capGate(sig, ctx),
  ]
  const verdict = runGates(signal, { ...context, now, gates: [...base, ...(context.gates ?? [])] })

  countSignal(verdict.pass)

  return pushDecision({
    ts: now,
    strategy,
    instrument,
    action: String(signal?.action ?? ''),
    taken: verdict.pass,
    reason: verdict.reason || 'passed',
  })
}

/**
 * Turn a passing signal into an order.
 *
 * @param {object} signal - the signal.
 * @param {{size?: number, send?: Function}} [options] - sizing and an injectable submit.
 * @returns {Promise<object>} the submission result.
 */
export async function dispatchOrder(signal, options = {}) {
  const send = typeof options.send === 'function' ? options.send : submit
  const strategy = String(signal?.source ?? signal?.strategyId ?? '')
  const mapped = mapSignalToOrder(signal, { ...rulesFor(strategy), ...(options.rules ?? {}) })
  // Refused at the mapper is refused before the network: an order with a size that rounds
  // to zero is not worth a round trip to find out.
  if (!mapped.ok) return { ok: false, clientId: '', reason: mapped.reason }

  // Straight through `submit`, which means `prepare()`: the same validation, capability
  // check, grid rounding and both guards a hand-typed order passes. A second execution path
  // is a second answer to "is this order sane".
  return dispatchOrDry(mapped.order, { send, now: Number(signal?.ts) || 0, dry: options.dry })
}

/**
 * Drain the queue into decisions and orders.
 *
 * @param {{now?: number, gates?: Function[], send?: Function}} [context] - plumbing.
 * @returns {Promise<object[]>} the decisions taken this drain.
 */
export async function drainTick(context = {}) {
  const queued = intake.toArray()
  if (queued.length === 0) return []

  intake.clear()
  const taken = []

  for (const signal of queued) {
    const decision = decide(signal, context)
    if (!decision.taken) continue

    const result = await dispatchOrder(signal, context)
    if (!result?.ok) {
      // A bot order the engine refused is news: the guards did their job, and the trader
      // needs to know their bot is being stopped rather than quietly idle.
      emitAlert(
        {
          key: `bot|reject|${decision.strategy}`,
          source: 'bot',
          kind: 'reject',
          severity: 'warn',
          text: `bot order refused — ${result?.reason ?? 'unknown'}`,
          instrument: decision.instrument,
          ts: decision.ts,
        },
        { debounceMs: 5000 },
      )
    }

    taken.push({ ...decision, clientId: result?.clientId ?? '' })
  }

  return taken
}

/**
 * Publish the decision panel.
 *
 * @returns {object[]} what was published.
 */
export function flushDecisions() {
  const rows = botDecisions(50).slice().reverse()
  setValue(PATHS.bot.decisions, rows)
  return rows
}

/**
 * Start the runner.
 *
 * @param {{timer?: object, intervalMs?: number, subscribe?: Function}} [options] - plumbing.
 * @returns {() => void} stop.
 */
export function createBotRunner(options = {}) {
  const timer = options.timer ?? globalThis
  const every = Number(options.intervalMs) > 0 ? Number(options.intervalMs) : DRAIN_MS
  const unsubscribe = typeof options.subscribe === 'function' ? options.subscribe(enqueueSignal) : null

  // A 50ms drain rather than acting on the signal itself: it bounds how much work a burst
  // can do in one frame, and it is still four times faster than a person.
  const handle = timer.setInterval?.(() => drainTick(options), every)

  const stop = () => {
    timer.clearInterval?.(handle)
    unsubscribe?.()
  }

  // The kill switch phase 24 will pull. Wired here rather than there so the runner owns
  // the one call that stops it, and nothing else has to know how it is stopped.
  killSwitch = (reason, now) => hardStop({ stop, now, reason })

  return stop
}

/** How the desk stops the bot dead. Set by `createBotRunner`. */
let killSwitch = null

/**
 * Stop the bot immediately, from anywhere.
 *
 * @param {string} reason - why.
 * @param {number} [now] - the current time.
 * @returns {boolean} true when a runner was stopped.
 */
export function killBot(reason, now = 0) {
  // Disarms even with no runner attached: a kill that did nothing because the loop had not
  // started would be a kill switch with an exception, and a kill switch with an exception
  // is not one.
  if (typeof killSwitch !== 'function') return hardStop({ now, reason })

  return killSwitch(reason, now)
}

/**
 * Forget every queued signal and decision.
 *
 * @returns {boolean} true.
 */
export function resetRunner() {
  intake = createRing(INTAKE_SIZE)
  decisions = createRing(DECISION_SIZE)
  return true
}

/**
 * Flip the master arm switch.
 *
 * The bot's arm is a **different flag** from the ticket's `trade.armed`, and nothing reads
 * across. Manual trading must not stop because the bot was disarmed, and the bot must not
 * start because somebody armed the ticket to click a button.
 *
 * @param {boolean} [next] - the state to move to; omit to toggle.
 * @param {number} [now] - the current time, for the record.
 * @returns {boolean} the switch's new state.
 */
export function toggleMasterArm(next, now = 0) {
  const value = typeof next === 'boolean' ? next : appState.settings?.botArmed !== true
  setValue(PATHS.settings.botArmed, value)

  // Every flip is on the record with a timestamp: "when did I arm this" is the first
  // question asked about any trade the bot took.
  pushDecision({
    ts: Number(now) || 0,
    strategy: 'desk',
    action: value ? 'ARMED' : 'DISARMED',
    taken: value,
    reason: value ? 'auto-trading armed' : 'auto-trading disarmed',
  })

  emitAlert(
    {
      key: 'bot|arm',
      source: 'bot',
      kind: 'arm',
      severity: value ? 'warn' : 'info',
      text: value ? 'AUTO-TRADING ARMED' : 'auto-trading disarmed',
      ts: Number(now) || 0,
    },
    { debounceMs: 0 },
  )

  return value
}

/**
 * Grant or revoke a strategy's permission to trade.
 *
 * @param {string} strategyId - the strategy.
 * @param {boolean} enabled - whether it may trade.
 * @returns {object} the permission map now in force.
 */
export function setAutoEnabled(strategyId, enabled) {
  const id = String(strategyId ?? '')
  const current = appState.settings?.botStrategies ?? {}
  if (!id) return current

  const next = { ...current, [id]: enabled === true }
  setValue(PATHS.settings.botStrategies, next)

  return next
}

/**
 * Revoke every strategy's permission at once.
 *
 * @returns {object} the empty permission map.
 */
export function disableAllAuto() {
  const current = appState.settings?.botStrategies ?? {}
  // Every key written false rather than the map replaced: `setValue` merges objects, so a
  // bare `{}` would leave every existing permission exactly where it was.
  const cleared = Object.fromEntries(Object.keys(current).map((id) => [id, false]))

  setValue(PATHS.settings.botStrategies, cleared)
  return cleared
}

/**
 * Publish the bot's headline state.
 *
 * @returns {object} what was published.
 */
export function refreshBotStatus() {
  const permissions = appState.settings?.botStrategies ?? {}
  const status = {
    armed: appState.settings?.botArmed === true,
    enabled: Object.values(permissions).filter(Boolean).length,
    queued: intake.size(),
  }

  setValue(PATHS.bot.status, status)
  return status
}

/**
 * Register the bot's actions.
 *
 * @returns {string} the arm action's name.
 */
export function registerBotActions() {
  registerAction(ACTIONS.bot.toggleArm, (_state, payload) =>
    toggleMasterArm(typeof payload?.value === 'boolean' ? payload.value : undefined, Date.now()),
  )
  registerAction(ACTIONS.bot.setAuto, (_state, payload) =>
    setAutoEnabled(payload?.strategy, payload?.checked ?? payload?.value !== 'false'),
  )
  registerAction(ACTIONS.bot.disableAll, () => disableAllAuto())
  registerAction(ACTIONS.bot.resume, () => clearCooldown(Date.now()))

  return ACTIONS.bot.toggleArm
}
