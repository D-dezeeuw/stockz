/**
 * Leveled logging with a capped ring buffer and a dev-only on-screen overlay.
 *
 * A scalper cannot stop to open devtools mid-session, so errors surface on the page in
 * dev. The buffer is fixed-size (no unbounded growth on a hot feed) and every write is
 * O(1). Log calls never throw — diagnostics must not be able to break trading.
 */

export const LEVELS = ['debug', 'info', 'warn', 'error']
export const BUFFER_LIMIT = 200

const buffer = []
let currentLevel = 'debug'
let overlayEl = null

/**
 * Raise or lower the emit threshold; entries below it are dropped entirely.
 *
 * @param {string} level - one of LEVELS.
 * @returns {string} the level now in force (unchanged when the input is invalid).
 */
export function setLogLevel(level) {
  if (LEVELS.includes(level)) currentLevel = level
  return currentLevel
}

/** @returns {string} the current emit threshold. */
export function getLogLevel() {
  return currentLevel
}

/**
 * Append an entry to the capped ring buffer, evicting the oldest when full.
 *
 * @param {{ts: string, level: string, ns: string, msg: string}} entry - the log entry.
 * @returns {number} the buffer length after the write.
 */
export function recordEntry(entry) {
  buffer.push(entry)
  if (buffer.length > BUFFER_LIMIT) buffer.splice(0, buffer.length - BUFFER_LIMIT)
  return buffer.length
}

/** @returns {Array<object>} a copy of the retained entries, oldest first. */
export function logBuffer() {
  return buffer.slice()
}

/** Drop every retained entry (used between sessions and by tests). */
export function clearLogBuffer() {
  buffer.length = 0
}

/**
 * Format one entry as a single overlay/console line.
 *
 * @param {{ts: string, level: string, ns: string, msg: string}} entry - the log entry.
 * @returns {string} e.g. '12:04:31.221 WARN  [okx] reconnecting'.
 */
export function formatEntry(entry) {
  const time = String(entry.ts).slice(11, 23) || String(entry.ts)
  return `${time} ${entry.level.toUpperCase().padEnd(5)} [${entry.ns}] ${entry.msg}`
}

/**
 * Build a namespaced logger whose methods record and emit at their level.
 *
 * @param {string} namespace - subsystem name, e.g. 'okx' or 'exec'.
 * @param {Console} [sink] - console-like target; defaults to the global console.
 * @returns {Record<string, (msg: string) => object|null>} debug/info/warn/error methods.
 */
export function createLogger(namespace, sink = globalThis.console) {
  const emit = (level) => (msg) => {
    if (LEVELS.indexOf(level) < LEVELS.indexOf(currentLevel)) return null

    const entry = { ts: new Date().toISOString(), level, ns: namespace, msg: String(msg) }
    recordEntry(entry)
    sink?.[level]?.(formatEntry(entry))
    renderLogOverlay()
    return entry
  }

  return { debug: emit('debug'), info: emit('info'), warn: emit('warn'), error: emit('error') }
}

/**
 * Mount the dev-only overlay: green-on-black monospace, bottom-right, click to dismiss.
 *
 * @param {Document} [doc] - host document; defaults to the global document.
 * @param {boolean} [isDev] - mount only in dev; defaults to Vite's DEV flag.
 * @returns {Element|null} the overlay element, or null when not mounted.
 */
export function mountLogOverlay(doc = globalThis.document, isDev = Boolean(import.meta.env?.DEV)) {
  if (!isDev || !doc?.createElement) return null

  const el = doc.createElement('pre')
  el.id = 'stockz-log-overlay'
  el.style.cssText = [
    'position:fixed',
    'right:8px',
    'bottom:8px',
    'z-index:9999',
    'max-width:44ch',
    'max-height:30vh',
    'overflow:auto',
    'margin:0',
    'padding:6px 8px',
    'background:rgba(0,0,0,.82)',
    'color:#00e676',
    'font:11px/1.35 "JetBrains Mono",ui-monospace,monospace',
    'border:1px solid #1b5e20',
    'pointer-events:auto',
    'white-space:pre-wrap',
  ].join(';')
  el.addEventListener('click', () => el.remove())

  doc.body.appendChild(el)
  overlayEl = el
  renderLogOverlay()
  return el
}

/**
 * Repaint the overlay from the buffer's tail; a no-op when no overlay is mounted.
 *
 * @returns {Element|null} the overlay element, or null when there is nothing to paint.
 */
export function renderLogOverlay() {
  if (!overlayEl || !overlayEl.isConnected) return null

  overlayEl.textContent = buffer.slice(-12).map(formatEntry).join('\n')
  return overlayEl
}

/** Detach the overlay (used by tests and when leaving dev). */
export function unmountLogOverlay() {
  overlayEl?.remove?.()
  overlayEl = null
}

/**
 * Route uncaught errors and rejections into the logger so nothing fails silently.
 *
 * @param {Window} [win] - host window; defaults to the global window.
 * @param {{error: (msg: string) => unknown}} [logger] - target logger.
 * @returns {boolean} true when listeners were attached.
 */
export function captureGlobalErrors(win = globalThis.window, logger = createLogger('window')) {
  if (!win?.addEventListener) return false

  win.addEventListener('error', (event) => logger.error(event?.message ?? 'uncaught error'))
  win.addEventListener('unhandledrejection', (event) =>
    logger.error(`unhandled rejection: ${event?.reason ?? 'unknown'}`),
  )
  return true
}
