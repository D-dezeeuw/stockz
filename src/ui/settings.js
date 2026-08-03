import { setValue, appState, checkpoint, replay, history } from '../app/engine.js'
import { registerAction } from '../actions/registry.js'
import { ACTIONS } from '../actions/names.js'
import {
  SETTINGS_SCHEMA,
  SETTINGS_GROUPS,
  defaultSettings,
  coerceSetting,
  normalizeSettings,
} from '../state/settings-schema.js'
import { PATHS } from '../state/paths.js'
import { commitBlocks, currentBlocks } from '../blocks/registry.js'
import { pushToast } from './toast.js'
import { createLogger } from '../utils/log.js'

/**
 * Settings editing.
 *
 * Every write goes through `coerceSetting`, so a value typed into the drawer and a value
 * arriving from an imported file get identical treatment — the drawer is not a trusted
 * source just because a human used it.
 *
 * Reset takes a `checkpoint()` first. Undo here is the engine's time-travel rather than a
 * copy of the old object: it is the same mechanism the trade journal uses, so there is
 * one way to go back, not two.
 */

const log = createLogger('settings')

/** History index captured before the last destructive settings change. */
let undoPoint = null

/**
 * The drawer's fields, grouped for rendering.
 *
 * @param {object} [settings] - current values; defaults to state.
 * @returns {Array<{group: string, fields: object[]}>} groups in display order.
 */
export function settingsGroups(settings = appState?.settings ?? {}) {
  return SETTINGS_GROUPS.map((group) => ({
    group,
    fields: SETTINGS_SCHEMA.filter((field) => field.group === group).map((field) => ({
      ...field,
      value: settings[field.key] ?? field.default,
    })),
  }))
}

/**
 * Change one setting.
 *
 * @param {object} _state - engine state (unused).
 * @param {{key?: string, value?: unknown}} [payload] - which setting and its new value.
 * @returns {unknown} the stored value, or null when the key is not a real setting.
 */
export function updateSetting(_state, payload = {}) {
  const { key, value } = payload
  const coerced = coerceSetting(key, value)

  if (coerced === undefined) {
    log.warn(`unknown setting "${key}"`)
    return null
  }

  setValue(`settings.${key}`, coerced)
  return coerced
}

/**
 * Restore every setting to its default, with one undo available.
 *
 * @param {object} _state - engine state (unused).
 * @returns {object} the settings now in force.
 */
export function resetSettings() {
  undoPoint = history.length
  checkpoint('settings:before-reset')

  const defaults = defaultSettings()
  for (const [key, value] of Object.entries(defaults)) {
    if (key !== 'blocks') setValue(`settings.${key}`, value)
  }

  pushToast('settings reset — undo available', 'warn')
  return defaults
}

/**
 * Undo the last reset by replaying history to the moment before it.
 *
 * @returns {boolean} true when there was something to undo.
 */
export function undoSettingsReset() {
  if (undoPoint === null || undoPoint > history.length) return false

  replay(undoPoint)
  undoPoint = null
  return true
}

/**
 * Serialize settings for a file the trader can keep or move to another machine.
 *
 * Block layout rides along, because "my settings" means the desk as it looked.
 *
 * @param {object} [settings] - settings to export; defaults to state.
 * @returns {string} pretty JSON.
 */
export function exportSettings(settings = appState?.settings ?? {}) {
  return JSON.stringify(
    { version: 1, exportedAt: 0, settings: { ...settings, blocks: currentBlocks() } },
    null,
    2,
  )
}

/**
 * Load settings from an exported file.
 *
 * Everything is normalised on the way in: an imported file is untrusted input, and a
 * hand-edited risk limit must not land in state unchecked.
 *
 * @param {string} json - file contents.
 * @returns {{ok: boolean, settings?: object, error?: string}} the outcome.
 */
export function importSettings(json) {
  let parsed
  try {
    parsed = JSON.parse(String(json ?? ''))
  } catch (err) {
    return { ok: false, error: `not valid JSON: ${err?.message ?? err}` }
  }

  const raw = parsed?.settings ?? parsed
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'no settings in file' }

  const settings = normalizeSettings(raw)
  for (const [key, value] of Object.entries(settings)) {
    if (key !== 'blocks') setValue(`settings.${key}`, value)
  }
  if (Array.isArray(settings.blocks) && settings.blocks.length > 0) commitBlocks(settings.blocks)

  return { ok: true, settings }
}

/**
 * Save the current block arrangement under a name.
 *
 * @param {string} name - preset name.
 * @param {object} [presets] - existing presets; defaults to state.
 * @returns {object} the presets after saving.
 */
export function saveLayoutPreset(name, presets = appState?.settings?.presets ?? {}) {
  const key = String(name ?? '').trim()
  if (!key) return presets

  const next = { ...presets, [key]: currentBlocks() }
  setValue(PATHS.settings.presets, next)
  return next
}

/**
 * Apply a saved layout.
 *
 * @param {string} name - preset name.
 * @param {object} [presets] - available presets; defaults to state.
 * @returns {boolean} true when the preset existed and was applied.
 */
export function applyLayoutPreset(name, presets = appState?.settings?.presets ?? {}) {
  const blocks = presets?.[String(name ?? '')]
  if (!Array.isArray(blocks)) return false

  commitBlocks(blocks)
  return true
}

/**
 * Register the settings actions.
 *
 * @returns {string[]} names registered by this call.
 */
export function registerSettingsActions() {
  return [
    registerAction(ACTIONS.settings.update, updateSetting, {
      description: 'Change one setting',
    }),
    registerAction(ACTIONS.settings.reset, resetSettings, {
      description: 'Restore default settings (undoable)',
    }),
  ]
}
