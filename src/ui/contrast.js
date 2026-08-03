/**
 * Contrast verification for the palette.
 *
 * A trading screen is read for hours, often at speed and sometimes in daylight on a
 * laptop. "Looks fine on my monitor" is not a check, so the palette's contrast is
 * computed and asserted in a unit test instead — if a token changes and drops below the
 * bar, the test fails rather than a trader squinting at a price.
 *
 * Implements the WCAG 2.1 relative-luminance and contrast-ratio formulas.
 */

/** WCAG thresholds. */
export const WCAG = Object.freeze({
  AA_NORMAL: 4.5,
  AA_LARGE: 3, // >=18px bold or >=24px — prices and PnL qualify
  AAA_NORMAL: 7,
})

/**
 * Parse a hex colour into 8-bit channels.
 *
 * @param {string} hex - '#rgb' or '#rrggbb', with or without the hash.
 * @returns {{r: number, g: number, b: number}|null} channels, or null when unparseable.
 */
export function parseHex(hex) {
  const text = String(hex ?? '').trim().replace(/^#/, '')

  const full = text.length === 3 ? text.replace(/./g, (c) => c + c) : text
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null

  return {
    r: Number.parseInt(full.slice(0, 2), 16),
    g: Number.parseInt(full.slice(2, 4), 16),
    b: Number.parseInt(full.slice(4, 6), 16),
  }
}

/**
 * Relative luminance of a colour (WCAG 2.1).
 *
 * @param {string} hex - hex colour.
 * @returns {number} luminance 0–1; 0 when the colour cannot be parsed.
 */
export function relativeLuminance(hex) {
  const rgb = parseHex(hex)
  if (!rgb) return 0

  const channel = (value) => {
    const srgb = value / 255
    return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4
  }

  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b)
}

/**
 * Contrast ratio between two colours (WCAG 2.1), 1–21.
 *
 * @param {string} foreground - hex colour.
 * @param {string} background - hex colour.
 * @returns {number} the ratio, rounded to two decimals.
 */
export function contrastRatio(foreground, background) {
  const a = relativeLuminance(foreground)
  const b = relativeLuminance(background)

  const lighter = Math.max(a, b)
  const darker = Math.min(a, b)
  return Math.round(((lighter + 0.05) / (darker + 0.05)) * 100) / 100
}

/**
 * Whether a pairing clears a WCAG level.
 *
 * @param {string} foreground - hex colour.
 * @param {string} background - hex colour.
 * @param {number} [threshold] - a WCAG member; defaults to AA for normal text.
 * @returns {boolean} true when the pairing passes.
 */
export function meetsContrast(foreground, background, threshold = WCAG.AA_NORMAL) {
  return contrastRatio(foreground, background) >= threshold
}

/**
 * Audit a set of foreground/background pairings.
 *
 * @param {Array<{name: string, fg: string, bg: string, threshold?: number}>} pairs - what
 *   to check.
 * @returns {{passed: object[], failed: object[]}} results, each with its measured ratio.
 */
export function auditContrast(pairs) {
  const list = Array.isArray(pairs) ? pairs : []
  const passed = []
  const failed = []

  for (const pair of list) {
    const threshold = pair.threshold ?? WCAG.AA_NORMAL
    const ratio = contrastRatio(pair.fg, pair.bg)
    const result = { ...pair, threshold, ratio }

    if (ratio >= threshold) passed.push(result)
    else failed.push(result)
  }

  return { passed, failed }
}
