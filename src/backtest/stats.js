/**
 * What a backtest actually earned.
 *
 * Fills are a tape; trades are what a human argues about. So the fill log is paired into
 * round trips first, and every statistic is computed from those — one definition of "a
 * trade", used by the report, by the sweep table and by the comparison view, rather than
 * three that drift.
 *
 * Pairing is **FIFO**, the same convention the desk's own ledger uses. Averaging the open
 * lots instead would produce a single blended entry that no individual trade ever had, and
 * the hold-time distribution — the thing a scalper is actually tuning — would collapse to
 * one number.
 *
 * Pure, and importing nothing: the sweep in F27.8 computes these inside a worker, where a
 * bare specifier would fail to resolve.
 */

/**
 * Pair a fill log into round-trip trades.
 *
 * @param {object[]} fills - the fills, in time order.
 * @returns {object[]} the closed trades; open inventory is not a trade.
 */
export function buildTradeList(fills) {
  const tape = Array.isArray(fills) ? fills : []
  /** Open lots, oldest first. */
  const lots = []
  const trades = []

  for (const fill of tape) {
    const side = fill?.side === 'sell' ? 'sell' : 'buy'
    let size = Math.abs(Number(fill?.size) || 0)
    const price = Number(fill?.price) || 0
    const fee = Math.abs(Number(fill?.fee) || 0)
    if (size <= 0 || price <= 0) continue

    // The fee is charged against the size actually transacted, so a fill that closes two
    // lots splits its fee across them rather than landing entirely on the first.
    const feePerUnit = fee / size

    while (size > 0 && lots.length > 0 && lots[0].side !== side) {
      const lot = lots[0]
      const matched = Math.min(size, lot.size)
      const long = lot.side === 'buy'
      const gross = (long ? price - lot.price : lot.price - price) * matched
      const fees = matched * (lot.feePerUnit + feePerUnit)

      trades.push({
        side: long ? 'long' : 'short',
        size: Number(matched.toFixed(8)),
        entryPx: lot.price,
        exitPx: price,
        openTs: lot.ts,
        closeTs: Number(fill?.ts) || 0,
        // The number a scalper tunes. Milliseconds, because at this frequency seconds
        // round away the difference between the good trades and the bad ones.
        holdMs: Math.max(0, (Number(fill?.ts) || 0) - lot.ts),
        gross: Number(gross.toFixed(8)),
        fees: Number(fees.toFixed(8)),
        // Net, always. A gross P&L at scalping frequency is a number that says the
        // opposite of the truth often enough to be worse than none.
        net: Number((gross - fees).toFixed(8)),
        reason: String(lot.reason ?? ''),
      })

      lot.size -= matched
      size -= matched
      if (lot.size <= 1e-12) lots.shift()
    }

    // Whatever is left opens (or extends) inventory on this side.
    if (size > 0) {
      lots.push({ side, size, price, ts: Number(fill?.ts) || 0, feePerUnit, reason: String(fill?.reason ?? '') })
    }
  }

  return trades
}

/**
 * The one number a scalper cares about: expected P&L per trade.
 *
 * @param {object[]} trades - the round trips.
 * @returns {object} win rate, average win and loss, expectancy, totals.
 */
export function computeExpectancy(trades) {
  const rows = Array.isArray(trades) ? trades : []
  const nets = rows.map((trade) => Number(trade?.net) || 0)

  const wins = nets.filter((net) => net > 0)
  const losses = nets.filter((net) => net < 0)
  const total = nets.reduce((sum, net) => sum + net, 0)
  // Scratches count in the denominator. A strategy that scratches nine trades out of ten
  // has an expectancy near zero, and excluding them would report the tenth trade's edge as
  // if it were the strategy's.
  const count = nets.length

  const avgWin = wins.length > 0 ? wins.reduce((s, n) => s + n, 0) / wins.length : 0
  const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, n) => s + n, 0) / losses.length) : 0

  return {
    trades: count,
    wins: wins.length,
    losses: losses.length,
    // Scratches named rather than hidden: they are the difference between "no edge" and
    // "no fills", and the two need very different fixes.
    scratches: count - wins.length - losses.length,
    winRate: count > 0 ? Number((wins.length / count).toFixed(4)) : 0,
    avgWin: Number(avgWin.toFixed(6)),
    avgLoss: Number(avgLoss.toFixed(6)),
    net: Number(total.toFixed(6)),
    fees: Number(rows.reduce((sum, t) => sum + (Number(t?.fees) || 0), 0).toFixed(6)),
    expectancy: count > 0 ? Number((total / count).toFixed(6)) : 0,
    // Gross win over gross loss. Above 1 the strategy makes money; the ratio says how
    // much room it has before a worse fill model eats it.
    profitFactor:
      losses.length > 0
        ? Number((wins.reduce((s, n) => s + n, 0) / Math.abs(losses.reduce((s, n) => s + n, 0))).toFixed(4))
        : wins.length > 0
          ? Infinity
          : 0,
  }
}

