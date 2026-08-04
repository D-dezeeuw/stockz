import { defineStrategy } from '../contract.js'
import { createRing } from '../../pipeline/ring.js'

/**
 * Micro range fade.
 *
 * Most of a scalping session is not trending. Price oscillates between two levels that
 * everyone can see, and the trade is to sell the top of that band and buy the bottom — with
 * a stop just beyond, because when the band finally breaks it breaks fast.
 *
 * Levels are built from **confirmed swings**: a local high is only a high once price has
 * come back off it, so a level always arrives a few prints late. That lateness is not a
 * defect to engineer away — a "level" called at the moment of the extreme is just the last
 * price, and fading the last price is not a strategy.
 *
 * Nearby swings are merged, because a level that price touched at 100.01, 100.00 and 99.99
 * is one level, and treating it as three both triples the touch count and makes each one
 * look untested.
 *
 * The invalidation matters more than the entry: **a broken level is deleted and any open
 * fade is closed immediately**, so this never fights a breakout. Range traders do not lose
 * money on ranges; they lose it on the one that ended.
 */

/** Prints a run keeps to find swings. */
export const RANGE_RING = 256

/**
 * Confirmed local highs and lows.
 *
 * @param {number[]} prices - prints, oldest first.
 * @param {number} fractal - how many prints must sit either side.
 * @returns {Array<{px: number, kind: string, index: number}>} the swings.
 */
export function swingPoints(prices, fractal) {
  const rows = (Array.isArray(prices) ? prices : []).map(Number).filter(Number.isFinite)
  const width = Math.max(1, Math.floor(Number(fractal) || 2))
  const swings = []

  // A local high is only a high once price has come back off it, so the scan stops `width`
  // short of the newest print. A level called at the moment of the extreme is just the last
  // price, and fading the last price is not a strategy.
  for (let i = width; i < rows.length - width; i += 1) {
    const px = rows[i]
    let high = true
    let low = true

    for (let j = i - width; j <= i + width; j += 1) {
      if (j === i) continue
      if (rows[j] >= px) high = false
      if (rows[j] <= px) low = false
    }

    if (high) swings.push({ px, kind: 'high', index: i })
    else if (low) swings.push({ px, kind: 'low', index: i })
  }

  return swings
}

/**
 * Merge nearby swings into levels.
 *
 * @param {Array} swings - the swings.
 * @param {number} mergeTicks - how close counts as the same level.
 * @param {number} tickSize - the instrument's tick.
 * @returns {Array<{px: number, kind: string, touches: number}>} the levels.
 */
export function levelCluster(swings, mergeTicks, tickSize) {
  const rows = Array.isArray(swings) ? swings : []
  const tick = Number(tickSize) > 0 ? Number(tickSize) : 0.01
  const window = Math.max(0, Number(mergeTicks) || 0) * tick
  const levels = []

  for (const swing of rows) {
    const px = Number(swing?.px)
    if (!Number.isFinite(px)) continue

    // A level touched at 100.01, 100.00 and 99.99 is one level. Three separate ones would
    // both triple the count and make each look untested.
    const hit = levels.find((level) => level.kind === swing.kind && Math.abs(level.px - px) <= window)
    if (!hit) {
      levels.push({ px: Number(px.toFixed(10)), kind: String(swing.kind), touches: 1 })
      continue
    }

    hit.touches += 1
    // The level sits at the average of its touches rather than at the first one, so a band
    // that drifted a tick over the session is described where it actually is.
    hit.px = Number((hit.px + (px - hit.px) / hit.touches).toFixed(10))
  }

  return levels
}

/**
 * Has price touched a level and printed a rejection?
 *
 * @param {{px?: number, kind?: string}} level - the level.
 * @param {number} px - the current print.
 * @param {number} prevPx - the previous print.
 * @param {number} rejectTicks - how close counts as a touch.
 * @param {number} tickSize - the instrument's tick.
 * @returns {string} 'buy', 'sell' or ''.
 */
export function touchReject(level, px, prevPx, rejectTicks, tickSize) {
  const at = Number(level?.px)
  const now = Number(px)
  const before = Number(prevPx)
  if (!Number.isFinite(at) || !Number.isFinite(now) || !Number.isFinite(before)) return ''

  const tick = Number(tickSize) > 0 ? Number(tickSize) : 0.01
  const near = Math.max(1, Number(rejectTicks) || 1) * tick
  if (Math.abs(before - at) > near) return ''

  // The rejection print, not the touch. Price at a level is a level being tested; price
  // coming back off it is a level holding, and only the second one is a trade.
  if (level.kind === 'high' && now < before) return 'sell'
  return level.kind === 'low' && now > before ? 'buy' : ''
}

/**
 * The entry, with its stop.
 *
 * @param {{px?: number, kind?: string, touches?: number}} level - the level.
 * @param {string} side - the fade direction.
 * @param {number} stopBufferTicks - how far beyond the level the stop sits.
 * @param {number} tickSize - the instrument's tick.
 * @returns {{action: string, strength: number, reason: string, stop: number}|null} the signal.
 */
export function fadeSignal(level, side, stopBufferTicks, tickSize) {
  const at = Number(level?.px)
  if (!Number.isFinite(at) || (side !== 'buy' && side !== 'sell')) return null

  const tick = Number(tickSize) > 0 ? Number(tickSize) : 0.01
  const buffer = Math.max(1, Number(stopBufferTicks) || 1) * tick
  const touches = Math.max(1, Number(level?.touches) || 1)

  return {
    action: side,
    // A level tested three times is a better fade than one tested once — and the ceiling
    // is deliberate, because a level tested ten times is one about to break.
    strength: Math.min(0.9, 0.4 + touches * 0.15),
    reason: `fade ${level.kind} ${at} (${touches} touches)`,
    stop: Number((side === 'buy' ? at - buffer : at + buffer).toFixed(10)),
  }
}

