/**
 * Trend indicators, incremental and allocation-free.
 *
 * These run on **every tick of every instrument of every running strategy**, which is the
 * hottest path in the desk. So they are closures over a handful of numbers with an
 * `update(x)` that allocates nothing and does O(1) work — no arrays of history, no slicing
 * a window per tick, no object literal per update.
 *
 * Both report their own warmup. An EMA seeded on its first sample and an RSI with three
 * samples of a fourteen-period average are not wrong so much as *not yet meaningful*, and
 * a strategy acting on them is acting on noise dressed as a reading.
 */

/**
 * An exponential moving average.
 *
 * @param {number} period - the period.
 * @returns {{update: (x: number) => number, value: () => number, warm: () => boolean,
 *   samples: () => number, reset: () => void}} the indicator.
 */
export function createEma(period) {
  const span = Math.max(1, Math.floor(Number(period) || 1))
  const alpha = 2 / (span + 1)

  let value = 0
  let samples = 0

  return {
    update(x) {
      const num = Number(x)
      // A junk print does not move the average and does not count toward warmup. Treating
      // it as a sample would let one bad frame declare the indicator ready.
      if (!Number.isFinite(num)) return value

      samples += 1
      // Seeded on the first sample rather than crawling out of zero: an EMA that spends
      // its first hundred ticks climbing from 0 to 60000 is not a slow reading, it is a
      // wrong one.
      value = samples === 1 ? num : value + alpha * (num - value)
      return value
    },
    value: () => value,
    warm: () => samples >= span,
    samples: () => samples,
    reset() {
      value = 0
      samples = 0
    },
  }
}

/**
 * A Wilder-smoothed relative strength index.
 *
 * @param {number} period - the period, conventionally 14.
 * @returns {{update: (x: number) => number, value: () => number, warm: () => boolean,
 *   samples: () => number, reset: () => void}} the indicator.
 */
export function createRsi(period) {
  const span = Math.max(1, Math.floor(Number(period) || 14))

  let avgGain = 0
  let avgLoss = 0
  let prev = NaN
  let samples = 0
  let value = 50

  return {
    update(x) {
      const num = Number(x)
      if (!Number.isFinite(num)) return value

      if (!Number.isFinite(prev)) {
        prev = num
        return value
      }

      const change = num - prev
      prev = num
      const gain = change > 0 ? change : 0
      const loss = change < 0 ? -change : 0
      samples += 1

      if (samples <= span) {
        // Seeded as a simple mean over the first `span` changes, which is what Wilder
        // specified — starting the smoothing from zero biases the first readings low for
        // longer than the period itself.
        avgGain += (gain - avgGain) / samples
        avgLoss += (loss - avgLoss) / samples
      } else {
        avgGain = (avgGain * (span - 1) + gain) / span
        avgLoss = (avgLoss * (span - 1) + loss) / span
      }

      // No losses at all is 100 by definition, not a division by zero.
      if (avgLoss === 0) value = avgGain === 0 ? 50 : 100
      else value = 100 - 100 / (1 + avgGain / avgLoss)

      return value
    },
    value: () => value,
    warm: () => samples >= span,
    samples: () => samples,
    reset() {
      avgGain = 0
      avgLoss = 0
      prev = NaN
      samples = 0
      value = 50
    },
  }
}

/**
 * Has an indicator seen enough to be believed?
 *
 * @param {{samples?: Function|number, warm?: Function}} indicator - the indicator.
 * @param {number} [period] - the period to compare against.
 * @returns {boolean} true when warm.
 */
export function isWarm(indicator, period) {
  if (typeof indicator?.warm === 'function' && period === undefined) return indicator.warm()

  const seen =
    typeof indicator?.samples === 'function' ? indicator.samples() : Number(indicator?.samples)
  const span = Number(period)
  if (!Number.isFinite(seen)) return false

  return Number.isFinite(span) ? seen >= span : seen > 0
}

/**
 * Did two series cross between the previous pair and this one?
 *
 * @param {number} a - series A now.
 * @param {number} b - series B now.
 * @param {number} prevA - series A before.
 * @param {number} prevB - series B before.
 * @returns {number} 1 for a crossing up, -1 for down, 0 for no cross.
 */
export function crossed(a, b, prevA, prevB) {
  const now = Number(a) - Number(b)
  const before = Number(prevA) - Number(prevB)
  if (!Number.isFinite(now) || !Number.isFinite(before)) return 0

  // Touching is not crossing. A pair that met exactly and separated the same way would
  // otherwise fire twice on one event.
  if (before < 0 && now > 0) return 1
  if (before > 0 && now < 0) return -1

  return 0
}
