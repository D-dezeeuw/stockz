import { setValue, appState, watch } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { pushDecision } from './runner.js'

/**
 * The rate ceiling, and the losing-streak bench.
 *
 * Two very different guards that exist for the same reason: a bot's failure mode is not
 * being wrong once, it is being wrong *quickly and repeatedly*. A human who loses three in
 * a row hesitates. Software does not, and the hesitation has to be written down.
 *
 * The throttle is a sliding window with a lazily-advanced head — no timers, no background
 * cost, O(1) amortised per check. A rate limiter that needed its own interval would be a
 * rate limiter that keeps a tab awake.
 *
 * The cooldown counts **consecutive realised losses**, not drawdown, because that is the
 * signal that a strategy has stopped matching the market rather than that the market moved.
 * Three losers in a row is a different thing from one large one, and only the first is
 * evidence about the strategy.
 */

/** Orders a minute, unless the trader says otherwise. */
export const DEFAULT_RATE = 30

/** Consecutive losses before the bot benches itself. */
export const DEFAULT_STREAK = 3

/** How long the bench lasts, in minutes. */
export const DEFAULT_COOLDOWN_MIN = 10

/**
 * A sliding-window rate limiter.
 *
 * @param {number} limitPerMin - orders allowed per minute.
 * @returns {{allow: (now: number) => boolean, used: (now: number) => number, reset: () => void}}
 *   the limiter.
 */
export function createThrottle(limitPerMin) {
  const limit = Math.max(1, Math.floor(Number(limitPerMin) || DEFAULT_RATE))
  const stamps = new Array(limit)
  let head = 0
  let count = 0

  const prune = (now) => {
    const cutoff = Number(now) - 60000
    // Advanced lazily inside the check rather than swept by a timer: a rate limiter that
    // needed its own interval would keep a backgrounded tab awake to do nothing.
    while (count > 0 && stamps[head] <= cutoff) {
      head = (head + 1) % limit
      count -= 1
    }
  }

  return {
    allow(now) {
      const at = Number(now)
      if (!Number.isFinite(at)) return false

      prune(at)
      if (count >= limit) return false

      stamps[(head + count) % limit] = at
      count += 1
      return true
    },
    used(now) {
      prune(Number(now) || 0)
      return count
    },
    reset() {
      head = 0
      count = 0
    },
  }
}

let throttle = createThrottle(DEFAULT_RATE)
let configuredRate = DEFAULT_RATE

/**
 * How busy a market the desk is tuned for, as orders per minute.
 *
 * The throttle is what actually decides how much trading happens, and it binds long before
 * anything else does: signals arrive in clusters, so a burst empties the window in seconds
 * and everything behind it is refused. Measured over a simulated hour at five prints per
 * second, a 30/min ceiling turned ~200 signals away to let ~48 through.
 *
 * These are limits, not targets. Nothing here makes the desk trade more — it stops the
 * limiter throwing away the tail of a burst the strategies did produce.
 */
export const MARKET_MODES = Object.freeze({
  quiet: 15,
  normal: 30,
  volatile: 120,
})

/** The mode a desk starts in. */
export const DEFAULT_MODE = 'volatile'

/**
 * The orders-per-minute ceiling a mode implies.
 *
 * @param {string} mode - a MARKET_MODES key.
 * @returns {number} orders per minute; the default mode's rate for anything unknown.
 */
export function rateForMode(mode) {
  return MARKET_MODES[String(mode ?? '')] ?? MARKET_MODES[DEFAULT_MODE]
}

/**
 * Apply the market mode's rate to the throttle setting.
 *
 * The mode is a *preset*: it writes `botMaxPerMin` and then stops mattering, so the number
 * stays the single source of truth and a hand-typed rate is not overwritten on the next
 * read. Watched rather than wired to one control, because the setting can move from the
 * drawer, the command palette or a settings import, and a preset that only worked from one
 * of those would be a preset that silently did not apply.
 *
 * @param {{watch?: Function}} [deps] - injectable watcher, for tests.
 * @returns {number} the rate now in force.
 */
export function mountMarketMode(deps = {}) {
  const { watch: watcher = watch } = deps
  const apply = () => setValue(PATHS.settings.botMaxPerMin, rateForMode(appState?.settings?.marketMode))

  watcher([PATHS.settings.marketMode], apply)
  apply()

  return rateForMode(appState?.settings?.marketMode)
}

/**
 * The limiter for the rate currently configured.
 *
 * @param {object} [state] - the settings slice.
 * @returns {object} the limiter.
 */
