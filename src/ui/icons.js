/**
 * Inline SVG icons.
 *
 * Inline, not an icon font or sprite sheet: no extra request, no flash of missing glyph,
 * and `currentColor` means an icon inherits whatever semantic colour its container
 * already has — a sell arrow is orange because it sits in `.is-sell`, not because the
 * icon hard-codes it.
 *
 * Every icon is drawn on a 16×16 grid with square caps, matching the terminal aesthetic.
 * Keep them geometric: a scalper identifies these by silhouette at a glance.
 */

/** Raw path geometry, 16×16 viewBox. */
const PATHS = Object.freeze({
  up: '<path d="M8 2 L14 9 L10 9 L10 14 L6 14 L6 9 L2 9 Z"/>',
  down: '<path d="M8 14 L2 7 L6 7 L6 2 L10 2 L10 7 L14 7 Z"/>',
  bolt: '<path d="M9 1 L3 9 L7 9 L6 15 L13 6 L9 6 Z"/>',
  skull:
    '<path d="M8 1 C4 1 2 4 2 7 C2 9 3 10 4 11 L4 14 L12 14 L12 11 C13 10 14 9 14 7 C14 4 12 1 8 1 Z M6 7 A1.4 1.4 0 1 1 6 6.9 Z M10 7 A1.4 1.4 0 1 1 10 6.9 Z"/>',
  gear: '<path d="M7 1 H9 L9.4 3 L11 3.8 L12.8 2.9 L14 4.6 L12.7 6 L12.7 7.8 L14 9.2 L12.8 10.9 L11 10 L9.4 10.8 L9 13 H7 L6.6 10.8 L5 10 L3.2 10.9 L2 9.2 L3.3 7.8 L3.3 6 L2 4.6 L3.2 2.9 L5 3.8 L6.6 3 Z M8 5.4 A2.4 2.4 0 1 0 8 10.2 A2.4 2.4 0 1 0 8 5.4 Z"/>',
  sun: '<path d="M8 4.5 A3.5 3.5 0 1 1 8 11.5 A3.5 3.5 0 1 1 8 4.5 Z M7.25 0 H8.75 V2.5 H7.25 Z M7.25 13.5 H8.75 V16 H7.25 Z M0 7.25 H2.5 V8.75 H0 Z M13.5 7.25 H16 V8.75 H13.5 Z"/>',
  moon: '<path d="M13 10.2 A6 6 0 1 1 6.2 2.4 A5 5 0 0 0 13 10.2 Z"/>',
  chart: '<path d="M1 14 H15 V15.5 H1 Z M2.5 9 H5 V13 H2.5 Z M6.5 5 H9 V13 H6.5 Z M10.5 7 H13 V13 H10.5 Z"/>',
  clock:
    '<path d="M8 1 A7 7 0 1 0 8 15 A7 7 0 1 0 8 1 Z M8 2.6 A5.4 5.4 0 1 1 8 13.4 A5.4 5.4 0 1 1 8 2.6 Z M7.3 4.5 H8.7 V8.3 L11.2 9.8 L10.5 11 L7.3 9.1 Z"/>',
  linkedin:
    '<path d="M2 6 H4.8 V14 H2 Z M3.4 1.6 A1.6 1.6 0 1 1 3.4 4.8 A1.6 1.6 0 1 1 3.4 1.6 Z M6.6 6 H9.3 V7.1 C9.8 6.3 10.8 5.8 12 5.8 C14.2 5.8 15 7.2 15 9.4 V14 H12.2 V9.9 C12.2 8.8 11.8 8.1 10.8 8.1 C9.9 8.1 9.4 8.7 9.4 9.9 V14 H6.6 Z"/>',
  npm: '<path d="M1 4 H15 V12 H8 V13.5 H4.6 V12 H1 Z M2.6 10.4 H4.3 V6.9 H5.6 V10.4 H7.2 V5.6 H2.6 Z M8.4 5.6 V11.9 H10.1 V10.4 H12.9 V5.6 Z M10.1 6.9 H11.6 V9 H10.1 Z"/>',
  github:
    '<path d="M8 0.8 A7.2 7.2 0 0 0 5.7 14.8 C6.1 14.9 6.2 14.6 6.2 14.4 V13.1 C4.2 13.5 3.8 12.2 3.8 12.2 C3.5 11.4 3 11.2 3 11.2 C2.4 10.8 3.1 10.8 3.1 10.8 C3.8 10.9 4.1 11.5 4.1 11.5 C4.7 12.6 5.8 12.3 6.2 12.1 C6.3 11.6 6.5 11.3 6.7 11.1 C5.1 10.9 3.4 10.3 3.4 7.5 C3.4 6.7 3.7 6.1 4.1 5.6 C4 5.4 3.8 4.7 4.2 3.7 C4.2 3.7 4.8 3.5 6.2 4.5 A7 7 0 0 1 9.8 4.5 C11.2 3.5 11.8 3.7 11.8 3.7 C12.2 4.7 12 5.4 11.9 5.6 C12.3 6.1 12.6 6.7 12.6 7.5 C12.6 10.3 10.9 10.9 9.3 11.1 C9.6 11.3 9.8 11.8 9.8 12.5 V14.4 C9.8 14.6 9.9 14.9 10.4 14.8 A7.2 7.2 0 0 0 8 0.8 Z"/>',
  keyboard:
    '<path d="M1 3 H15 V13 H1 Z M2.6 4.6 V11.4 H13.4 V4.6 Z M4 6 H6 V7.4 H4 Z M7 6 H9 V7.4 H7 Z M10 6 H12 V7.4 H10 Z M4 8.6 H12 V10 H4 Z"/>',
})

/** Every icon name available. */
export const ICON_NAMES = Object.freeze(Object.keys(PATHS))

/**
 * Render an icon as an inline SVG string.
 *
 * Uses `currentColor`, so the icon takes the semantic colour of whatever contains it —
 * that is what keeps a sell arrow orange without the icon knowing about sides.
 *
 * @param {string} name - an ICON_NAMES member.
 * @param {{size?: number, title?: string, className?: string}} [options] - rendering.
 * @returns {string} SVG markup, or '' when the name is unknown.
 */
export function icon(name, options = {}) {
  const path = PATHS[name]
  if (!path) return ''

  const { size = 16, title = '', className = '' } = options
  const classAttr = `icon icon--${name}${className ? ` ${className}` : ''}`
  const label = title
    ? `role="img" aria-label="${escapeAttr(title)}"`
    : 'aria-hidden="true" focusable="false"'

  return [
    `<svg class="${escapeAttr(classAttr)}" width="${size}" height="${size}"`,
    ` viewBox="0 0 16 16" fill="currentColor" ${label}>`,
    path,
    '</svg>',
  ].join('')
}

/**
 * Escape a value for safe interpolation into an attribute.
 *
 * Icon titles can carry instrument names that came off a venue feed, and venue data is
 * not trusted input.
 *
 * @param {string} value - raw value.
 * @returns {string} escaped value.
 */
export function escapeAttr(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

/**
 * The icon that represents an order side.
 *
 * @param {string} side - 'buy'/'long' or 'sell'/'short'.
 * @returns {string} 'up', 'down', or '' when unknown.
 */
export function sideIcon(side) {
  const normalized = String(side ?? '').toLowerCase()

  if (normalized === 'buy' || normalized === 'long') return 'up'
  if (normalized === 'sell' || normalized === 'short') return 'down'
  return ''
}
