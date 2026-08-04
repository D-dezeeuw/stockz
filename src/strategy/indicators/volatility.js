/**
 * Volatility and volume context.
 *
 * Same closure API as the trend pair, same rule: O(1) per update, nothing allocated in the
 * hot path, and every indicator knows whether it is warm.
 *
 * The stddev uses Welford rather than the textbook `E[x²] - E[x]²`. On instrument prices —
 * numbers near 60000 whose variance is near 1 — the textbook form subtracts two nearly
 * equal large numbers and loses most of its significant digits, which is how a band
 * indicator ends up returning a negative variance.
 */

/**
 * Session-anchored VWAP.
 *
 * @returns {{update: (px: number, vol: number) => number, value: () => number,
 *   volume: () => number, warm: () => boolean, reset: () => void}} the indicator.
 */
export function createVwap() {
  let pv = 0
  let volume = 0
  let value = 0

  return {
    update(px, vol) {
      const price = Number(px)
      const size = Number(vol)
      // A print with no size does not move a *volume*-weighted average, and counting it
      // would quietly turn VWAP into a plain mean.
      if (!Number.isFinite(price) || !Number.isFinite(size) || size <= 0) return value

      pv += price * size
      volume += size
      value = pv / volume
      return value
    },
    value: () => value,
    volume: () => volume,
    warm: () => volume > 0,
    reset() {
      pv = 0
      volume = 0
      value = 0
    },
  }
}

/**
 * The honest range of a bar, gaps included.
 *
 * @param {{h?: number, l?: number}} candle - the bar.
 * @param {number} prevClose - the previous close.
 * @returns {number} the true range.
 */
export function trueRange(candle, prevClose) {
  const high = Number(candle?.h)
  const low = Number(candle?.l)
  if (!Number.isFinite(high) || !Number.isFinite(low)) return 0

  const range = Math.abs(high - low)
  const prev = Number(prevClose)
  // Without the previous close, a gap through the whole bar reads as a quiet bar — which
  // is the single most dangerous thing a volatility number can say.
  if (!Number.isFinite(prev)) return range

  return Math.max(range, Math.abs(high - prev), Math.abs(low - prev))
}

/**
 * Wilder-smoothed average true range.
 *
 * @param {number} period - the period, conventionally 14.
 * @returns {{update: (candle: object) => number, value: () => number, warm: () => boolean,
 *   samples: () => number, reset: () => void}} the indicator.
 */
export function createAtr(period) {
  const span = Math.max(1, Math.floor(Number(period) || 14))

  let value = 0
  let samples = 0
  let prevClose = NaN

  return {
    update(candle) {
      const tr = trueRange(candle, prevClose)
      const close = Number(candle?.c)
      if (Number.isFinite(close)) prevClose = close
      if (!Number.isFinite(Number(candle?.h)) || !Number.isFinite(Number(candle?.l))) return value

      samples += 1
      // Simple mean until the period is filled, Wilder smoothing after — starting the
      // smoothing from zero holds the reading low for far longer than the period.
      value = samples <= span ? value + (tr - value) / samples : (value * (span - 1) + tr) / span

      return value
    },
    value: () => value,
    warm: () => samples >= span,
    samples: () => samples,
    reset() {
      value = 0
      samples = 0
      prevClose = NaN
    },
  }
}

/**
 * Welford rolling standard deviation.
 *
 * @param {number} window - how many samples the window holds.
 * @returns {{update: (x: number) => number, value: () => number, mean: () => number,
 *   warm: () => boolean, samples: () => number, reset: () => void}} the indicator.
 */
export function createStddev(window) {
  const span = Math.max(2, Math.floor(Number(window) || 20))
  const buffer = new Array(span).fill(0)

  let count = 0
  let index = 0
  let mean = 0
  let m2 = 0
  let value = 0

  const recompute = () => {
    const n = Math.min(count, span)
    if (n < 2) {
      value = 0
      return
    }
    value = Math.sqrt(Math.max(0, m2 / (n - 1)))
  }

  return {
    update(x) {
      const num = Number(x)
      if (!Number.isFinite(num)) return value

      if (count >= span) {
        // Evicting the oldest sample: Welford's update run backwards, so the window stays
        // exact rather than drifting the way a decay-only approximation would.
        const old = buffer[index]
        const n = span
        const meanBefore = mean
        mean = (n * mean - old) / (n - 1)
        m2 -= (old - mean) * (old - meanBefore)
        count -= 1
      }

      count += 1
      const delta = num - mean
      mean += delta / Math.min(count, span)
      m2 += delta * (num - mean)
      buffer[index] = num
      index = (index + 1) % span

      recompute()
      return value
    },
    value: () => value,
    mean: () => mean,
    warm: () => count >= span,
    samples: () => count,
    reset() {
      buffer.fill(0)
      count = 0
      index = 0
      mean = 0
      m2 = 0
      value = 0
    },
  }
}

/**
 * How stretched a value is, in standard deviations.
 *
 * @param {number} x - the value.
 * @param {number} mean - the mean.
 * @param {number} stddev - the standard deviation.
 * @returns {number} the z-score.
 */
export function zscore(x, mean, stddev) {
  const value = Number(x)
  const mu = Number(mean)
  const sigma = Number(stddev)
  if (!Number.isFinite(value) || !Number.isFinite(mu)) return 0
  // A flat series has no scale to measure against. Returning Infinity would make a dead
  // market look like the most extreme move ever recorded.
  if (!Number.isFinite(sigma) || sigma <= 0) return 0

  return Number(((value - mu) / sigma).toFixed(6))
}