export function currentThrottle(state = appState?.settings) {
  // The mode is the preset and `botMaxPerMin` is the number it wrote, so the number stays
  // the single source of truth — a mode that were consulted here as well would fight any
  // hand-typed rate on the next read.
  const rate = Math.max(1, Math.floor(Number(state?.botMaxPerMin) || rateForMode(state?.marketMode)))
  // Rebuilt when the setting changes, because the window size *is* the limit — a limiter
  // built for 30 cannot answer a question about 60.
  if (rate !== configuredRate) {
    throttle = createThrottle(rate)
    configuredRate = rate
  }

  return throttle
}

/**
 * The rate gate.
 *
 * @param {object} _signal - the signal (unused; the gate is about the desk, not the call).
 * @param {{now?: number}} [context] - the clock.
 * @returns {{pass: boolean, reason: string}} the verdict.
 */
export function throttleGate(_signal, context = {}) {
  const now = Number(context.now) || 0
  const limiter = currentThrottle()

  return limiter.allow(now)
    ? { pass: true, reason: '' }
    : { pass: false, reason: `throttled at ${configuredRate}/min` }
}

/** The bot's consecutive-loss state. */
let streak = 0
let cooldownUntil = 0

/**
 * Fold a closed trade into the loss streak.
 *
 * @param {number} pnl - the realised amount.
 * @param {number} now - the current time.
 * @param {object} [state] - the settings slice.
 * @returns {{streak: number, benched: boolean}} the state after.
 */
export function onFillClosed(pnl, now, state = appState?.settings) {
  const amount = Number(pnl)
  if (!Number.isFinite(amount) || amount === 0) return { streak, benched: cooldownUntil > 0 }

  // A win resets it outright. Consecutive is the whole claim: three losers in a row is
  // evidence about the strategy, three losers among ten is evidence about nothing.
  if (amount > 0) {
    streak = 0
    return { streak, benched: cooldownUntil > Number(now) }
  }

  streak += 1
  const limit = Math.max(1, Math.floor(Number(state?.botCooldownAfter) || DEFAULT_STREAK))
  if (streak < limit) return { streak, benched: cooldownUntil > Number(now) }

  const minutes = Math.max(1, Number(state?.botCooldownMinutes) || DEFAULT_COOLDOWN_MIN)
  startCooldown((Number(now) || 0) + minutes * 60000, now)

  return { streak, benched: true }
}

/**
 * Bench the bot until a time.
 *
 * @param {number} untilTs - when it may resume.
 * @param {number} now - the current time.
 * @returns {number} the bench's end.
 */
export function startCooldown(untilTs, now) {
  cooldownUntil = Number(untilTs) || 0
  setValue(PATHS.bot.cooldownUntil, cooldownUntil)

  pushDecision({
    ts: Number(now) || 0,
    strategy: 'desk',
    action: 'COOLDOWN',
    taken: false,
    reason: `${streak} losses in a row — benched`,
  })

  return cooldownUntil
}

/**
 * The cooldown gate.
 *
 * @param {object} _signal - the signal (unused).
 * @param {{now?: number}} [context] - the clock.
 * @returns {{pass: boolean, reason: string}} the verdict.
 */
export function cooldownGate(_signal, context = {}) {
  const now = Number(context.now) || 0
  if (cooldownUntil <= 0 || now >= cooldownUntil) return { pass: true, reason: '' }

  const left = Math.ceil((cooldownUntil - now) / 1000)
  return { pass: false, reason: `cooling down ${left}s` }
}

/**
 * End the bench early.
 *
 * @param {number} now - the current time.
 * @returns {boolean} true when a bench was cleared.
 */
export function clearCooldown(now) {
  if (cooldownUntil <= 0) return false

  cooldownUntil = 0
  streak = 0
  setValue(PATHS.bot.cooldownUntil, 0)
  pushDecision({
    ts: Number(now) || 0,
    strategy: 'desk',
    action: 'RESUME',
    taken: false,
    reason: 'cooldown cleared by hand',
  })

  return true
}

/**
 * The rate and cooldown readouts.
 *
 * @param {number} now - the current time.
 * @returns {object} what was published.
 */
export function refreshLimits(now) {
  const at = Number(now) || 0
  const limiter = currentThrottle()
  const used = limiter.used(at)
  const left = cooldownUntil > at ? cooldownUntil - at : 0

  const limits = {
    used,
    limit: configuredRate,
    // Orange past 80%: the point of the meter is to be read *before* the ceiling is hit.
    hot: used >= configuredRate * 0.8,
    streak,
    cooldownLeft: left,
    cooldownLabel: left > 0 ? `${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, '0')}` : '',
  }

  setValue(PATHS.bot.limits, limits)
  return limits
}

/**
 * Clear the window and the streak.
 *
 * @returns {boolean} true.
 */
export function resetThrottle() {
  throttle = createThrottle(configuredRate)
  streak = 0
  cooldownUntil = 0
  return true
}
