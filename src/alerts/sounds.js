import { appState, setValue } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { makeAudioContext } from '../ticket/feedback.js'
import { alertEnabled } from './bus.js'
import { mayInterrupt } from './dnd.js'

/**
 * The alert sound pack.
 *
 * The eye is on the tape. Sound is the only channel that reaches a trader who is not
 * looking, which makes it the most valuable output on the desk and the easiest to ruin.
 *
 * The pack is built around one rule: **the sounds must be distinguishable without being
 * learned**. A rising interval for a buy and the same interval falling for a sell is a
 * mapping nobody has to memorise, because it is the mapping the words already imply. The
 * error buzz is low and rough where everything else is high and clean, so it cannot be
 * mistaken for a fill even at the edge of hearing.
 *
 * The AudioContext is shared with the order cues from phase 15 — browsers cap how many a
 * page may create, and a scalping session produces hundreds of tones. And it starts
 * *suspended*: browsers refuse to play audio before a gesture, so the desk unlocks on the
 * first click or key rather than silently failing and looking broken.
 */

/**
 * The pack. Each is a list of `[frequency, startOffsetMs, durationMs, type]` steps.
 *
 * Two tones rather than one for the directional pair: a single blip is a sound, an
 * interval is a *direction*, and direction is the thing that has to survive not looking.
 */
export const SOUNDS = Object.freeze({
  buy: Object.freeze([
    Object.freeze({ freq: 660, at: 0, ms: 60, type: 'sine' }),
    Object.freeze({ freq: 990, at: 55, ms: 80, type: 'sine' }),
  ]),
  sell: Object.freeze([
    Object.freeze({ freq: 990, at: 0, ms: 60, type: 'sine' }),
    Object.freeze({ freq: 660, at: 55, ms: 80, type: 'sine' }),
  ]),
  alert: Object.freeze([
    Object.freeze({ freq: 1320, at: 0, ms: 40, type: 'sine' }),
    Object.freeze({ freq: 1320, at: 90, ms: 40, type: 'sine' }),
  ]),
  // Low and rough where everything else is high and clean: an error must not be mistakable
  // for a fill at the edge of hearing.
  error: Object.freeze([Object.freeze({ freq: 110, at: 0, ms: 260, type: 'sawtooth' })]),
})

/** Severity → sound, for anything the bus emits without a direction. */
export const SEVERITY_SOUNDS = Object.freeze({
  info: 'alert',
  success: 'buy',
  warn: 'alert',
  error: 'error',
})

/**
 * Play one step of a pack entry.
 *
 * @param {object} ctx - the AudioContext.
 * @param {object} step - the step.
 * @param {number} start - when to begin, in context time.
 * @param {number} volume - 0..1.
 * @returns {boolean} true when it was scheduled.
 */
export function scheduleTone(ctx, step, start, volume) {
  if (!ctx?.createOscillator || !step) return false

  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  const at = Number(start) + Number(step.at ?? 0) / 1000
  const level = Math.min(1, Math.max(0, Number(volume) || 0))

  osc.type = String(step.type ?? 'sine')
  osc.frequency.value = Number(step.freq) || 440
  gain.gain.value = level

  // A hard stop on a raw oscillator clicks — the waveform is cut mid-cycle. The ramp is
  // what makes a hundred of these an hour bearable rather than fatiguing.
  gain.gain.setValueAtTime?.(level, at)
  gain.gain.exponentialRampToValueAtTime?.(0.0001, at + Number(step.ms ?? 80) / 1000)

  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(at)
  osc.stop(at + Number(step.ms ?? 80) / 1000)

  return true
}

/**
 * Play a sound from the pack.
 *
 * @param {string} name - a key of SOUNDS.
 * @param {{ctx?: object, volume?: number}} [options] - audio plumbing.
 * @returns {number} how many tones were scheduled.
 */