/**
 * Has a level been broken?
 *
 * @param {{px?: number, kind?: string}} level - the level.
 * @param {number} px - the current price.
 * @param {number} breakTicks - how far past counts as broken.
 * @param {number} tickSize - the instrument's tick.
 * @returns {boolean} true when broken.
 */
export function levelBreak(level, px, breakTicks, tickSize) {
  const at = Number(level?.px)
  const now = Number(px)
  if (!Number.isFinite(at) || !Number.isFinite(now)) return false

  const tick = Number(tickSize) > 0 ? Number(tickSize) : 0.01
  const past = Math.max(1, Number(breakTicks) || 1) * tick

  // Range traders do not lose money on ranges. They lose it on the one that ended, which is
  // why this is checked before anything else and why it deletes rather than downgrades.
  if (level.kind === 'high') return now > at + past
  return level.kind === 'low' ? now < at - past : false
}

/**
 * One print.
 *
 * @param {object} ctx - the strategy context.
 * @param {object} tick - the print.
 * @returns {object|null} the signal, or null.
 */
export function fadeTick(ctx, tick) {
  const state = ctx?.state
  const px = Number(tick?.px)
  if (!state?.prints || !Number.isFinite(px)) return null

  state.prints.push(px)
  const prevPx = state.lastPx
  state.lastPx = px
  const tickSize = Number(ctx.params?.tickSize) || 0.01

  // Invalidation first, always. A fade held through a break is the trade this whole module
  // exists to avoid.
  const broken = state.levels.filter((level) => levelBreak(level, px, ctx.params?.breakTicks, tickSize))
  if (broken.length > 0) {
    state.levels = state.levels.filter((level) => !broken.includes(level))
    if (state.entry) {
      state.entry = null
      return { action: 'flat', strength: 1, reason: 'level broke' }
    }
  }

  state.levels = levelCluster(
    swingPoints(state.prints.toArray(), ctx.params?.fractal),
    ctx.params?.mergeTicks,
    tickSize,
  )
  publishLevels(state.levels)

  if (state.entry) {
    const back = state.entry.side === 'buy' ? px >= state.entry.target : px <= state.entry.target
    if (!back) return null

    state.entry = null
    return { action: 'flat', strength: 1, reason: 'crossed the range' }
  }

  for (const level of state.levels) {
    const side = touchReject(level, px, prevPx, ctx.params?.rejectTicks, tickSize)
    if (!side) continue

    const signal = fadeSignal(level, side, ctx.params?.stopBufferTicks, tickSize)
    if (!signal) continue

    // The target is the opposite edge of the band: the trade was "this level holds", so the
    // other side of the range is where the reason to hold runs out.
    const opposite = state.levels.find((other) => other.kind !== level.kind)
    state.entry = { side, target: Number(opposite?.px) || (side === 'buy' ? px * 1.001 : px * 0.999) }

    return signal
  }

  return null
}

/**
 * Where published levels go. A no-op until the desk says otherwise.
 *
 * This strategy is the only one that has something to *show* — the band it is fading — and
 * the contract is explicit that a strategy never calls `setValue`. It used to anyway, and
 * that had two costs. The obvious one: a rule the contract states and one file breaks is a
 * rule nobody can rely on. The one that bit: importing `app/engine.js` here dragged the
 * bare specifier `spektrum` into the module graph of every strategy consumer — including
 * the backtest worker, which gets no importmap and would have failed to load with a
 * resolution error and no other symptom.
 *
 * Defaulting to a no-op is also what makes a backtest safe. A run scoring range-fade over
 * yesterday's tape must not repaint the live chart's level overlay, and with no sink
 * installed inside the worker it cannot.
 */
let levelSink = () => {}

/**
 * Tell the strategy where to send its level overlay.
 *
 * @param {(rows: object[]) => unknown} sink - the publisher, or null to silence it.
 * @returns {boolean} true once installed.
 */
export function setLevelSink(sink) {
  levelSink = typeof sink === 'function' ? sink : () => {}
  return true
}

/**
 * Publish the levels for the chart overlay.
 *
 * @param {object[]} levels - the clustered levels.
 * @returns {object[]} what was published.
 */
export function publishLevels(levels) {
  const rows = (Array.isArray(levels) ? levels : []).map((level) => ({
    px: Number(level?.px) || 0,
    kind: String(level?.kind ?? ''),
    touches: Number(level?.touches) || 0,
  }))

  levelSink(rows)
  return rows
}

/**
 * The strategy.
 */
export const rangeFadeStrategy = defineStrategy({
  id: 'range-fade',
  name: 'Micro range fade',
  params: {
    fractal: { kind: 'number', label: 'swing width (prints)', default: 3, min: 1, max: 20, step: 1 },
    mergeTicks: { kind: 'number', label: 'merge levels (ticks)', default: 2, min: 0, max: 50, step: 1 },
    rejectTicks: { kind: 'number', label: 'touch distance (ticks)', default: 2, min: 1, max: 50, step: 1 },
    stopBufferTicks: { kind: 'number', label: 'stop buffer (ticks)', default: 2, min: 1, max: 50, step: 1 },
    breakTicks: { kind: 'number', label: 'break distance (ticks)', default: 3, min: 1, max: 50, step: 1 },
    tickSize: { kind: 'number', label: 'tick size', default: 0.01, min: 0.00000001, max: 100, step: 0.01 },
  },
  init: (ctx) => {
    ctx.state.prints = createRing(RANGE_RING)
    ctx.state.levels = []
    ctx.state.lastPx = NaN
    ctx.state.entry = null
    return ctx.state
  },
  onTick: fadeTick,
  onCandle: () => null,
})
