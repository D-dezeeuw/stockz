import { dispatchAction } from '../actions/registry.js'
import { ACTIONS } from '../actions/names.js'

/**
 * Hold-to-repeat.
 *
 * Walking a limit price ten ticks by pressing an arrow ten times is ten chances to
 * miscount. Holding it should walk, and it should accelerate — slow at first so a short
 * press moves exactly one tick, then fast enough that a long press covers real distance.
 *
 * Only actions on the allow-list may repeat. Auto-repeating a *submit* would turn a
 * stuck key into a hundred orders, which is the single worst failure this desk could
 * have; the allow-list is what makes that structurally impossible rather than merely
 * unlikely.
 */

/** Actions that may auto-repeat under a held key. */
export const REPEATABLE = Object.freeze([ACTIONS.ticket.nudge, ACTIONS.ui.paletteMove])

/** The first repeat waits this long, so a tap is a single step. */
export const FIRST_DELAY_MS = 350

/** The floor the acceleration curve reaches. */
export const MIN_DELAY_MS = 40

/**
 * The delay before the next repeat.
 *
 * @param {number} count - repeats already fired.
 * @returns {number} milliseconds to wait.
 */
export function nextRepeatDelay(count) {
  const n = Math.max(0, Math.floor(Number(count) || 0))
  if (n === 0) return FIRST_DELAY_MS

  // Halving every two repeats: eight repeats in, it is at the floor, which is roughly a
  // second of holding to reach full speed — long enough to be deliberate.
  const eased = FIRST_DELAY_MS / 2 ** (n / 2)
  return Math.max(MIN_DELAY_MS, Math.round(eased))
}

/**
 * The step a nudge should take, given the modifiers held.
 *
 * @param {{shiftKey?: boolean, ticks?: number}} event - the key event or payload.
 * @returns {number} the signed step, in ticks.
 */
export function getNudgeStep(event) {
  const base = Number(event?.ticks)
  const signed = Number.isFinite(base) && base !== 0 ? base : 1

  // Shift is the coarse gear: ten ticks per press, for when the price has moved far
  // enough that walking it one at a time is the wrong tool.
  return signed * (event?.shiftKey ? 10 : 1)
}

/**
 * Whether an action may auto-repeat.
 *
 * @param {string} action - the action name.
 * @returns {boolean} true when repeating it is safe.
 */
export function isRepeatable(action) {
  return REPEATABLE.includes(String(action ?? ''))
}

/**
 * Create the repeat engine.
 *
 * @param {{dispatch?: Function, timer?: object}} [deps] - injectable dispatch and timers.
 * @returns {{start: Function, stop: Function, running: () => boolean,
 *   count: () => number}} the engine.
 */
export function createRepeater(deps = {}) {
  const { dispatch = dispatchAction, timer = globalThis } = deps

  let handle = null
  let count = 0
  let current = ''

  const stop = () => {
    if (handle !== null) timer.clearTimeout?.(handle)
    handle = null
    count = 0
    current = ''
    return true
  }

  const tick = (action, payload) => {
    // The delay is taken *before* the increment, so the wait after the initial press is
    // the full FIRST_DELAY_MS — that is what makes a tap exactly one step.
    const delay = nextRepeatDelay(count)
    count += 1
    dispatch(action, payload)
    handle = timer.setTimeout?.(() => tick(action, payload), delay) ?? null
  }

  return {
    /**
     * Begin repeating an action.
     *
     * @param {string} action - the action name.
     * @param {object} payload - the dispatch payload.
     * @returns {boolean} true when repeating started.
     */
    start(action, payload = {}) {
      if (!isRepeatable(action)) return false
      // Already holding this key: the browser sends repeated keydowns, and re-arming on
      // each one would restart the acceleration curve from the top.
      if (current === action && handle !== null) return true

      stop()
      current = action
      tick(action, payload)
      return true
    },
    stop,
    running: () => handle !== null,
    count: () => count,
  }
}

/**
 * Stop a repeater on every event that means the key is no longer held.
 *
 * @param {object} repeater - the engine.
 * @param {Window} [win] - the window to listen on.
 * @returns {() => void} unsubscribe.
 */
export function guardRepeat(repeater, win = globalThis.window) {
  if (!repeater?.stop || !win?.addEventListener) return () => {}

  // keyup is the normal path; blur and visibilitychange are the ones that matter. A key
  // held while the tab loses focus never sends its keyup, and a nudge that kept walking
  // in a background tab would be discovered as a filled order.
  const stop = () => repeater.stop()

  win.addEventListener('keyup', stop)
  win.addEventListener('blur', stop)
  win.document?.addEventListener?.('visibilitychange', stop)

  return () => {
    win.removeEventListener?.('keyup', stop)
    win.removeEventListener?.('blur', stop)
    win.document?.removeEventListener?.('visibilitychange', stop)
  }
}
