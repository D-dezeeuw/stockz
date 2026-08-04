/**
 * The settings a trader actually edits.
 *
 * One declared schema instead of scattered defaults: the drawer renders from it, the
 * migration reads it, and reset-to-defaults means "everything back to this object". A
 * setting that is not here does not exist.
 *
 * Defaults are chosen for a *scalper*, not a general trading app — small default size,
 * sound on (fills need to be heard while the eyes are on the ladder), and paper mode,
 * because a new user's first click must not be a live order.
 */

/** Field kinds the settings drawer knows how to render. */
export const FIELD_KINDS = Object.freeze(['number', 'text', 'toggle', 'select'])

/**
 * The schema: one entry per setting, in display order.
 *
 * `group` drives the drawer's sections; `path` is the state path under `settings.`.
 */
export const SETTINGS_SCHEMA = Object.freeze([
  {
    key: 'theme',
    group: 'appearance',
    label: 'Theme',
    kind: 'select',
    options: ['night', 'day'],
    default: 'night',
  },
  {
    key: 'soundEnabled',
    group: 'appearance',
    label: 'Sounds',
    kind: 'toggle',
    default: true,
  },
  {
    key: 'defaultSize',
    group: 'trading',
    label: 'Default order size',
    kind: 'number',
    min: 0,
    step: 0.001,
    default: 0.01,
  },
  {
    key: 'sizePresets',
    group: 'trading',
    label: 'Size presets',
    kind: 'text',
    default: '0.01,0.05,0.1,0.5',
  },
  {
    key: 'priceStep',
    group: 'trading',
    label: 'Price nudge step',
    kind: 'number',
    min: 0,
    step: 0.01,
    default: 0.1,
  },
  {
    key: 'defaultMode',
    group: 'trading',
    label: 'Start in',
    kind: 'select',
    options: ['paper', 'live'],
    default: 'paper',
  },
  {
    key: 'maxDailyLoss',
    group: 'risk',
    label: 'Daily max loss',
    kind: 'number',
    min: 0,
    step: 1,
    default: 100,
  },
  {
    key: 'maxPosition',
    group: 'risk',
    label: 'Max position size',
    kind: 'number',
    min: 0,
    step: 0.01,
    default: 1,
  },
  {
    key: 'debugCharts',
    group: 'appearance',
    label: 'Chart debug grid',
    kind: 'toggle',
    default: false,
  },
  {
    key: 'spreadSpikeK',
    group: 'trading',
    label: 'Spread spike multiple',
    kind: 'number',
    min: 1.5,
    step: 0.5,
    default: 3,
  },
  {
    key: 'latencyWarnMs',
    group: 'trading',
    label: 'Feed lag warning (ms)',
    kind: 'number',
    min: 50,
    step: 50,
    default: 500,
  },
  {
    key: 'compactHud',
    group: 'appearance',
    label: 'Compact HUD row',
    kind: 'toggle',
    default: false,
  },
  {
    key: 'bookDepth',
    group: 'trading',
    label: 'Imbalance depth',
    kind: 'select',
    options: ['5', '10', '20'],
    default: '10',
  },
  {
    key: 'imbalanceThreshold',
    group: 'trading',
    label: 'Imbalance glow at',
    kind: 'number',
    min: 0,
    step: 0.05,
    default: 0.4,
  },
  {
    key: 'whaleMultiplier',
    group: 'instruments',
    label: 'Whale size multiplier',
    kind: 'number',
    min: 1,
    step: 0.5,
    default: 4,
  },
  {
    key: 'tradesPerHourTarget',
    group: 'trading',
    label: 'Target trades per hour',
    kind: 'number',
    min: 0,
    step: 5,
    default: 20,
  },
  {
    key: 'spreadLimitBps',
    group: 'trading',
    label: 'Alert when spread exceeds (bps)',
    kind: 'number',
    min: 0,
    step: 0.5,
    default: 5,
  },
  {
    key: 'sessionStartUtc',
    group: 'trading',
    label: 'Session starts (UTC hour)',
    kind: 'number',
    min: 0,
    step: 1,
    default: 0,
  },
  {
    key: 'maxDeviationBps',
    group: 'risk',
    label: 'Max distance from mid (bps)',
    kind: 'number',
    min: 0,
    step: 25,
    default: 500,
  },
  {
    key: 'maxBurst',
    group: 'risk',
    label: 'Max queued orders',
    kind: 'number',
    min: 1,
    step: 1,
    default: 8,
  },
  {
    key: 'volume',
    group: 'appearance',
    label: 'Cue volume',
    kind: 'number',
    min: 0,
    step: 0.05,
    default: 0.2,
  },
  {
    key: 'qtyPresets',
    group: 'trading',
    label: 'Size presets (% of buying power)',
    kind: 'text',
    default: '25,50,75,100',
  },
  {
    key: 'favourites',
    group: 'instruments',
    label: 'Favourite instruments',
    kind: 'text',
    default: 'BTC-USDT,ETH-USDT',
  },
])

/** The drawer's sections, in order. */
export const SETTINGS_GROUPS = Object.freeze(['appearance', 'trading', 'risk', 'instruments'])

/**
 * The complete default settings object.
 *
 * @returns {object} a fresh defaults object (never shared, so a reset cannot be poisoned).
 */
export function defaultSettings() {
  const defaults = {}
  for (const field of SETTINGS_SCHEMA) defaults[field.key] = field.default

  // Block layout is owned by the block registry, not the schema.
  defaults.blocks = []
  return defaults
}

/**
 * The schema entry for a key.
 *
 * @param {string} key - setting key.
 * @returns {object|null} the field, or null when the key is not a real setting.
 */
export function fieldFor(key) {
  return SETTINGS_SCHEMA.find((field) => field.key === key) ?? null
}

/**
 * Coerce and bound a value to what its field allows.
 *
 * Settings come from text inputs and imported JSON, so a number field can arrive as
 * `"abc"` and a toggle as `"true"`. A malformed daily-loss limit silently becoming NaN
 * would disable a circuit breaker, so unusable input falls back to the default rather
 * than being stored.
 *
 * @param {string} key - setting key.
 * @param {unknown} value - raw value.
 * @returns {unknown} the value to store.
 */
export function coerceSetting(key, value) {
  const field = fieldFor(key)
  if (!field) return undefined

  if (field.kind === 'number') {
    const num = Number(value)
    if (!Number.isFinite(num)) return field.default
    return field.min !== undefined ? Math.max(field.min, num) : num
  }

  if (field.kind === 'toggle') {
    if (typeof value === 'boolean') return value
    if (value === 'true') return true
    if (value === 'false') return false
    return field.default
  }

  if (field.kind === 'select') {
    return field.options.includes(value) ? value : field.default
  }

  return value === undefined || value === null ? field.default : String(value)
}

/**
 * Coerce a whole settings object, dropping keys that are not real settings.
 *
 * @param {object} raw - candidate settings (from storage, an import, or the drawer).
 * @returns {object} a complete, valid settings object.
 */
export function normalizeSettings(raw) {
  const input = raw && typeof raw === 'object' ? raw : {}
  const result = defaultSettings()

  for (const field of SETTINGS_SCHEMA) {
    if (field.key in input) result[field.key] = coerceSetting(field.key, input[field.key])
  }
  if (Array.isArray(input.blocks)) result.blocks = input.blocks

  return result
}

/**
 * Parse a comma-separated setting into a clean list.
 *
 * @param {string} value - e.g. '0.01, 0.05 ,0.1'.
 * @returns {string[]} trimmed, non-empty entries.
 */
export function parseList(value) {
  return String(value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
}
