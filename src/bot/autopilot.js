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
 * **The live-trading checkbox is the whole decision.** It sits behind the key modal, it
 * cannot be ticked without credentials, and ticking it is a deliberate act with an
 * unmissable label. So the autopilot keeps flying across the switch rather than grounding
 * itself: a desk that stopped trading the moment its owner said "trade for real" would be
 * a desk that does the opposite of what it was told, and the trader would reasonably
 * conclude the live mode was broken.
 *
 * What does *not* move is everything downstream. The kill switch, the daily-loss and
 * consecutive-loss breakers, the per-instrument caps and the orders-per-minute throttle
 * all apply exactly as they do on paper — live changes which adapter the order reaches,
 * not which gates it passes. And neither the mode nor the arm state is persisted, so a
 * reload always lands disarmed and on paper however the last session ended.
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
  // Opt-out rather than opt-in. On paper that is free — a paper desk that sits idle
  // teaches its owner nothing. Live, the opt-in that matters happened at the key modal,
  // where the trader entered credentials and ticked live trading.
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
  const armed = autopilotEnabled()

  // Opting each strategy in as well: the runner gates on both, and an armed bot with no
  // strategy opted in is armed in name only.
  const opted = Object.fromEntries(AUTOPILOT_STRATEGIES.map((id) => [id, armed]))
  setValue(PATHS.settings.botStrategies, opted)
  setValue(PATHS.settings.botArmed, armed)

  // Dry run comes off in both modes.
  //
  // It predates paper mode, and stacking the two means nothing happens twice over: dry run
  // logs an order and returns a fake id, so a paper desk produced no fills, no positions
  // and no P&L — the exact "why is nothing trading" this function exists to answer. Paper
  // mode is the simulation now, and a stronger one, because it books the fill and cannot
  // reach a venue by construction.
  //
  // Live, leaving dry run on would be the same bug wearing a safety label: the trader
  // ticked live trading, and a desk that answered by narrating orders it declined to send
  // has not been made safer, only quieter. The gates that actually stop a bad session —
  // breakers, caps, throttle, kill switch — are downstream of here and unchanged.
  setValue(PATHS.settings.botDryRun, false)

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

  log.info(`autopilot: ${AUTOPILOT_STRATEGIES.join(', ')} on ${paperMode() ? 'paper' : 'LIVE'}`)
  return () => {
    unfocus?.()
    unmode?.()
    for (const run of liveRuns()) {
      if (AUTOPILOT_STRATEGIES.includes(run.strategyId)) stopStrategy(run.key)
    }
  }
}
