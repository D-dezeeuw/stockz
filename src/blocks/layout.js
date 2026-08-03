import { setValue } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { toggleBlock, currentBlocks, commitBlocks } from './registry.js'
import { registerAction } from '../actions/registry.js'
import { ACTIONS } from '../actions/names.js'

/**
 * Grid layout maths and the visibility actions.
 *
 * The CSS already auto-fits columns, so this is not what draws the grid — it is what the
 * desk *knows* about its own layout: how many columns are showing, which density band it
 * is in, and how a trader turns a block off.
 *
 * Density matters because a scalper on a laptop and one on a 49" ultrawide want the same
 * information at different granularity, and blocks will use this to decide how much
 * detail to render.
 */

/** Density bands, by column count. */
export const DENSITY = Object.freeze({
  compact: 'compact', // 1 column — phone or a narrow split
  normal: 'normal', // 2–3 columns — laptop
  wide: 'wide', // 4+ columns — desk monitor
})

/**
 * How many columns fit, given the CSS auto-fit rule.
 *
 * Mirrors `repeat(auto-fit, minmax(var(--block-w), 1fr))` with the grid's gap and
 * padding, so JS and CSS cannot disagree about what the trader is looking at.
 *
 * @param {number} viewportWidth - available width in px.
 * @param {{blockW?: number, gap?: number, padding?: number}} [options] - grid metrics in px.
 * @returns {number} column count, at least 1.
 */
export function columnCount(viewportWidth, options = {}) {
  const { blockW = 352, gap = 8, padding = 8 } = options
  const usable = Number(viewportWidth) - padding * 2

  if (!Number.isFinite(usable) || usable <= 0) return 1

  // n columns need n*blockW + (n-1)*gap.
  const columns = Math.floor((usable + gap) / (blockW + gap))
  return Math.max(1, columns)
}

/**
 * The density band for a column count.
 *
 * @param {number} columns - how many columns are showing.
 * @returns {string} a DENSITY member.
 */
export function densityFor(columns) {
  const n = Number(columns)
  if (!Number.isFinite(n) || n <= 1) return DENSITY.compact
  return n >= 4 ? DENSITY.wide : DENSITY.normal
}

/**
 * Measure the viewport and record columns and density in state.
 *
 * @param {number} viewportWidth - available width in px.
 * @returns {{columns: number, density: string}} what was recorded.
 */
export function applyLayout(viewportWidth) {
  const columns = columnCount(viewportWidth)
  const density = densityFor(columns)

  setValue(PATHS.ui.columns, columns)
  setValue(PATHS.ui.density, density)
  return { columns, density }
}

/**
 * Track viewport changes and keep the layout state current.
 *
 * Uses ResizeObserver on the grid element rather than a window resize listener: the grid
 * also changes width when a side panel opens, which a window listener would miss.
 *
 * @param {{doc?: Document, win?: object}} [options] - injected environment.
 * @returns {() => void} teardown.
 */
export function observeLayout(options = {}) {
  const { doc = globalThis.document, win = globalThis } = options
  const grid = doc?.querySelector?.('.app-grid')

  if (!grid || typeof win.ResizeObserver !== 'function') {
    applyLayout(win?.innerWidth ?? 0)
    return () => {}
  }

  const observer = new win.ResizeObserver((entries) => {
    const width = entries?.[0]?.contentRect?.width ?? grid.clientWidth
    applyLayout(width)
  })

  observer.observe(grid)
  return () => observer.disconnect()
}

/**
 * Show or hide a block, persisting the choice.
 *
 * @param {object} _state - engine state (unused).
 * @param {{id?: string, visible?: boolean}} [payload] - which block, and optionally the
 *   explicit state; omitting `visible` toggles.
 * @returns {object[]} the registry after the change.
 */
export function setBlockVisibility(_state, payload = {}) {
  const next = toggleBlock(currentBlocks(), payload.id, payload.visible)
  return commitBlocks(next)
}

/**
 * Register the layout actions so HTML and hotkeys can call them.
 *
 * @returns {string[]} names registered by this call.
 */
export function registerLayoutActions() {
  return [registerAction(ACTIONS.ui.toggleBlock, setBlockVisibility, {
    description: 'Show or hide a dashboard block',
  })]
}
