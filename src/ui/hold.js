import { setValue } from '../app/engine.js'

/**
 * Press-and-hold, as a reusable thing.
 *
 * This desk has two actions that must be deliberate and must not be dialogs: going live,
 * and wiping the practice account. A confirm step is wrong by the project's own rules —
 * speed is the product — but both are expensive enough that a stray click cannot be
 * allowed to do them. A hold is the only gesture that is both.
 *
 * Three details make it honest rather than decorative:
 *
 * 1. **The ring fills from the timer.** A CSS animation running beside the timeout would
 *    finish at a different moment than the action, and the trader would learn to trust the
 *    wrong one.
 * 2. **Release listens on the document.** A pointer that goes down on the button and up
 *    somewhere else is a person changing their mind, and binding release to the button
 *    would fire anyway.
 * 3. **Both listeners are removed on cancel.** The one that did *not* fire —
 *    `pointercancel` when the press ended in a `pointerup` — would otherwise stay armed
 *    and kill the next hold before it started.
 */

/**
 * Create a hold controller.
 *
 * @param {{path: string, ms: number, onComplete: Function}} config - the gesture.
 * @returns {{begin: Function, cancel: Function, active: () => boolean}} the controller.
 */
export function createHold(config = {}) {
  const path = String(config.path ?? '')
  const holdMs = Number(config.ms) > 0 ? Number(config.ms) : 600
  const onComplete = typeof config.onComplete === 'function' ? config.onComplete : () => {}
  let held = null

  const cancel = (_state, payload = {}) => {
    if (!held) return false

    const timer = payload.timer ?? held.timer ?? globalThis
    timer.clearTimeout?.(held.handle)
    timer.clearInterval?.(held.interval)

    const doc = payload.doc ?? held.doc
    if (held.release && doc?.removeEventListener) {
      doc.removeEventListener('pointerup', held.release)
      doc.removeEventListener('pointercancel', held.release)
    }

    held = null
    if (path) setValue(path, 0)
    return true
  }

  const begin = (_state, payload = {}) => {
    // A second press while one is running is the same press, not a second timer. Two
    // timers would fire the action twice.
    if (held) return true

    const timer = payload.timer ?? globalThis
    const now = typeof payload.now === 'function' ? payload.now : () => Date.now()
    const ms = Number(payload.holdMs) > 0 ? Number(payload.holdMs) : holdMs
    const doc = payload.doc ?? globalThis.document
    const started = now()

    if (path) setValue(path, 0)

    held = {
      timer,
      doc,
      interval: timer.setInterval?.(() => {
        if (path) setValue(path, Math.min(1, (now() - started) / ms))
      }, 40),
      handle: timer.setTimeout?.(() => {
        cancel(null, { timer, doc })
        onComplete(payload)
      }, ms),
      release: null,
    }

    if (doc?.addEventListener) {
      const release = () => cancel(null, { timer, doc })
      held.release = release
      doc.addEventListener('pointerup', release, { once: true })
      doc.addEventListener('pointercancel', release, { once: true })
    }

    return true
  }

  return { begin, cancel, active: () => held !== null }
}
