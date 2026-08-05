import { appState, setValue, watch } from '../app/engine.js'
import { PATHS, PERSISTED_NAMESPACES } from './paths.js'
import { createLogger } from '../utils/log.js'
import { transientSettings } from './settings-schema.js'

/**
 * Settings persistence.
 *
 * Only `settings.*` is stored. Market data, positions and orders are deliberately never
 * written to localStorage: they would be stale on the next load in a way that *looks*
 * live, and a trader acting on a resurrected position from yesterday is a real loss, not
 * a cosmetic bug.
 *
 * The store is versioned. A schema change bumps `SETTINGS_VERSION` and a migration turns
 * the old shape into the new one — a trader should never lose their layout because the
 * desk shipped a new field.
 */

const log = createLogger('persist')

/** Bumped whenever the persisted shape changes; drives migration. */
export const SETTINGS_VERSION = 2

/** localStorage key. */
export const STORAGE_KEY = 'stockz.settings.v1'

/**
 * Read persisted settings.
 *
 * Corrupt or unreadable storage returns null rather than throwing: a broken cache must
 * degrade to defaults, never stop the desk from booting.
 *
 * @param {Storage} [storage] - storage to read from.
 * @returns {{version: number, settings: object}|null} the stored payload, or null.
 */
export function loadSettings(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem?.(STORAGE_KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || typeof parsed.settings !== 'object') return null

    return { version: Number(parsed.version) || 0, settings: parsed.settings }
  } catch (err) {
    log.warn(`unreadable settings: ${err?.message ?? err}`)
    return null
  }
}

/**
 * Write settings to storage.
 *
 * Storage failures (private mode, quota) are logged and swallowed — losing a preference
 * is an inconvenience, and it must never interrupt trading.
 *
 * @param {object} settings - the settings branch.
 * @param {Storage} [storage] - storage to write to.
 * @returns {boolean} true when the write succeeded.
 */
export function saveSettings(settings, storage = globalThis.localStorage) {
  try {
    storage?.setItem?.(
      STORAGE_KEY,
      JSON.stringify({ version: SETTINGS_VERSION, settings: settings ?? {} }),
    )
    return true
  } catch (err) {
    log.warn(`could not save settings: ${err?.message ?? err}`)
    return false
  }
}

/**
 * Bring a stored payload up to the current schema version.
 *
 * @param {{version: number, settings: object}|null} payload - what was stored.
 * @returns {object} settings in the current shape ({} when there is nothing usable).
 */
export function migrateSettings(payload) {
  if (!payload?.settings) return {}

  const settings = { ...payload.settings }

  // v0 (pre-versioning) stored the theme as a bare boolean `dark`.
  if ((payload.version ?? 0) < 1) {
    if ('dark' in settings) {
      settings.theme = settings.dark ? 'night' : 'day'
      delete settings.dark
    }
  }

  // v1 → v2: drop the stored `okxEea` so the new EU-first default applies. The persist
  // watcher saves the *whole* settings branch on any change, so every v1 boot stamped
  // `okxEea: false` into storage without anybody choosing it — and a stored value beats a
  // schema default on restore, which would have made "the EU platform is now the default"
  // a change no existing browser could ever receive. A v2 store keeps whatever the trader
  // sets from here on; only the auto-stamped v1 value is discarded.
  if ((payload.version ?? 0) < 2) {
    delete settings.okxEea
  }

  return settings
}

/**
 * Apply stored settings into state, before the first paint.
 *
 * @param {Storage} [storage] - storage to read from.
 * @returns {string[]} the paths restored.
 */
export function restoreSettings(storage = globalThis.localStorage) {
  const settings = migrateSettings(loadSettings(storage))
  const transient = new Set(transientSettings())
  const restored = []

  for (const [key, value] of Object.entries(settings)) {
    // Some settings are stored and deliberately not restored — the auto-trade arm switch
    // above all. Boot must be the safe state whatever the last session ended in.
    if (transient.has(key)) continue

    const path = `settings.${key}`
    setValue(path, value)
    restored.push(path)
  }

  if (restored.length > 0) log.debug(`restored ${restored.length} settings`)
  return restored
}

/**
 * Keep storage in step with the settings branch.
 *
 * @param {Storage} [storage] - storage to write to.
 * @returns {(state: object) => boolean} the watcher that was registered.
 */
export function persistSettings(storage = globalThis.localStorage) {
  const watcher = (state) => saveSettings(state?.settings, storage)

  // *Every* declared setting, not two of them.
  //
  // This watched `theme` and `blocks` alone, which meant a change to anything else — the
  // market mode, the bot's rate and caps, the backtest fill assumptions, the practice
  // stake, the alert list — was written to state, rendered, and then lost on reload,
  // unless the trader happened to also change the theme or drag a block in the same
  // session. The whole settings object was being saved; it was just almost never being
  // asked to save.
  //
  // Derived from `PATHS.settings` rather than listed, so a setting added later is
  // persisted by existing rather than by somebody remembering to add it here.
  watch(Object.values(PATHS.settings), watcher)
  return watcher
}

/**
 * Whether a namespace is allowed into storage — the guard that keeps live trading data
 * out of a browser store.
 *
 * @param {string} namespace - state namespace.
 * @returns {boolean} true when persistence is allowed.
 */
export function isPersistable(namespace) {
  return PERSISTED_NAMESPACES.includes(String(namespace ?? '').split('.')[0])
}

/**
 * The settings branch as it currently stands.
 *
 * @returns {object} the settings object (never undefined).
 */
export function currentSettings() {
  return appState?.settings ?? {}
}
