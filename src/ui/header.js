import { setValue, appState } from '../app/engine.js'
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
  dashboard: ['watchlist', 'chart', 'book', 'tape', 'ticket', 'positions', 'hud', 'strategies', 'journal'],
  trade: ['chart', 'book', 'tape', 'ticket', 'positions', 'hud', 'strategies'],
  journal: ['journal', 'positions'],
  analytics: ['journal', 'hud', 'chart', 'strategies'],
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
  ]
}
