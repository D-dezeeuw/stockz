import { pushToast } from '../ui/toast.js'
import { appState } from '../app/engine.js'
import { isTerminal } from './lifecycle.js'

/**
 * Order feedback — knowing what happened without looking away from the tape.
 *
 * Two channels, because the eye is busy. A toast says what happened for the trader who
 * glances; a tone says it for the one who does not. The tones are generated rather than
 * loaded: three oscillator blips need no asset, no fetch, and no decode, so the fill
 * sound lands in the same frame as the fill.
 *
 * Coalescing matters more here than anywhere else on the desk. Twenty scalps in a minute
 * is twenty toasts, which is a wall of cards over the chart — exactly the information
 * hiding the information.
 */

/** Cue shapes per outcome: [frequency Hz, duration ms, type]. */
export const CUES = Object.freeze({
  fill: Object.freeze({ freq: 880, ms: 90, type: 'sine' }),
  ack: Object.freeze({ freq: 440, ms: 45, type: 'triangle' }),
  reject: Object.freeze({ freq: 160, ms: 180, type: 'square' }),
})

/**
 * The toast an order state deserves.
 *
 * @param {object} order - the order after the event.
 * @returns {{message: string, level: string, cue: string}|null} the feedback, or null
 *   for states not worth interrupting for.
 */
export function orderToast(order) {
  const state = String(order?.state ?? '')
  const side = String(order?.side ?? '').toUpperCase()
  const size = order?.filled || order?.sz || ''
  const inst = String(order?.instId ?? '')

  if (state === 'filled') {
    return {
      message: `filled ${side} ${size} ${inst}${order?.avgPx ? ` @ ${order.avgPx}` : ''}`.trim(),
      level: 'success',
      cue: 'fill',
    }
  }
  if (state === 'rejected') {
    return { message: `rejected: ${order?.reason ?? 'unknown'}`, level: 'error', cue: 'reject' }
  }
  if (state === 'cancelled') {
    return { message: `cancelled ${side} ${inst}`.trim(), level: 'warn', cue: 'ack' }
  }
  // 'live' and 'partial' are not interruptions: the order row already shows them, and a
  // toast per partial on a sweeping fill is pure noise.
  return null
}

/**
 * Merge identical toasts that arrive together.
 *
 * @param {Array<{message: string, ts: number, count?: number}>} toasts - recent toasts.
 * @param {{message: string, ts: number}} next - the incoming toast.
 * @param {number} [windowMs] - how close counts as together.
 * @returns {Array<object>} the new list.
 */
export function coalesceToasts(toasts, next, windowMs = 500) {
  const list = Array.isArray(toasts) ? toasts : []
  if (!next?.message) return list

  const last = list[list.length - 1]
  const together =
    last?.message === next.message && Math.abs(Number(next.ts) - Number(last?.ts ?? 0)) <= windowMs

  if (!together) return [...list, { ...next, count: 1 }]

  // One card with a counter rather than twenty cards: a burst of identical fills is one
  // event as far as the trader is concerned.
  const merged = list.slice(0, -1)
  return [...merged, { ...last, ts: next.ts, count: (last.count ?? 1) + 1 }]
}

/**
 * Play an outcome cue.
 *
 * @param {string} kind - a key of CUES.
 * @param {{ctx?: object, volume?: number, now?: number}} [options] - audio plumbing.
 * @returns {boolean} true when a tone was scheduled.
 */
export function playCue(kind, options = {}) {
  const cue = CUES[kind]
  const volume = Number(options.volume ?? appState.settings?.volume ?? 0.2)
  // Muted is a real setting, not an oversight: a desk in an open office runs silent, and
  // it must cost nothing rather than playing at zero gain.
  if (!cue || !(volume > 0)) return false

  const ctx = options.ctx ?? makeAudioContext()
  if (!ctx?.createOscillator) return false

  const start = Number(options.now ?? ctx.currentTime ?? 0)
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()

  osc.type = cue.type
  osc.frequency.value = cue.freq
  gain.gain.value = Math.min(1, volume)

  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(start)
  osc.stop(start + cue.ms / 1000)

  return true
}

/**
 * The shared audio context, created on first use.
 *
 * @param {object} [scope] - the global scope.
 * @returns {object|null} an AudioContext, or null where audio is unavailable.
 */
export function makeAudioContext(scope = globalThis) {
  const Ctor = scope?.AudioContext ?? scope?.webkitAudioContext
  if (typeof Ctor !== 'function') return null

  // One context for the session. Browsers cap how many a page may create, and a scalping
  // session can produce hundreds of cues.
  audioContext ??= new Ctor()
  return audioContext
}

let audioContext = null

/**
 * Announce an order's outcome through both channels.
 *
 * @param {object} order - the order after the event.
 * @param {{now?: number, volume?: number, ctx?: object}} [options] - plumbing.
 * @returns {object|null} the feedback that was delivered.
 */
export function announceOrder(order, options = {}) {
  // Only terminal states are announced: an order that is still working is described by
  // the order row, and interrupting for it teaches the trader to ignore interruptions.
  if (!isTerminal(order)) return null

  const feedback = orderToast(order)
  if (!feedback) return null

  pushToast(feedback.message, feedback.level, options.now ?? 0)
  playCue(feedback.cue, options)

  return feedback
}

/** Drop the shared audio context — tests, and a desk that has gone silent. */
export function resetAudio() {
  audioContext = null
  return true
}
