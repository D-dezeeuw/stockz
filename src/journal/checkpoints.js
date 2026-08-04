import { setValue, appState, checkpoint, replay } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { registerAction } from '../actions/registry.js'
import { ACTIONS } from '../actions/names.js'
import { createLogger } from '../utils/log.js'

/**
 * Time travel, anchored to trades.
 *
 * The engine can already replay to any point in its history. What it cannot do is tell a
 * trader *which* point they want, and "state 4,812 frames ago" is not an answer anybody
 * uses. So every closed scalp drops a labelled pin: the moment that trade finished, named
 * by what it was and what it made.
 *
 * Two rules keep this from being a liability rather than a feature.
 *
 * **It never costs the fill path anything.** The checkpoint is deferred to a microtask
 * after the fill is processed, and a trade already pinned is not pinned again. A journal
 * feature that added latency to execution would be trading the thing the desk is for
 * against the thing it merely records.
 *
 * **You can always get back.** Before any jump the live head is pinned first, so browsing
 * history can never strand a trader in the past with live orders working. A time machine
 * without a return trip is a trap, and this one is reachable from a button that is always
 * on screen while you are away from live.
 */

const log = createLogger('journal-checkpoints')

/** How many pins are kept in front of the trader. */
export const PIN_CAP = 200

/** The label the live head is pinned under. */
export const LIVE_LABEL = 'live-head'

/** Pins, newest last. */
let pins = []

/** Trade ids already pinned. */
let pinned = new Set()

/**
 * What a pin is called.
 *
 * @param {object} trade - the trade record.
 * @returns {string} the label.
 */
export function checkpointLabel(trade) {
  const instrument = String(trade?.instrument ?? 'trade')
  const net = Number(trade?.net ?? trade?.pnl) || 0
  const sign = net >= 0 ? '+' : ''

  // Named by what it was and what it made. "state 4,812 frames ago" is not an answer
  // anybody uses, and a trader looking for a snapshot is looking for a *trade*.
  // Collapsed, not just trimmed: a trade with no side would otherwise leave a gap in the
  // middle of every label it produced.
  return `${instrument} ${String(trade?.side ?? '')} ${sign}${net.toFixed(2)}`
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Pin the moment a trade closed.
 *
 * @param {object} trade - the trade record.
 * @param {{defer?: Function, snapshot?: Function}} [deps] - injectable plumbing.
 * @returns {boolean} true when a pin was scheduled.
 */
export function pinTrade(trade, deps = {}) {
  const id = String(trade?.id ?? '')
  // Already pinned is not pinned again: a re-published row must not multiply the history.
  if (!id || pinned.has(id)) return false
  pinned.add(id)

  const defer = deps.defer ?? globalThis.queueMicrotask?.bind(globalThis)
  const take = () => addPin({ tradeId: id, label: checkpointLabel(trade), ts: Number(trade?.closeTs) || 0 }, deps)

  // Deferred off the fill path. A journal feature that added latency to execution would be
  // trading the thing the desk is for against the thing that merely records it.
  if (typeof defer === 'function') defer(take)
  else take()

  return true
}

/**
 * Record one pin.
 *
 * @param {{tradeId?: string, label?: string, ts?: number}} entry - the pin.
 * @param {{snapshot?: Function}} [deps] - injectable snapshot.
 * @returns {object} the stored pin.
 */
export function addPin(entry, deps = {}) {
  const snapshot = deps.snapshot ?? checkpoint
  const pin = {
    tradeId: String(entry?.tradeId ?? ''),
    label: String(entry?.label ?? ''),
    ts: Number(entry?.ts) || 0,
  }

  try {
    pin.handle = snapshot(pin.label) ?? pin.label
  } catch (err) {
    // A failed snapshot loses a pin, never a trade. The journal row is the record; this is
    // only the ability to stand in it again.
    log.warn(`checkpoint failed: ${err?.message ?? err}`)
    pin.handle = null
  }

  pins = [...pins, pin].slice(-PIN_CAP)
  setValue(PATHS.journal.checkpoints, pins.slice(-50).reverse())

  return pin
}

/**
 * Every pin.
 *
 * @returns {object[]} oldest first.
 */
export function checkpoints() {
  return pins
}

/**
 * Stand in the moment a trade closed.
 *
 * @param {string} tradeId - which trade.
 * @param {{jump?: Function, snapshot?: Function}} [deps] - injectable plumbing.
 * @returns {boolean} true when the jump happened.
 */
export function jumpToCheckpoint(tradeId, deps = {}) {
  const pin = pins.find((entry) => entry.tradeId === String(tradeId ?? ''))
  if (!pin || pin.handle === null) return false

  // The live head is pinned *first*, always. Browsing history must never strand a trader in
  // the past with live orders working, and a time machine without a return trip is a trap.
  if (!appState.journal?.replaying) pinLive(deps)

  const jump = deps.jump ?? replay
  try {
    jump(pin.handle)
  } catch (err) {
    log.warn(`replay failed: ${err?.message ?? err}`)
    return false
  }

  setValue(PATHS.journal.replaying, pin.tradeId)
  return true
}

/** Where the live head is pinned, so the way back never depends on the pin list. */
let livePin = null

/**
 * Pin the present.
 *
 * @param {{snapshot?: Function}} [deps] - injectable snapshot.
 * @returns {unknown} the handle.
 */
export function pinLive(deps = {}) {
  const snapshot = deps.snapshot ?? checkpoint
  try {
    livePin = snapshot(LIVE_LABEL) ?? LIVE_LABEL
  } catch (err) {
    log.warn(`live checkpoint failed: ${err?.message ?? err}`)
    livePin = null
  }

  return livePin
}

/**
 * Come back to now.
 *
 * @param {{jump?: Function}} [deps] - injectable replay.
 * @returns {boolean} true when the desk is live again.
 */
export function returnToLive(deps = {}) {
  if (livePin === null) {
    // Nothing to return to still clears the flag: a desk stuck displaying "viewing history"
    // with no way out is worse than one that simply carries on.
    setValue(PATHS.journal.replaying, '')
    return false
  }

  const jump = deps.jump ?? replay
  try {
    jump(livePin)
  } catch (err) {
    log.warn(`return to live failed: ${err?.message ?? err}`)
  }

  setValue(PATHS.journal.replaying, '')
  return true
}

/**
 * Register the time-travel actions.
 *
 * @returns {string[]} the registered names.
 */
export function registerCheckpointActions() {
  registerAction(ACTIONS.journal.jump, (_state, payload) => jumpToCheckpoint(payload?.id))
  registerAction(ACTIONS.journal.live, () => returnToLive())

  return [ACTIONS.journal.jump, ACTIONS.journal.live]
}

/**
 * Forget every pin.
 *
 * @returns {boolean} true.
 */
export function resetCheckpoints() {
  pins = []
  pinned = new Set()
  livePin = null
  setValue(PATHS.journal.checkpoints, [])
  setValue(PATHS.journal.replaying, '')

  return true
}
