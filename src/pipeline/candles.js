import { createRing } from './ring.js'

/**
 * Candle aggregation.
 *
 * Scalping timeframes are seconds, not minutes, so the desk builds its own candles from
 * raw prints rather than asking the venue for 1m bars. Two reasons: the venue's smallest
 * bar is usually too coarse to scalp, and a locally built bar closes the instant the
 * clock does, with no round-trip.
 *
 * Bucketing is deliberately by wall-clock boundary, not by "N seconds since the first
 * print" — two instruments must produce bars that line up, or comparing them is
 * meaningless.
 */

/** Timeframes the desk builds, in milliseconds. */
export const TIMEFRAMES = Object.freeze({ '1s': 1000, '5s': 5000, '1m': 60000 })

/** symbol|tf -> ring of candles. */
const series = new Map()

/**
 * The bucket a timestamp belongs to.
 *
 * @param {number} ts - epoch ms.
 * @param {number} intervalMs - bucket size.
 * @returns {number} bucket start, aligned to the wall clock.
 */
export function bucketStart(ts, intervalMs) {
  const time = Number(ts)
  const size = Number(intervalMs)
  if (!Number.isFinite(time) || !Number.isFinite(size) || size <= 0) return 0

  return Math.floor(time / size) * size
}

/**
 * Fold a print into a candle, creating or extending it.
 *
 * @param {object|null} candle - the open candle, or null to start one.
 * @param {{px: number, sz?: number, ts?: number}} trade - the print.
 * @param {number} bucket - bucket start for this print.
 * @returns {object} the candle after folding.
 */
export function foldTrade(candle, trade, bucket) {
  const px = Number(trade?.px)
  const sz = Number(trade?.sz ?? 0)
  const size = Number.isFinite(sz) ? sz : 0

  if (!candle || candle.ts !== bucket) {
    return { ts: bucket, o: px, h: px, l: px, c: px, v: size, n: 1 }
  }

  return {
    ts: bucket,
    o: candle.o,
    h: Math.max(candle.h, px),
    l: Math.min(candle.l, px),
    c: px,
    v: candle.v + size,
    n: candle.n + 1,
  }
}

/**
 * Add a print to a symbol's series across every timeframe.
 *
 * @param {string} symbol - instrument.
 * @param {{px: number, sz?: number, ts?: number}} trade - the print.
 * @param {number} [capacity] - candles retained per timeframe.
 * @returns {Record<string, object>} the open candle per timeframe.
 */
export function addTrade(symbol, trade, capacity = 600) {
  const key = String(symbol ?? '')
  const px = Number(trade?.px)
  if (!key || !Number.isFinite(px)) return {}

  const open = {}
  for (const [tf, intervalMs] of Object.entries(TIMEFRAMES)) {
    const id = `${key}|${tf}`
    if (!series.has(id)) series.set(id, createRing(capacity))

    const ring = series.get(id)
    const bucket = bucketStart(trade?.ts ?? 0, intervalMs)
    const current = ring.last()

    const next = foldTrade(current, trade, bucket)
    // Same bucket: replace the open candle in place rather than appending a duplicate.
    if (current && current.ts === bucket) ring.replaceLast(next)
    else ring.push(next)

    open[tf] = next
  }
  return open
}

/**
 * Read a symbol's candles.
 *
 * @param {string} symbol - instrument.
 * @param {string} tf - a TIMEFRAMES key.
 * @param {number} [limit] - how many, newest-biased.
 * @returns {object[]} candles, oldest first.
 */
export function candles(symbol, tf, limit) {
  return series.get(`${String(symbol ?? '')}|${tf}`)?.toArray(limit) ?? []
}

/**
 * Volume-weighted average price across a candle series — the reference a mean-reversion
 * scalp measures deviation from.
 *
 * @param {object[]} list - candles.
 * @returns {number} VWAP, or 0 without volume.
 */
export function vwap(list) {
  const rows = Array.isArray(list) ? list : []
  let pv = 0
  let volume = 0

  for (const candle of rows) {
    const typical = (Number(candle?.h) + Number(candle?.l) + Number(candle?.c)) / 3
    const v = Number(candle?.v)
    if (!Number.isFinite(typical) || !Number.isFinite(v) || v <= 0) continue

    pv += typical * v
    volume += v
  }
  return volume > 0 ? pv / volume : 0
}

/** Forget every series. */
export function resetCandles() {
  series.clear()
}