export function playSound(name, options = {}) {
  const steps = SOUNDS[String(name ?? '')]
  const volume = Number(options.volume ?? appState.settings?.volume ?? 0.2)
  // Muted is a real setting, not an oversight: a desk in an open office runs silent, and
  // that must cost nothing rather than playing at zero gain.
  if (!steps || !(volume > 0)) return 0

  const ctx = options.ctx ?? makeAudioContext()
  if (!ctx?.createOscillator) return 0

  // A suspended context cannot play, and scheduling into one is not merely wasted — the
  // browser logs a warning per attempt, and the tones stay *queued* against a clock that
  // is not running. The desk connects its venue socket at boot, which emits a
  // venue-transition alert before any click has happened; every one of those tones would
  // fire at once the moment the trader's first click unlocked audio.
  //
  // `suspended` is checked rather than `ui.audioReady`, because the browser is the
  // authority on whether it will make a sound and the state flag is only our belief
  // about it.
  if (ctx.state && ctx.state !== 'running') return 0

  const start = Number(ctx.currentTime) || 0
  let played = 0
  for (const step of steps) {
    if (scheduleTone(ctx, step, start, volume)) played += 1
  }

  return played
}

/**
 * Which sound an alert should make.
 *
 * @param {object} alert - a bus alert.
 * @returns {string} a key of SOUNDS, or '' for silence.
 */
export function soundForAlert(alert) {
  const kind = String(alert?.kind ?? '')
  // A directional signal gets the directional sound: the trader learns "up means buy"
  // once and never has to think about it again.
  if (kind === 'buy') return 'buy'
  if (kind === 'sell') return 'sell'
  if (kind === 'fill') return 'buy'
  if (kind === 'reject' || kind === 'disconnect') return 'error'

  return SEVERITY_SOUNDS[String(alert?.severity ?? '')] ?? ''
}

/**
 * Resume the shared context and record that audio is live.
 *
 * @param {object} [scope] - the global scope.
 * @returns {boolean} true when there is a context to play through.
 */
export function resumeAudio(scope = globalThis) {
  const ctx = makeAudioContext(scope)
  // `resume()` is a promise the browser may reject when there was still no gesture, and
  // swallowing it is right: a failed unlock is not something to tell a trader about,
  // because the next click will try again.
  ctx?.resume?.()?.catch?.(() => {})

  // Running, not merely existing. A context is created suspended and stays that way until
  // a gesture unlocks it, so reporting readiness from its existence claimed the desk could
  // make a sound from the moment it booted — and every alert until the first click was
  // silently dropped by the browser while the flag said otherwise.
  const ready = Boolean(ctx) && (!ctx.state || ctx.state === 'running')
  setValue(PATHS.ui.audioReady, ready)

  return ready
}

/**
 * Unlock audio on the first gesture.
 *
 * @param {object} [scope] - the global scope.
 * @returns {() => void} a teardown.
 */
export function unlockAudio(scope = globalThis) {
  const target = scope?.document ?? scope
  if (typeof target?.addEventListener !== 'function') return () => {}

  const off = () => {
    target.removeEventListener?.('pointerdown', unlock)
    target.removeEventListener?.('keydown', unlock)
  }

  function unlock() {
    resumeAudio(scope)
    off()
  }

  // Both gestures, either one unlocks: a trader who reaches for a hotkey before touching
  // the mouse should not have a silent desk.
  target.addEventListener('pointerdown', unlock, { once: true })
  target.addEventListener('keydown', unlock, { once: true })

  return off
}

/**
 * Play the sound an alert deserves.
 *
 * @param {object} alert - a bus alert.
 * @param {{ctx?: object, volume?: number}} [options] - audio plumbing.
 * @returns {string} the sound played, or '' for silence.
 */
export function soundAlert(alert, options = {}) {
  const name = soundForAlert(alert)
  if (!name) return ''
  if (!mayInterrupt(alert, Number(options.now) || Date.now())) return ''
  // Sound has its own mute group. A trader who wants the toast but not the noise is the
  // common case in an office, and forcing one to imply the other loses them both.
  if (!alertEnabled('sound', String(alert?.severity ?? 'info'))) return ''

  return playSound(name, options) > 0 ? name : ''
}

/**
 * Play a sound for every bus alert.
 *
 * @param {(fn: Function) => Function} subscribe - the bus subscription.
 * @returns {() => void} unsubscribe.
 */
export function wireAlertSounds(subscribe) {
  if (typeof subscribe !== 'function') return () => {}

  // One subscription, like the toasts: a new alert type must not need a new wire into
  // every output.
  return subscribe((alert) => soundAlert(alert))
}
