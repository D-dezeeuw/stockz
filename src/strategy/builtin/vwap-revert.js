import { defineStrategy } from '../contract.js'
import { createVwap, createStddev, zscore } from '../indicators/index.js'

/**
 * VWAP mean reversion bands.
 *
 * The other half of the scalper's book from the momentum burst, and deliberately its
 * opposite: this one fades. Price that has stretched several standard deviations from the
 * session's volume-weighted fair value tends to snap back, because the move was one
 * impatient participant rather than a repricing.
 *
 * The rule that keeps it from being a way to lose money slowly is **confirmation**. A band
 * touch alone is a falling knife — price at three sigma can go to five, and fading the
 * first touch of a genuine trend is how mean-reversion accounts die. So the setup arms on
 * the touch and only fires once a print comes back *toward* VWAP.
 *
 * Bands are measured in sigma of the price-to-VWAP distance rather than in ticks, so the
 * same settings mean the same thing on a quiet instrument and a wild one.
 */

/** Prints before the bands are trusted. */
export const REVERT_WARMUP = 30

/**
 * The smallest dispersion that counts as a measurement, as a fraction of price.
 *
 * `sigma > 0` is not a warmup test — it is a divide-by-zero guard that does not guard.
 * Early in a session the VWAP hugs price, so `distance` is tiny and its standard deviation
 * is tinier, and the z-score explodes: a live session produced entries at **814σ, 144σ and
 * 22σ**, each one followed in the same second by `stretched past stop`, because the stop is
 * built from the same near-zero sigma and any tick at all clears it. Enter, stop out, lose;
 * three of those and the instrument benches itself — which is how a log fills with
 * `benched 45s` and the desk looks like it never trades.
 *
 * Price-relative because it has to hold across instruments: a meaningful dispersion on BTC
 * is not a meaningful dispersion on a token worth a cent. 1e-5 is 0.1 basis points — far
 * below any real micro-structure, and far above the rounding error this exists to reject.
 *
 * Deliberately NOT a tunable parameter: this is a floor on whether a number means anything,
 * not a view about how eagerly to trade.
 */
export const MIN_SIGMA_FRACTION = 1e-5

/**
 * Fold a print into the session VWAP and its dispersion.
 *
 * @param {object} state - the run's scratchpad.
 * @param {number} px - the print price.
 * @param {number} size - the print size.
 * @returns {{vwap: number, sigma: number, distance: number, warm: boolean}} the reading.
 */
export function foldPrint(state, px, size) {
  const price = Number(px)
  if (!state?.vwap || !Number.isFinite(price)) {
    return { vwap: 0, sigma: 0, distance: 0, warm: false }
  }

  // Size defaults to one rather than zero: a feed that omits size would otherwise leave
  // VWAP permanently at zero and the strategy silently dead.
  const vwap = state.vwap.update(price, Number(size) > 0 ? Number(size) : 1)
  const distance = price - vwap
  const sigma = state.spread.update(distance)
  state.samples = (Number(state.samples) || 0) + 1

  // Warm needs both: enough samples, and a dispersion big enough to divide by. See
  // MIN_SIGMA_FRACTION — the second half is what stops 814σ entries that stop out instantly.
  const meaningful = sigma >= Math.abs(price) * MIN_SIGMA_FRACTION
  return { vwap, sigma, distance, warm: state.samples >= REVERT_WARMUP && meaningful }
}

/**
 * Has price pierced a band?
 *
 * @param {number} distance - price minus VWAP.
 * @param {number} sigma - the dispersion.
 * @param {number} k - how many sigma the band sits at.
 * @returns {string} 'buy' to fade a dip, 'sell' to fade a spike, '' for neither.
 */
export function bandTouch(distance, sigma, k) {
  const z = zscore(distance, 0, sigma)
  const band = Number(k) > 0 ? Number(k) : 2
  if (z === 0) return ''

  // Fading: price *below* the lower band is a buy setup. The sign flip here is the one
  // place this strategy is the mirror of the momentum one, and getting it backwards would
  // turn a fade into a chase.
  if (z <= -band) return 'buy'
  return z >= band ? 'sell' : ''
}

/**
 * Has price actually turned back toward VWAP?
 *
 * @param {number} px - the current print.
 * @param {number} prevPx - the previous print.
 * @param {string} side - the armed side.
 * @returns {boolean} true when confirmed.
 */
