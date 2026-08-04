import { setValue, appState } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { registerAction } from '../actions/registry.js'
import { ACTIONS } from '../actions/names.js'
import { pushToast } from '../ui/toast.js'
import { keyPresence } from '../venues/vault.js'
import { resetPaperAccount, beginPaperReset } from './paper/account.js'
import { createHold } from '../ui/hold.js'
import { createLogger } from '../utils/log.js'

/**
 * Which money is real.
 *
 * The one piece of state on this desk where being wrong is expensive in a way no other
 * mistake is. Everything else here follows from that:
 *
 * **The mode is never ambiguous.** A banner, a header control and an accent on every
 * trading block, all reading the same value — because "I thought I was on paper" is a
 * sentence that gets said after the fact, not before.
 *
 * **Switching is atomic.** In-flight intents are cleared *before* the flip, not after: an
 * order queued a frame before the switch would otherwise be routed by whichever adapter
 * happened to be bound when it drained, and that is the one race worth actually
 * preventing here.
 *
 * **Going live is deliberate but never a dialog.** Speed is the product; a confirm step is
 * wrong by the project's own rules. A press-and-hold is the compromise — impossible to do
 * by accident, and over in six hundred milliseconds.
 */

const log = createLogger('mode')

/** The two modes. There is no third, and no "sort of live". */
export const MODES = Object.freeze(['paper', 'live'])

/** How long the LIVE segment must be held before it takes. */
export const HOLD_MS = 600

/**
 * Read a mode out of a URL query string.
 *
 * @param {string} search - `location.search`.
 * @returns {string} 'paper', 'live', or '' when the URL says nothing.
 */
export function parseModeParam(search) {
  const wanted = String(new URLSearchParams(String(search ?? '')).get('mode') ?? '')
    .trim()
    .toLowerCase()

  // A link may only ever force the *safe* direction. `?mode=live` in a URL somebody was
  // sent is a way to have a stranger's link start trading real money, and no amount of
  // convenience is worth that.
  return wanted === 'paper' ? 'paper' : ''
}

/**
 * Is the desk on fake money?
 *
 * @param {object} [state] - engine state.
 * @returns {boolean} true on paper.
 */
export function isPaper(state = appState) {
  // Anything that is not exactly 'live' is paper. An unrecognised mode must fail towards
  // the side that cannot lose money.
  return String(state?.trade?.mode ?? 'paper') !== 'live'
}

/**
 * Switch the desk between paper and live.
 *
 * @param {object} _state - engine state (unused).
 * @param {{mode?: string, value?: string}} [payload] - the mode to move to.
 * @returns {string} the mode now in force.
 */
export function setTradeMode(_state, payload = {}) {
  const wanted = String(payload?.mode ?? payload?.value ?? '').toLowerCase()
  const mode = MODES.includes(wanted) ? wanted : 'paper'
  const current = String(appState?.trade?.mode ?? 'paper')
  if (mode === current) return current

  // Going live with no credentials would fill the screen with rejections and read as the
  // desk being broken, so it is refused rather than attempted.
  if (mode === 'live' && !keyPresence().okx && !keyPresence().etoro) {
    pushToast('add venue keys before trading live', 'warn')
    return current
  }

  // The queue is emptied *before* the flip. An intent queued a frame ago would otherwise
  // drain through whichever adapter happened to be bound when it ran — which is the one
  // race in this switch that costs real money.
  const queued = (appState?.trade?.queue ?? []).length
  setValue(PATHS.trade.queue, [])
  setValue(PATHS.trade.mode, mode)

  // Choosing by hand is choosing. The first-run hint has served its purpose the moment
  // the trader touches the control it is pointing at.
  setValue(PATHS.settings.modeChosen, true)
  setValue(PATHS.ui.paperHint, false)

  log.warn(`mode → ${mode}${queued > 0 ? ` (dropped ${queued} queued)` : ''}`)
  pushToast(
    mode === 'live' ? 'LIVE — orders now go to the venue' : 'paper — orders are simulated',
    mode === 'live' ? 'warn' : 'success',
  )

  return mode
}

