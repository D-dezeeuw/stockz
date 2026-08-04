import { setValue, appState, watch } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { startStrategy, stopStrategy, liveRuns } from '../strategy/registry.js'
import { paperMode } from '../exec/engine.js'
import { splitSymbol } from '../lists/ops.js'
import { createLogger } from '../utils/log.js'

/**
 * The autopilot: the desk trading without being told to.
 *
 * Everything needed for this existed and none of it was connected. Ten strategies, a
 * signal normalizer, a scoreboard, a runner draining every 50ms, gates, a kill switch —
 * and `startStrategy` had no callers anywhere, so the runner drained an empty queue
 * forever and the Auto-Trade block was decoration.
 *
 * **Paper only, by construction.** This arms the bot when the desk is on paper and disarms
 * it the instant the desk goes live. Switching to live is therefore always a two-step
 * decision — flip the mode, then arm deliberately — because "it was trading a minute ago"
 * is the worst possible reason for real money to start moving. The arm state is not
 * persisted either, so a reload lands disarmed and on paper regardless of how the last
 * session ended.
 *
 * **It follows focus.** Strategies read the tick bus, and the venue socket streams the
 * focused instrument only, so running them on all forty watchlist rows would give
 * thirty-nine of them no data. Instead the set moves with the instrument being looked at
 * — which is also the one the ticket and the book are pointed at, so what the desk is
 * trading is always what is on screen.
 */

const log = createLogger('autopilot')

/**
 * The strategies the autopilot runs.
 *
 * Chosen to disagree with each other. A momentum burst and a VWAP fade take opposite sides
 * of the same stretch, and the book (what people intend) and the tape (what they did) read
 * the same instant differently. Four strategies that all fire together are one strategy
 * with four names, and the scoreboard cannot tell you anything about a set like that.
 *
 * `spread-capture` is deliberately absent: it quotes both sides passively, and paper fills
 * cannot honestly simulate queue position, so its paper record would be fiction.
 */
export const AUTOPILOT_STRATEGIES = Object.freeze([
  'momentum-burst',
  'vwap-revert',
  'book-imbalance',
  'tape-pressure',
])

/**
 * Should the autopilot be flying?
 *
 * @param {object} [state] - engine state.
 * @returns {boolean} true when it may run.
 */
export function autopilotEnabled(state = appState) {
  // Opt-out rather than opt-in, but only because it cannot reach a venue: this is gated on
  // paper mode below, and a paper desk that sits idle teaches its owner nothing.
  return state?.settings?.autopilot !== false
}

/**
 * Put the strategy set on one instrument, taking it off everything else.
 *
 * @param {string} instrument - qualified or bare symbol.
 * @param {{now?: number}} [options] - injected clock.
 * @returns {string[]} the run keys now active.
 */
export function flyOn(instrument, options = {}) {
  const { symbol } = splitSymbol(String(instrument ?? ''))
  const wanted = symbol ? AUTOPILOT_STRATEGIES : []

  // Everything the autopilot owns comes off first, including on a focus change: a run left
  // on the previous instrument keeps consuming ticks it no longer gets and reports signals
  // about a chart nobody is looking at.
  for (const run of liveRuns()) {
    if (AUTOPILOT_STRATEGIES.includes(run.strategyId) && run.instrument !== symbol) {
      stopStrategy(run.key)
    }
  }

  const started = []
  for (const id of wanted) {
    const run = startStrategy(id, symbol, { now: options.now ?? 0 })
    if (run) started.push(run.key)
  }

  return started
}

/**
 * Arm or disarm the bot to match the desk's mode.
 *
 * @returns {boolean} whether the bot is armed after this call.
 */
export function syncArm() {
  const armed = autopilotEnabled() && paperMode()

  // Opting each strategy in as well: the runner gates on both, and an armed bot with no
  // strategy opted in is armed in name only.
  const opted = Object.fromEntries(AUTOPILOT_STRATEGIES.map((id) => [id, armed]))
  setValue(PATHS.settings.botStrategies, opted)
  setValue(PATHS.settings.botArmed, armed)

  // Dry run comes *off* on paper, and goes back on for live.
  //
  // Dry run predates paper mode, and stacking them means nothing happens twice over: dry
  // run logs an order and returns a fake id, so a paper desk produced no fills, no
  // positions and no P&L — the exact "why is nothing trading" this is here to answer.
  // Paper mode is the simulation now, and it is a stronger one, because it books the fill
  // and cannot reach a venue by construction.
  //
  // Going live puts it back, deliberately: a bot armed by hand against real money should
  // start by telling you what it *would* do. That is a safety posture, and a mode change
  // is exactly when a safety posture should reset rather than be inherited.
  setValue(PATHS.settings.botDryRun, !paperMode())

  return armed
}

/**
 * Start the autopilot and keep it pointed at the focused instrument.
 *
 * @param {{now?: number}} [options] - injected clock.
 * @returns {() => void} stop.
 */
export function startAutopilot(options = {}) {
  const point = () => {
    if (!syncArm()) {
      // Disarmed means grounded: leaving strategies running while the bot cannot act would
      // fill the log with signals nobody acted on and make the desk look busy doing nothing.
      for (const run of liveRuns()) {
        if (AUTOPILOT_STRATEGIES.includes(run.strategyId)) stopStrategy(run.key)
      }
      return
    }
    flyOn(String(appState?.market?.focus ?? ''), options)
  }

  // Re-pointed on a focus change and re-armed on a mode change, so flipping to live grounds
  // it in the same frame rather than at the next tick.
  const unfocus = watch([PATHS.market.focus], point)
  const unmode = watch([PATHS.trade.mode], point)
  point()

  log.info(`autopilot: ${AUTOPILOT_STRATEGIES.join(', ')} on paper`)
  return () => {
    unfocus?.()
    unmode?.()
    for (const run of liveRuns()) {
      if (AUTOPILOT_STRATEGIES.includes(run.strategyId)) stopStrategy(run.key)
    }
  }
}
