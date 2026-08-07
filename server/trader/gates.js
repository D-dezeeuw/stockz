/**
 * What stands between a signal and an order.
 *
 * A signal is an opinion; an order is money. The gates are what turn the first into the
 * second only when several independent things agree, and they are deliberately ordered
 * cheapest-first so the common case (a neutral signal on a throttled instrument) costs
 * almost nothing to reject.
 *
 * These are ports of the browser desk's gates, rewritten against a plain state object
 * rather than the reactive engine. Same rules, no `appState`: the server has no engine and
 * should not grow one just to ask whether it may trade.
 *
 * Every gate returns `{pass, reason}` rather than a boolean. "Blocked" with no reason is
 * how a loop that has quietly stopped trading looks exactly like a quiet market.
 */

/** A signal weaker than this is noise, whatever the strategy claims. */
export const MIN_STRENGTH = 0.5

/**
 * Is the signal itself actionable?
 *
 * @param {{action?: string, strength?: number}} signal - the strategy's opinion.
 * @param {number} [minStrength] - the conviction floor.
 * @returns {{pass: boolean, reason: string}} the verdict.
 */
export function signalGate(signal, minStrength = MIN_STRENGTH) {
  const action = String(signal?.action ?? 'none').toLowerCase()
  if (action !== 'buy' && action !== 'sell') return { pass: false, reason: 'no direction' }

  const strength = Number(signal?.strength)
  if (!Number.isFinite(strength) || strength < minStrength) {
    return { pass: false, reason: `weak (${Number.isFinite(strength) ? strength.toFixed(2) : '0'})` }
  }

  return { pass: true, reason: '' }
}

/**
 * Has the orders-per-minute budget been spent?
 *
 * Counted over a sliding minute rather than reset on the minute boundary: a fixed window
 * lets twice the ceiling through across a boundary, which is precisely when a burst of
 * signals arrives.
 *
 * @param {number[]} recent - timestamps of orders already sent.
 * @param {number} now - epoch ms.
 * @param {number} limit - orders per minute.
 * @returns {{pass: boolean, reason: string, kept: number[]}} the verdict and the pruned window.
 */
export function throttleGate(recent, now, limit) {
  const at = Number(now) || 0
  const kept = (Array.isArray(recent) ? recent : []).filter((ts) => at - ts < 60000)
  const ceiling = Number(limit)

  if (Number.isFinite(ceiling) && kept.length >= ceiling) {
    return { pass: false, reason: `throttled at ${ceiling}/min`, kept }
  }
  return { pass: true, reason: '', kept }
}

/**
 * Would this order push the instrument past its exposure cap?
 *
 * Measured on the *absolute* resulting position, so the cap binds in both directions and a
 * short cannot be built past a limit that was written for a long.
 *
 * @param {{instrument: string, side: string, size: number}} order - what is proposed.
 * @param {number} held - the current signed position.
 * @param {number} cap - the per-instrument ceiling, in base units.
 * @returns {{pass: boolean, reason: string}} the verdict.
 */
export function capGate(order, held, cap) {
  const ceiling = Number(cap)
  if (!Number.isFinite(ceiling)) return { pass: true, reason: '' }

  const current = Number(held) || 0
  const size = Math.abs(Number(order?.size) || 0)
  const delta = String(order?.side ?? '').toLowerCase() === 'sell' ? -size : size
  const after = Math.abs(current + delta)

  // Reducing is always allowed, even from over the cap: a gate that blocks the exit is a
  // gate that traps a position, and no risk limit is worth that.
  if (after <= Math.abs(current)) return { pass: true, reason: '' }
  if (after <= ceiling) return { pass: true, reason: '' }

  return { pass: false, reason: `cap ${ceiling} (holding ${current})` }
}

/**
 * Is this instrument benched after a run of losses?
 *
 * @param {number} until - epoch ms the bench expires.
 * @param {number} now - epoch ms.
 * @returns {{pass: boolean, reason: string}} the verdict.
 */
export function cooldownGate(until, now) {
  const ends = Number(until) || 0
  const at = Number(now) || 0
  if (ends > at) return { pass: false, reason: `benched ${Math.ceil((ends - at) / 1000)}s` }
  return { pass: true, reason: '' }
}