/**
 * The press that goes live.
 *
 * The gesture itself lives in `ui/hold.js`, shared with the practice-account wipe: two
 * actions that must be deliberate and must not be dialogs, and one implementation of what
 * "deliberate" means.
 */
const goLive = createHold({
  path: PATHS.trade.holdPct,
  ms: HOLD_MS,
  onComplete: () => setTradeMode(null, { mode: 'live' }),
})

/**
 * Begin the press-and-hold that goes live.
 *
 * @param {object} state - engine state (unused).
 * @param {object} [payload] - injectable timer and document.
 * @returns {boolean} true when a hold started.
 */
export function beginGoLive(state, payload) {
  return goLive.begin(state, payload)
}

/**
 * Abandon the press before it takes.
 *
 * @param {object} state - engine state (unused).
 * @param {object} [payload] - injectable timer and document.
 * @returns {boolean} true when a hold was cancelled.
 */
export function cancelGoLive(state, payload) {
  return goLive.cancel(state, payload)
}

/**
 * Has this desk ever been told which mode to be in?
 *
 * @param {object} [state] - engine state.
 * @returns {boolean} true when the trader has never chosen.
 */
export function isFirstRun(state = appState) {
  return state?.settings?.modeChosen !== true
}

/**
 * Start every new desk on paper, and say so once.
 *
 * The first trade on STOCKZ is always a free one. Not because paper is the safer default
 * in the abstract, but because the alternative is a stranger's first click reaching a
 * venue — and a desk that does that has no way to earn the trust it just spent.
 *
 * The hint is shown once and then never again. A permanent banner explaining the mode to
 * somebody who has been trading for a month is noise, and noise on this strip is how the
 * strip itself stops being read.
 *
 * @param {object} [state] - engine state.
 * @returns {{mode: string, hint: boolean}} what boot decided.
 */
export function applyFirstRunMode(state = appState) {
  const first = isFirstRun(state)
  if (first) setValue(PATHS.trade.mode, 'paper')
  setValue(PATHS.ui.paperHint, first)

  return { mode: first ? 'paper' : String(state?.trade?.mode ?? 'paper'), hint: first }
}

/**
 * Dismiss the first-run hint for good.
 *
 * @returns {boolean} true.
 */
export function dismissPaperHint() {
  setValue(PATHS.ui.paperHint, false)
  // Recorded in settings, which is the only persisted branch — a hint that came back on
  // every reload would be a hint nobody reads by the third time.
  setValue(PATHS.settings.modeChosen, true)

  return true
}

/**
 * Apply a mode the URL asked for, before anything binds.
 *
 * @param {string} search - `location.search`.
 * @returns {string} the mode applied, or '' when the URL said nothing.
 */
export function applyModeParam(search) {
  const mode = parseModeParam(search)
  if (!mode) return ''

  // Written directly rather than through `setTradeMode`: this runs at boot before the
  // toast host exists, and a shared link opening into paper is not news worth announcing.
  setValue(PATHS.trade.mode, mode)
  return mode
}

/** Forget any hold in progress (tests). */
export function resetMode() {
  goLive.cancel(null, {})
  return true
}

/**
 * Register the mode actions.
 *
 * @returns {string[]} the registered names.
 */
export function registerModeActions() {
  registerAction(ACTIONS.trade.setMode, setTradeMode, { description: 'Switch between paper and live' })
  registerAction(ACTIONS.trade.holdLive, beginGoLive, { description: 'Hold to go live' })
  registerAction(ACTIONS.trade.releaseLive, cancelGoLive, { description: 'Release the go-live hold' })
  registerAction(ACTIONS.trade.resetPaper, resetPaperAccount, {
    description: 'Reset the practice account to its starting stake',
  })
  registerAction(ACTIONS.trade.holdReset, beginPaperReset, {
    description: 'Hold to wipe the practice account',
  })
  registerAction(ACTIONS.trade.dismissHint, () => dismissPaperHint(), {
    description: 'Dismiss the paper-trading intro hint',
  })

  return [
    ACTIONS.trade.setMode,
    ACTIONS.trade.holdLive,
    ACTIONS.trade.releaseLive,
    ACTIONS.trade.resetPaper,
    ACTIONS.trade.holdReset,
    ACTIONS.trade.dismissHint,
  ]
}
