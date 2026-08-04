import { setValue, appState } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { registerAction } from '../actions/registry.js'
import { ACTIONS } from '../actions/names.js'

/**
 * Mute and do-not-disturb.
 *
 * A trader takes a call, sits in an office, or steps away. One switch has to silence every
 * output, and it has to be one switch rather than three — a desk where the toasts stopped
 * but the sounds did not is a desk somebody swears at.
 *
 * The rule that makes DND trustworthy: **the log is never gated.** Silence means "do not
 * interrupt me", not "do not tell me". A trader who mutes for ten minutes and comes back
 * must be able to see everything that happened, or muting becomes a thing they are afraid
 * to do — and a mute nobody dares use protects nobody.
 *
 * Snooze rather than only a toggle, because the honest state is usually "not now" rather
 * than "not ever", and a permanent mute switched on for a phone call is a permanent mute
 * that stays on until something expensive happens.
 */

/** Snooze durations offered, in minutes. */
export const SNOOZE_OPTIONS = Object.freeze([5, 15, 60])

/**
 * Is the desk currently silent?
 *
 * @param {boolean} dnd - the master switch.
 * @param {number} snoozeUntil - when a snooze expires.
 * @param {number} now - the current time.
 * @returns {boolean} true when outputs must stay quiet.
 */
export function isSilenced(dnd, snoozeUntil, now) {
  if (dnd === true) return true

  const until = Number(snoozeUntil)
  const at = Number(now)
  if (!Number.isFinite(until) || !Number.isFinite(at)) return false

  return at < until
}

/**
 * May this alert make a noise?
 *
 * @param {object} alert - the bus alert.
 * @param {number} now - the current time.
 * @param {object} [state] - the settings slice.
 * @returns {boolean} true when an output may fire.
 */
export function mayInterrupt(alert, now, state = appState?.settings) {
  if (!isSilenced(state?.dnd, state?.snoozeUntil, now)) return true

  // The bypass exists because "I muted my desk and missed a reject" is a real way to lose
  // money, and a mute that could do that is one nobody switches on.
  if (state?.bypassCritical === false) return false

  return String(alert?.severity ?? '') === 'error'
}

/**
 * Flip the master switch.
 *
 * @param {boolean} [next] - the state to move to; omit to toggle.
 * @returns {boolean} the switch's new state.
 */
export function toggleDnd(next) {
  const value = typeof next === 'boolean' ? next : appState.settings?.dnd !== true

  setValue(PATHS.settings.dnd, value)
  // Turning the switch off clears any snooze: the trader has made the more explicit
  // statement, and leaving a countdown running behind an un-muted bell is a desk that
  // goes quiet again for no visible reason.
  if (!value) setValue(PATHS.settings.snoozeUntil, 0)

  return value
}

/**
 * Silence the desk for a while.
 *
 * @param {number} minutes - how long, in minutes.
 * @param {number} now - the current time.
 * @returns {number} when the snooze expires.
 */
export function snooze(minutes, now) {
  const mins = Number(minutes)
  const at = Number(now) || 0
  if (!Number.isFinite(mins) || mins <= 0) {
    setValue(PATHS.settings.snoozeUntil, 0)
    return 0
  }

  const until = at + mins * 60000
  setValue(PATHS.settings.snoozeUntil, until)
  return until
}

/**
 * The countdown label for the header.
 *
 * @param {number} snoozeUntil - when the snooze expires.
 * @param {number} now - the current time.
 * @returns {string} the label, or '' when nothing is snoozed.
 */
export function snoozeLabel(snoozeUntil, now) {
  const until = Number(snoozeUntil)
  const at = Number(now)
  if (!Number.isFinite(until) || !Number.isFinite(at) || until <= at) return ''

  const left = Math.ceil((until - at) / 60000)
  return `${left}m`
}

/**
 * Expire a snooze whose time has come.
 *
 * @param {number} now - the current time.
 * @returns {boolean} true when a snooze just ended.
 */
export function expireSnooze(now) {
  const until = Number(appState.settings?.snoozeUntil) || 0
  const at = Number(now) || 0
  if (until <= 0 || at < until) return false

  // Cleared rather than left in the past, so the header stops showing a countdown and the
  // gate stops doing arithmetic on a stale timestamp every frame.
  setValue(PATHS.settings.snoozeUntil, 0)
  return true
}

/**
 * Publish the header's bell state.
 *
 * @param {number} now - the current time.
 * @returns {object} what was published.
 */
export function refreshDnd(now) {
  const settings = appState.settings ?? {}
  const state = {
    silenced: isSilenced(settings.dnd, settings.snoozeUntil, now),
    muted: settings.dnd === true,
    countdown: snoozeLabel(settings.snoozeUntil, now),
  }

  setValue(PATHS.ui.dnd, state)
  return state
}

/**
 * Register the DND actions.
 *
 * @returns {string} the toggle action's name.
 */
export function registerDndActions() {
  registerAction(ACTIONS.alerts.toggleDnd, (_state, payload) =>
    toggleDnd(typeof payload?.value === 'boolean' ? payload.value : undefined),
  )
  registerAction(ACTIONS.alerts.snooze, (_state, payload) =>
    snooze(Number(payload?.minutes ?? payload), Date.now()),
  )

  return ACTIONS.alerts.toggleDnd
}