/**
 * The worst peak-to-trough the run went through.
 *
 * @param {object[]} trades - the round trips, in close order.
 * @returns {object} the maximum drawdown and where it happened.
 */
export function computeDrawdown(trades) {
  const rows = Array.isArray(trades) ? trades : []
  let equity = 0
  let peak = 0
  let worst = 0
  let peakAt = 0
  let troughAt = 0
  let atPeak = 0

  for (const trade of rows) {
    equity += Number(trade?.net) || 0
    if (equity > peak) {
      peak = equity
      atPeak = Number(trade?.closeTs) || 0
    }

    const draw = peak - equity
    if (draw > worst) {
      worst = draw
      peakAt = atPeak
      troughAt = Number(trade?.closeTs) || 0
    }
  }

  return {
    maxDrawdown: Number(worst.toFixed(6)),
    peak: Number(peak.toFixed(6)),
    final: Number(equity.toFixed(6)),
    peakAt,
    troughAt,
    // How long the trader spent underwater between the high and the low. "Does it make
    // money" is the easy question; "how long does it make you wait" is the one that
    // decides whether a strategy is survivable.
    underwaterMs: troughAt > peakAt ? troughAt - peakAt : 0,
  }
}

/**
 * The cumulative P&L series, downsampled to a drawable number of points.
 *
 * @param {object[]} trades - the round trips.
 * @param {number} [points] - the target point count.
 * @returns {{i: number, equity: number, ts: number}[]} the series.
 */
export function equityCurve(trades, points = 200) {
  const rows = Array.isArray(trades) ? trades : []
  if (rows.length === 0) return []

  const target = Math.max(2, Math.floor(Number(points) || 200))
  const full = []
  let equity = 0
  for (const [i, trade] of rows.entries()) {
    equity += Number(trade?.net) || 0
    full.push({ i, equity: Number(equity.toFixed(6)), ts: Number(trade?.closeTs) || 0 })
  }

  if (full.length <= target) return full

  // Strided, and the **last point is always kept**: a downsample that dropped the tail
  // would draw a curve ending somewhere the run never was, which is the one part of an
  // equity chart everybody reads first.
  const step = (full.length - 1) / (target - 1)
  const out = []
  for (let n = 0; n < target - 1; n += 1) out.push(full[Math.round(n * step)])
  out.push(full.at(-1))

  return out
}

/**
 * Everything the report and the sweep table need, from one run.
 *
 * @param {object} result - what the backtest worker returned.
 * @param {number} [points] - the equity curve's target resolution.
 * @returns {object} the statistics.
 */
export function summariseRun(result, points = 200) {
  const trades = buildTradeList(result?.fills)
  const expectancy = computeExpectancy(trades)
  const drawdown = computeDrawdown(trades)

  return {
    strategyId: String(result?.strategyId ?? ''),
    instrument: String(result?.instrument ?? ''),
    params: result?.params ?? {},
    fillConfig: result?.fillConfig ?? {},
    signals: Array.isArray(result?.signals) ? result.signals.length : 0,
    fills: Array.isArray(result?.fills) ? result.fills.length : 0,
    unfilled: Number(result?.unfilled) || 0,
    // The round trips themselves, under a name of their own. `computeExpectancy` publishes
    // `trades` as the *count* — which is what every tile and every sweep row wants — so a
    // list under the same key would be silently overwritten by the spread below, and the
    // export would ship a number where the trades should be.
    tradeList: trades,
    ...expectancy,
    ...drawdown,
    curve: equityCurve(trades, points),
  }
}
