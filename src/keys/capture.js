import { setValue, appState } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { registerAction, dispatchAction } from '../actions/registry.js'
import { ACTIONS } from '../actions/names.js'
import { normalizeChord } from './keymap.js'
import { validateChord, findConflicts, effectiveBindings } from './overrides.js'
import { chordLabel } from './defaults.js'

/**
 * Rebinding by doing.
 *
 * Typing a chord as text ("ctrl+shift+KeyK") is a thing nobody gets right, and it makes
 * the trader translate from what their fingers do into a spelling. Recording the actual
 * press removes the translation entirely: click the field, press the keys, done.
 *
 * The conflict check runs *while* recording rather than on save, so the answer to "is
 * this key free?" arrives before the commitment rather than after it.
 */

/**
 * Whether a recorded chord may be saved.
 *
 * @param {string} chord - the chord as normalised.
 * @param {string} action - the action it would run.
 * @returns {{ok: boolean, reason: string}} the verdict.
 */
export function acceptChord(chord, action) {
  const key = String(chord ?? '')
  // A bare modifier is what `normalizeChord` returns while the trader is still reaching
  // for the real key — recording is not finished, so there is nothing to accept yet.
  if (!key) return { ok: false, reason: 'keep holding' }

  return validateChord(key, action)
}

/**
 * What the capture field should show for a press.
 *
 * @param {KeyboardEvent} event - the press.
 * @param {string} action - the action being rebound.
 * @returns {{chord: string, label: string, ok: boolean, reason: string,
 *   conflicts: string[]}} the live preview.
 */
export function capturePreview(event, action) {
  const chord = normalizeChord(event)
  const verdict = acceptChord(chord, action)
  const clashes = chord ? findConflicts(chord, effectiveBindings()) : []

  return {
    chord,
    label: chord ? chordLabel(chord) : '…',
    ok: verdict.ok,
    reason: verdict.reason,
    // Reported even when the chord is legal: taking a key from another action is allowed,
    // it just should not be a surprise.
    conflicts: clashes.filter((binding) => binding.action !== action).map((b) => b.action),
  }
}

/**
 * Register the capture actions.
 *
 * @returns {string[]} the registered action names.
 */
export function registerCaptureActions() {
  registerAction(ACTIONS.keys.capture, (_state, payload) => {
    const action = String(payload?.action ?? '')
    const recording = payload?.recording !== false && Boolean(action)

    setValue(PATHS.ui.captureFor, recording ? action : '')
    setValue(PATHS.ui.capturePreview, recording ? { chord: '', label: '…', ok: false } : null)

    return recording
  })

  registerAction(ACTIONS.keys.captureKey, (_state, payload) => {
    const action = String(appState.ui?.captureFor ?? '')
    if (!action) return false

    const preview = capturePreview(payload?.event ?? payload, action)
    setValue(PATHS.ui.capturePreview, preview)

    // Nothing is committed until the trader presses Enter: a chord that saved on the
    // first press could never be corrected, and every rebind would be final.
    return preview.ok
  })

  registerAction(ACTIONS.keys.captureSave, () => {
    const action = String(appState.ui?.captureFor ?? '')
    const preview = appState.ui?.capturePreview
    if (!action || !preview?.ok) return false

    dispatchAction(ACTIONS.keys.rebind, { chord: preview.chord, action })
    setValue(PATHS.ui.captureFor, '')
    setValue(PATHS.ui.capturePreview, null)

    return true
  })

  return [ACTIONS.keys.capture, ACTIONS.keys.captureKey, ACTIONS.keys.captureSave]
}
