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
    key: 'dnd',
    group: 'appearance',
    label: 'Do not disturb',
    kind: 'toggle',
    default: false,
  },
  {
    key: 'bypassCritical',
    group: 'appearance',
    label: 'Let errors through DND',
    kind: 'toggle',
    default: true,
  },
  {
    key: 'snoozeUntil',
    group: 'appearance',
    label: 'Snoozed until',
    kind: 'number',
    min: 0,
    step: 1,
    default: 0,
  },
  {
    key: 'autopilot',
    group: 'risk',
    label: 'Autopilot: run strategies automatically (paper, and live once ticked)',
    kind: 'toggle',
    default: true,
  },
  {
    key: 'botArmed',
    group: 'risk',
    label: 'Auto-trade armed',
    kind: 'toggle',
    default: false,
    // Never restored. A bot that came back armed because it was armed yesterday is the
    // single most dangerous default this desk could have, and "the trader will notice" is
    // not a safety mechanism.
    transient: true,
  },
  {
    key: 'botSize',
    group: 'risk',
    label: 'Auto-trade size',
    kind: 'number',
    min: 0,
    step: 0.001,
    default: 0.01,
  },
  {
    key: 'botSizeRule',
    group: 'risk',
    label: 'Auto-trade sizing',
    kind: 'select',
    options: ['fixed', 'equityPct'],
    default: 'fixed',
  },
  {
    key: 'botEquityPct',
    group: 'risk',
    label: 'Auto-trade % of buying power',
    kind: 'number',
    min: 0,
    step: 0.5,
    default: 2,
  },
  {
    key: 'botOrderType',
    group: 'risk',
    label: 'Auto-trade order type',
    kind: 'select',
    options: ['market', 'limit'],
    default: 'market',
  },
  {
    key: 'botOffsetTicks',
    group: 'risk',
    label: 'Auto-trade limit offset (ticks)',
    kind: 'number',
    min: 0,
    step: 1,
    default: 1,
  },
  {
    key: 'paperLatencyMs',
    group: 'trading',
    // Off by default: the realism is worth having, but a beginner's first ten orders
    // should not feel broken. Choosing the delay is what makes it a lesson.
    label: 'Practice order latency (ms, 0 = instant)',
    kind: 'number',
    min: 0,
    step: 5,
    default: 0,
  },
  {
    key: 'paperLatencyJitter',
    group: 'trading',
    label: 'Practice latency jitter (0-1)',
    kind: 'number',
    min: 0,
    step: 0.05,
    default: 0.3,
  },
  {
    key: 'paperStartBalance',
    group: 'trading',
    label: 'Practice account starting stake',
    kind: 'number',
    min: 1,
    step: 100,
    default: 10000,
  },
  {
    key: 'btSpreadBps',
    group: 'backtest',
    label: 'Backtest: assumed spread (bps) when a tick has no book',
    kind: 'number',
    min: 0,
    step: 0.1,
    default: 2,
  },
  {
    key: 'btLatencyMs',
    group: 'backtest',
    // Deliberately not zero. A zero-latency backtest is a time machine, and every
    // strategy is profitable in one.
    label: 'Backtest: order latency (ms)',
    kind: 'number',
    min: 0,
    step: 1,
    default: 40,
  },
  {
    key: 'btSlippageBps',
    group: 'backtest',
    label: 'Backtest: taker slippage (bps)',
    kind: 'number',
    min: 0,
    step: 0.1,
    default: 1,
  },
  {
    key: 'btSize',
    group: 'backtest',
    label: 'Backtest: clip size',
    kind: 'number',
    min: 0.00000001,
    step: 0.01,
    default: 1,
  },
  {
    key: 'btOrderType',
    group: 'backtest',
    label: 'Backtest: order type',
    kind: 'select',
    options: ['market', 'limit'],
    default: 'market',
  },
  {
    key: 'btVenue',
    group: 'backtest',
    label: 'Backtest: fee schedule',
    kind: 'select',
    options: ['okx', 'etoro'],
    default: 'okx',
  },
  {
    key: 'marketMode',
    group: 'risk',
    label: 'Market mode (sets the order rate)',
    kind: 'select',
    options: ['quiet', 'normal', 'volatile'],
    default: 'volatile',
  },
  {
    key: 'botMaxPerMin',
    group: 'risk',
    label: 'Auto-trade orders per minute',
    kind: 'number',
    min: 1,
    step: 1,
    // Matches the default market mode. The throttle binds long before any other limit -
    // signals arrive in clusters, and a low ceiling throws away the tail of every burst.
    default: 120,
  },
  {
    key: 'botCooldownAfter',
    group: 'risk',
    label: 'Cool down after N losses',
    kind: 'number',
    min: 1,
    step: 1,
    default: 3,
  },
  {
    key: 'botCooldownMinutes',
    group: 'risk',
    label: 'Cooldown minutes',
    kind: 'number',
    min: 1,
    step: 1,
    default: 10,
  },
  {
    key: 'botMaxPerInstrument',
    group: 'risk',
    label: 'Auto-trade cap per instrument',
    kind: 'number',
    min: 0,
    step: 0.01,
    default: 1,
  },
  {
    key: 'botDryRun',
    group: 'risk',
    label: 'Auto-trade dry run',
    kind: 'toggle',
    default: true,
  },
  {
    key: 'maxConsecLosses',
    group: 'risk',
    label: 'Pause after N losses (0 = off)',
    kind: 'number',
    min: 0,
    step: 1,
    default: 5,
  },
  {
    key: 'pauseMinutes',
    group: 'risk',
    label: 'Pause length in minutes (0 = until cleared)',
    kind: 'number',
    min: 0,
    step: 1,
    default: 15,
  },
  {
    key: 'maxDays',
    group: 'risk',
    label: 'Keep journal days (0 = forever)',
    kind: 'number',
    min: 0,
    step: 1,
    default: 90,
  },
  {
    key: 'maxTrades',
    group: 'risk',
    label: 'Keep trades (0 = all)',
    kind: 'number',
    min: 0,
    step: 100,
    default: 5000,
  },
  {
    key: 'maxCheckpoints',
    group: 'risk',
    label: 'Keep checkpoints (0 = all)',
    kind: 'number',
    min: 0,
    step: 10,
    default: 200,
  },
  {
    key: 'autoWatchlist',
    group: 'appearance',
    label: 'Desk picks the watchlist instruments, by traded volume',
    kind: 'toggle',
    default: true,
  },
  {
    key: 'rememberCredentials',
    group: 'risk',
    label: 'Remember API keys on this browser (stored unencrypted)',
    kind: 'toggle',
    default: true,
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

/**
 * Settings that are stored but never restored.
 *
 * @returns {string[]} the transient keys.
 */
export function transientSettings() {
  return SETTINGS_SCHEMA.filter((field) => field.transient === true).map((field) => field.key)
}

/** The drawer's sections, in order. */
export const SETTINGS_GROUPS = Object.freeze(['appearance', 'trading', 'risk', 'instruments', 'backtest'])

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
