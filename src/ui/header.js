import { setValue, appState, watch } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { registerAction } from '../actions/registry.js'
import { ACTIONS } from '../actions/names.js'
import { connectionClass } from './status-color.js'

/**
 * The header: orientation without looking away from the prices.
 *
 * Everything here answers a question a scalper asks constantly — what am I connected to,
 * what am I carrying, what time is it at the venue, which screen am I on — and answers it
 * in a fixed position so the eye finds it by muscle memory rather than by searching.
 */

/** Sections the nav can switch between. Each shows a different block set. */
export const SECTIONS = Object.freeze(['dashboard', 'trade', 'journal', 'analytics'])

/** Which blocks belong to which section. A block absent from a set is hidden there. */
export const SECTION_BLOCKS = Object.freeze({
  dashboard: ['watchlist', 'chart', 'book', 'tape', 'ticket', 'positions', 'hud', 'strategies', 'scoreboard', 'alerts', 'bot', 'trader', 'journal', 'analytics', 'paper'],
  // 'trader' is on the trade screen too: it is the only block that keeps reporting when
  // this tab is shut, which makes it the first thing worth seeing on coming back.
  trade: ['chart', 'book', 'tape', 'ticket', 'positions', 'hud', 'strategies', 'bot', 'trader', 'paper'],
  journal: ['journal', 'positions', 'alerts'],
  analytics: ['analytics', 'journal', 'hud', 'chart', 'strategies', 'scoreboard', 'alerts', 'backtest'],
})

/**
 * Switch the visible section.
 *
 * @param {object} _state - engine state (unused).
 * @param {{section?: string}} [payload] - the section to show.
 * @returns {string} the section now active; unknown names fall back to dashboard.
 */
export function setSection(_state, payload = {}) {
  const requested = String(payload.section ?? '').toLowerCase()
  const section = SECTIONS.includes(requested) ? requested : 'dashboard'

  setValue(PATHS.ui.section, section)
  return section
}

/**
 * Whether a block belongs to a section.
 *
 * @param {string} section - a SECTIONS member.
 * @param {string} blockId - block id.
 * @returns {boolean} true when the block should show in that section.
 */
export function blockInSection(section, blockId) {
  const set = SECTION_BLOCKS[section] ?? SECTION_BLOCKS.dashboard
  return set.includes(blockId)
}

/**
 * Venue connection summary for the header LEDs.
 *
 * @param {object} [state] - engine state.
 * @returns {Array<{venue: string, state: string, className: string}>} one entry per venue.
 */
export function venueLeds(state = appState) {
  const venues = state?.market?.venues ?? {}

  return ['okx', 'etoro'].map((venue) => {
    const connection = String(venues?.[venue]?.state ?? 'dead')
    return { venue, state: connection, className: connectionClass(connection) }
  })
}

/**
 * The session clock label: venue time plus how long the desk has been up.
 *
 * Uptime is shown because a desk that silently reconnected an hour ago and a desk that
 * has been streaming all session look identical otherwise.
 *
 * @param {object} [state] - engine state.
 * @returns {string} e.g. '14:05:09 UTC · up 2h 14m'.
 */
export function sessionClock(state = appState) {
  const clock = String(state?.app?.clock ?? '--:--:--')
  const seconds = Number(state?.app?.uptime ?? 0)

  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const uptime = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`

  return `${clock} UTC · up ${uptime}`
}

/**
 * Toggle a UI overlay (settings drawer, hotkey sheet) by name.
 *
 * Opening the same overlay twice closes it — a scalper hitting the key again expects the
 * panel gone, not stacked.
 *
 * @param {object} _state - engine state (unused).
 * @param {{modal?: string}} [payload] - overlay name; '' closes.
 * @returns {string} the overlay now open, or ''.
 */
export function toggleOverlay(_state, payload = {}) {
  const requested = String(payload.modal ?? '')
  const current = String(appState?.ui?.modal ?? '')
  const next = requested === current ? '' : requested

  setValue(PATHS.ui.modal, next)
  return next
}

/**
 * The blocks the grid should render right now.
 *
 * `SECTION_BLOCKS` and `blockInSection` have described this since the header shipped, but
 * nothing ever called them: the grid bound straight to `settings.blocks`, so every section
 * rendered all thirteen blocks and the nav only moved a highlight. Switching to `trade` is
 * supposed to clear the screen of everything that is not trading.
 *
 * Derived rather than filtered in place — `settings.blocks` is the persisted layout, and
 * narrowing it would make a section switch destroy the blocks the other sections need.
 *
 * @param {object} [state] - engine state.
 * @returns {object[]} the blocks for the active section, hidden ones dropped.
 */
export function sectionBlocks(state = appState) {
  const all = Array.isArray(state?.settings?.blocks) ? state.settings.blocks : []
  const section = String(state?.ui?.section ?? 'dashboard')

  return all.filter((block) => block?.visible !== false && blockInSection(section, block?.id))
}

/**
 * Keep the rendered grid in step with the section and the layout.
 *
 * @param {{watch?: Function}} [deps] - injectable watcher, for tests.
 * @returns {object[]} what was written on the initial pass.
 */
export function mountSectionBlocks(deps = {}) {
  const { watch: watcher = watch } = deps
  const sync = () => setValue(PATHS.ui.gridBlocks, sectionBlocks())

  watcher([PATHS.ui.section, PATHS.settings.blocks], sync)

  // Once up front: the registry is committed during boot, and waiting for the first change
  // would leave the desk empty until the trader touched something.
  const first = sectionBlocks()
  setValue(PATHS.ui.gridBlocks, first)
  return first
}

/**
 * Write a value from state onto an element attribute.
 *
 * The escape hatch for SVG geometry. Spektrum's `:attr` assigns any non-kebab name as a
 * *property*, and `points`, `d`, `x` and friends are read-only on SVG elements — the
 * assignment throws, which aborts the whole bind walk and leaves the desk unbound and
 * invisible. One `data-action="cycle"` subscription sets the attribute properly instead.
 *
 * @param {object} state - engine state.
 * @param {{el?: Element, id?: string, attr?: string}} [payload] - the binding.
 * @returns {string} what was written.
 */
export function svgAttr(state, payload = {}) {
  const el = payload.el
  const path = String(payload.id ?? '')
  if (!el?.setAttribute || !path) return ''

  const value = path.split('.').reduce((held, key) => held?.[key], state)
  const text = String(value ?? '')
  el.setAttribute(String(payload.attr ?? 'points'), text)

  return text
}

/**
 * Register the header's actions.
 *
 * @returns {string[]} names registered by this call.
 */
export function registerHeaderActions() {
  return [
    registerAction(ACTIONS.ui.setSection, setSection, {
      description: 'Switch the visible dashboard section',
    }),
    registerAction(ACTIONS.ui.toggleOverlay, toggleOverlay, {
      description: 'Open or close a UI overlay',
    }),
    registerAction(ACTIONS.ui.svgAttr, svgAttr, {
      description: 'Write a state value onto an SVG attribute',
    }),
  ]
}
