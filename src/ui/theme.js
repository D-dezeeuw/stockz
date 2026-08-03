import { setValue, appState } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { registerAction } from '../actions/registry.js'
import { ACTIONS } from '../actions/names.js'

/**
 * Day/night switching.
 *
 * The theme is one attribute on <html>, so switching costs a single write and the
 * browser repaints from the token sets already in the stylesheet — no stylesheet swap,
 * no flash, nothing to reload mid-session.
 *
 * Written to BOTH `ui.theme` (what is on screen) and `settings.theme` (what persists).
 * Phase 6 owns persistence and the no-flash boot script; this is the mechanism.
 */

/** The themes that exist. */
export const THEMES = Object.freeze(['night', 'day'])

/**
 * The theme a first-time visitor should get.
 *
 * Night is the default because the desk is built for it, but a trader whose OS says
 * light gets light — fighting the system preference is how an app feels hostile at 9am.
 *
 * @param {object} [win] - window-like object with matchMedia.
 * @returns {string} 'night' or 'day'.
 */
export function preferredTheme(win = globalThis) {
  const prefersLight = win?.matchMedia?.('(prefers-color-scheme: light)')?.matches
  return prefersLight ? 'day' : 'night'
}

/**
 * Apply a theme to the document and to state.
 *
 * @param {string} theme - a THEMES member.
 * @param {Document} [doc] - document to stamp.
 * @returns {string} the theme applied; unknown values fall back to night.
 */
export function applyTheme(theme, doc = globalThis.document) {
  const next = THEMES.includes(theme) ? theme : 'night'

  doc?.documentElement?.setAttribute?.('data-theme', next)
  syncBrowserChrome(next, doc)
  setValue(PATHS.ui.theme, next)
  setValue(PATHS.settings.theme, next)
  return next
}

/** Background colour the browser chrome should match, per theme. */
export const CHROME_COLOR = Object.freeze({ night: '#070a07', day: '#f2f5f1' })

/**
 * Keep the browser's own chrome in step with the theme.
 *
 * On mobile the address bar takes its colour from this meta tag; leaving it dark under a
 * light theme puts a black band above a white desk.
 *
 * @param {string} theme - a THEMES member.
 * @param {Document} [doc] - document to update.
 * @returns {string} the colour applied, or '' when there is no meta tag.
 */
export function syncBrowserChrome(theme, doc = globalThis.document) {
  const meta = doc?.querySelector?.('meta[name="theme-color"]')
  if (!meta) return ''

  const color = CHROME_COLOR[theme] ?? CHROME_COLOR.night
  meta.setAttribute('content', color)
  return color
}

/**
 * Flip between night and day.
 *
 * @param {object} _state - engine state (unused).
 * @param {{theme?: string, doc?: Document}} [payload] - explicit theme, or omit to toggle.
 * @returns {string} the theme now in force.
 */
export function setTheme(_state, payload = {}) {
  const current = String(appState?.ui?.theme ?? 'night')
  const requested = payload.theme ?? (current === 'night' ? 'day' : 'night')

  return applyTheme(requested, payload.doc)
}

/**
 * Register the theme action.
 *
 * @returns {string[]} names registered by this call.
 */
export function registerThemeActions() {
  return [
    registerAction(ACTIONS.ui.setTheme, setTheme, {
      description: 'Switch between night and day themes',
    }),
  ]
}
