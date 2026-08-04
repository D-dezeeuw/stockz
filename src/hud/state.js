import { setValue, appState } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { latencySummary } from '../exec/latency.js'
import { busStats } from '../pipeline/bus.js'
import { grossExposure } from '../positions/store.js'
import { ledger } from '../positions/ledger.js'
import {
  ewma,
  ratePerMinute,
  formatMs,
  formatBps,
  formatCompact,
  gradeLatency,
} from './metrics.js'

/**
 * The HUD.
 *
 * Vital signs, not analysis. Every tile answers a question a scalper asks between trades
 * — *is the desk fast, is the market wide, am I trading too much, how am I doing* — and
 * each is derived from something the desk already recorded rather than measured afresh.
 *
 * Two of them are honest in a way that matters. The spread tile shows basis points rather
 * than currency, because a two-tick spread means something different on every instrument
 * and bps is the number a scalper compares against their own edge. And the pace tile
 * counts *trades per minute*, which is the metric a desk optimised for trades-per-hour
 * has to be able to see going wrong.
 */

/** Smoothed values held between refreshes. */
let smoothed = { latency: undefined, spread: undefined }

/**
 * The desk's spread, in basis points.
 *
 * @returns {number} the spread in bps, 0 when there is no two-sided market.
 */
export function spreadBps() {
  const bid = Number(appState.market?.bid) || 0
  const ask = Number(appState.market?.ask) || 0
  if (bid <= 0 || ask <= 0 || ask <= bid) return 0

  const mid = (bid + ask) / 2
  return Number((((ask - bid) / mid) * 10000).toFixed(4))
}

/**
 * How hard the session is being traded.
 *
 * @param {number} now - the current time.
 * @returns {{perMinute: number, count: number, wins: number}} the pace.
 */
export function sessionPace(now) {
  const closes = ledger()

  return {
    // Trades per minute is the metric a desk built for trades-per-hour must be able to
    // watch going wrong — overtrading looks like activity until it is priced.
    perMinute: ratePerMinute(
      closes.map((row) => row.ts),
      now,
    ),
    count: closes.length,
    wins: closes.filter((row) => (Number(row?.amount) || 0) > 0).length,
  }
}

/**
 * Fill quality: how much of the spread the desk gave up.
 *
 * @param {object[]} [closes] - the day's realisations.
 * @returns {number} the win rate, 0..1.
 */
export function winRate(closes = ledger()) {
  const rows = Array.isArray(closes) ? closes : []
  if (rows.length === 0) return 0

  const wins = rows.filter((row) => (Number(row?.amount) || 0) > 0).length
  return Number((wins / rows.length).toFixed(4))
}

/**
 * Assemble every tile.
 *
 * @param {{now?: number}} [options] - the clock.
 * @returns {object} the HUD's values.
 */
export function readHud(options = {}) {
  const now = Number(options.now) || 0
  const latency = latencySummary()
  const pace = sessionPace(now)
  const feed = busStats()

  smoothed = {
    latency: ewma(smoothed.latency, latency.p50),
    spread: ewma(smoothed.spread, spreadBps()),
  }

  return {
    latencyMs: smoothed.latency ?? 0,
    latencyP95: latency.p95,
    latencyGrade: gradeLatency(smoothed.latency ?? 0),
    spreadBps: smoothed.spread ?? 0,
    ticksPerMin: ratePerMinute([], now),
    tradesPerMin: pace.perMinute,
    trades: pace.count,
    winRate: winRate(),
    exposure: grossExposure(),
    feedTicks: Number(feed?.ticks) || 0,
    now,
  }
}

/**
 * Publish the HUD.
 *
 * @param {{now?: number}} [options] - the clock.
 * @returns {object} the values now in state.
 */
export function refreshHud(options = {}) {
  const hud = readHud(options)

  setValue(PATHS.ui.hud, {
    ...hud,
    // Formatted here rather than in the template: a fixed-width string is what keeps the
    // tile row from reflowing, and a binding cannot express that.
    latencyLabel: formatMs(hud.latencyMs),
    latencyP95Label: formatMs(hud.latencyP95),
    spreadLabel: formatBps(hud.spreadBps),
    tradesLabel: formatCompact(hud.tradesPerMin),
    exposureLabel: formatCompact(hud.exposure),
    winRateLabel: `${Math.round(hud.winRate * 100)}%`,
  })

  return hud
}

/** Forget the smoothed values — a new session starts without a history. */
export function resetHud() {
  smoothed = { latency: undefined, spread: undefined }
  return true
}
