/**
 * The trip codes, and nothing else.
 *
 * A leaf module on purpose: it imports nothing, so every other breaker file can read the
 * enum at module-evaluation time without joining an import cycle. The codes used to live in
 * `core.js`, which reaches into the bot runner to disarm it — anything importing the enum
 * from there inherited that dependency, and the first module to build a lookup table keyed
 * by a code found the enum still in its temporal dead zone.
 */

/** Why the desk stopped. Numeric because this is compared on the hot path. */
export const TRIP = Object.freeze({
  NONE: 0,
  DAILY_LOSS: 1,
  POSITION: 2,
  LOSS_STREAK: 3,
  KILL: 4,
})

/** What each code says out loud. */
export const TRIP_REASONS = Object.freeze({
  [TRIP.DAILY_LOSS]: 'daily loss limit',
  [TRIP.POSITION]: 'position limit',
  [TRIP.LOSS_STREAK]: 'losing streak',
  [TRIP.KILL]: 'kill switch',
})