export function revertConfirm(px, prevPx, side) {
  const now = Number(px)
  const before = Number(prevPx)
  if (!Number.isFinite(now) || !Number.isFinite(before)) return false

  // Price at three sigma can go to five. Fading the first touch of a genuine trend is how
  // a mean-reversion account dies, so the setup waits for a print coming back.
  if (side === 'buy') return now > before
  return side === 'sell' ? now < before : false
}

/**
 * Should the fade be closed?
 *
 * @param {object} entry - `{side, px, vwap}` at entry.
 * @param {number} px - the current price.
 * @param {number} vwap - the current VWAP.
 * @param {number} stopSigma - how far past the band the stop sits, in sigma.
 * @param {number} sigma - the dispersion.
 * @returns {string} '' to hold, or the reason to exit.
 */
export function vwapExit(entry, px, vwap, stopSigma, sigma) {
  const price = Number(px)
  const fair = Number(vwap)
  if (!entry?.side || !Number.isFinite(price) || !Number.isFinite(fair)) return ''

  // The target is VWAP itself: the trade was "this is too far from fair", so fair is where
  // the reason to hold ends. Anything beyond it is a different trade.
  if (entry.side === 'buy' && price >= fair) return 'reverted to vwap'
  if (entry.side === 'sell' && price <= fair) return 'reverted to vwap'

  const stop = Number(stopSigma) > 0 ? Number(stopSigma) : 4
  const z = zscore(price - fair, 0, sigma)
  // Stretched further still means the fade was wrong. Holding a losing fade "until it
  // reverts" is the failure mode this stop exists to prevent.
  if (entry.side === 'buy' && z <= -stop) return 'stretched past stop'

  return entry.side === 'sell' && z >= stop ? 'stretched past stop' : ''
}

/**
 * One tick of the strategy.
 *
 * @param {object} ctx - the strategy context.
 * @param {object} tick - the print.
 * @returns {object|null} the signal, or null.
 */
export function revertTick(ctx, tick) {
  const state = ctx?.state
  const px = Number(tick?.px)
  if (!state?.vwap || !Number.isFinite(px)) return null

  const { vwap, sigma, distance, warm } = foldPrint(state, px, tick?.size ?? tick?.sz)
  const prevPx = state.lastPx
  state.lastPx = px
  if (!warm) return null

  if (state.entry) {
    const exit = vwapExit(state.entry, px, vwap, ctx.params?.stopSigma, sigma)
    if (!exit) return null

    state.entry = null
    state.armed = ''
    return { action: 'flat', strength: 1, reason: exit }
  }

  const touch = bandTouch(distance, sigma, ctx.params?.sigmaK)
  // Armed on the touch, fired on the turn. Losing the arm when price leaves the band is
  // deliberate: a setup from two minutes ago is not a setup.
  if (touch) state.armed = touch
  else if (state.armed && !revertConfirm(px, prevPx, state.armed)) state.armed = ''

  if (!state.armed || !revertConfirm(px, prevPx, state.armed)) return null

  const side = state.armed
  state.armed = ''
  state.entry = { side, px, vwap }

  return {
    action: side,
    strength: Math.min(1, Math.abs(zscore(distance, 0, sigma)) / 4),
    reason: `${Math.abs(zscore(distance, 0, sigma)).toFixed(1)}σ from vwap, turning back`,
  }
}

/**
 * The strategy.
 */
export const vwapRevertStrategy = defineStrategy({
  id: 'vwap-revert',
  name: 'VWAP reversion',
  params: {
    sigmaK: { kind: 'number', label: 'band (σ)', default: 2, min: 0.5, max: 5, step: 0.25 },
    stopSigma: { kind: 'number', label: 'stop (σ)', default: 4, min: 1, max: 10, step: 0.5 },
    window: { kind: 'number', label: 'dispersion window', default: 100, min: 20, max: 500, step: 10 },
  },
  init: (ctx) => {
    ctx.state.vwap = createVwap()
    ctx.state.spread = createStddev(Number(ctx.params?.window) || 100)
    ctx.state.samples = 0
    ctx.state.armed = ''
    ctx.state.entry = null
    return ctx.state
  },
  onTick: revertTick,
  onCandle: () => null,
})
