import { setValue, appState } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { registerAction } from '../actions/registry.js'
import { ACTIONS } from '../actions/names.js'
import { pushToast } from '../ui/toast.js'
import { keyPresence } from '../venues/vault.js'
import { resetPaperAccount } from './paper/account.js'
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

  log.warn(`mode → ${mode}${queued > 0 ? ` (dropped ${queued} queued)` : ''}`)
  pushToast(
    mode === 'live' ? 'LIVE — orders now go to the venue' : 'paper — orders are simulated',
    mode === 'live' ? 'warn' : 'success',
  )

  return mode
}

/** The LIVE segment's press, if one is in progress. */
let holding = null

/**
 * Begin the press-and-hold that goes live.
 *
 * @param {object} _state - engine state (unused).
 * @param {{timer?: object, now?: () => number, holdMs?: number}} [payload] - injectable timer.
 * @returns {boolean} true when a hold started.
 */
export function beginGoLive(_state, payload = {}) {
  if (holding) return true

  const timer = payload.timer ?? globalThis
  const holdMs = Number(payload.holdMs) > 0 ? Number(payload.holdMs) : HOLD_MS

  // The ring fills from state, so the progress a trader sees is the progress the timer is
  // actually keeping rather than a CSS animation running beside it.
  setValue(PATHS.trade.holdPct, 0)
  const started = typeof payload.now === 'function' ? payload.now() : Date.now()

  const tickHold = () => {
    const elapsed = (typeof payload.now === 'function' ? payload.now() : Date.now()) - started
    setValue(PATHS.trade.holdPct, Math.min(1, elapsed / holdMs))
  }

  holding = {
    interval: timer.setInterval?.(tickHold, 40),
    handle: timer.setTimeout?.(() => {
      cancelGoLive(null, payload)
      setTradeMode(null, { mode: 'live' })
    }, holdMs),
    timer,
    release: null,
  }

  // Released on the *document*, not on the button. A pointer that goes down on LIVE and up
  // somewhere else — which is what a hesitant press looks like — would otherwise leave the
  // timer running and go live after the trader had visibly changed their mind.
  const doc = payload.doc ?? globalThis.document
  if (doc?.addEventListener) {
    const release = () => cancelGoLive(null, { ...payload, doc })
    holding.release = release
    doc.addEventListener('pointerup', release, { once: true })
    doc.addEventListener('pointercancel', release, { once: true })
  }

  return true
}

/**
 * Abandon the press before it takes.
 *
 * @param {object} _state - engine state (unused).
 * @param {{timer?: object}} [payload] - injectable timer.
 * @returns {boolean} true when a hold was cancelled.
 */
export function cancelGoLive(_state, payload = {}) {
  if (!holding) return false

  const timer = payload.timer ?? holding.timer ?? globalThis
  timer.clearTimeout?.(holding.handle)
  timer.clearInterval?.(holding.interval)

  const doc = payload.doc ?? globalThis.document
  if (holding.release && doc?.removeEventListener) {
    // Removed as well as `once`: the listener that did *not* fire — pointercancel when the
    // press ended in a pointerup — would otherwise stay armed and cancel the next hold.
    doc.removeEventListener('pointerup', holding.release)
    doc.removeEventListener('pointercancel', holding.release)
  }

  holding = null
  setValue(PATHS.trade.holdPct, 0)

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
  holding = null
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

  return [
    ACTIONS.trade.setMode,
    ACTIONS.trade.holdLive,
    ACTIONS.trade.releaseLive,
    ACTIONS.trade.resetPaper,
  ]
}
