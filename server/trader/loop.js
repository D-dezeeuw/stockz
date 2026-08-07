import { startFeed } from './feed.js'
import { fetchAccountConfig, canTrade, fetchInstruments } from './venue.js'
import { createDesk, applyFill, recordOutcome, strongestSignal, decide, sendOrder } from './engine.js'
import { createLogger } from '../../src/utils/log.js'

/**
 * The running trader: feed in, orders out, a snapshot for anyone watching.
 *
 * This is the piece that makes the desk a desk rather than a page. It owns no UI, reads no
 * DOM and never waits for a browser — a phone opening the dashboard is a reader joining
 * something already in progress, and closing it changes nothing.
 *
 * Everything it knows is in `snapshot()`, which is what `/api/trader` serves. Deliberately
 * a plain object rebuilt on demand rather than a stream: the dashboard polls it a few
 * times a second at most, and a pull model means a slow or absent reader can never apply
 * back-pressure to the order path.
 */

const log = createLogger('trader-loop')

/** How many recent decisions to keep for the dashboard's feed. */
export const DECISION_LOG = 200

/**
 * Create the trader. Nothing happens until `start()`.
 *
 * @param {object} config - the trader config.
 * @param {{feed?: Function, send?: Function, now?: () => number}} [deps] - injectable plumbing.
 * @returns {object} the trader.
 */
export function createTrader(config, deps = {}) {
  const now = deps.now ?? (() => Date.now())
  const desks = new Map(
    config.symbols.map((instrument) => [instrument, createDesk(instrument, config.sensitivity)]),
  )

  // Order timestamps for the throttle, and the decision ring the dashboard renders.
  const sent = []
  const decisions = []
  // A monotonic counter, because a timestamp is not an identity. OKX stamps several prints
  // in the same millisecond, so two decisions from one strategy on one instrument can share
  // (ts, strategy, action) exactly — which the dashboard was using as its render key, and
  // which the engine warned about on every frame ("duplicate key ...:vwap-revert:flat").
  let seq = 0
  const stats = { signals: 0, orders: 0, blocked: 0, errors: 0, startedAt: 0 }
  let feed = null

  /**
   * What the venue said about this key before a single order was sent.
   *
   * `blocked` is the important one: a permission refusal is *permanent*, and a loop that
   * treats it as a per-order failure re-sends the same impossible order on every signal.
   * One session produced 1795 of them. Once blocked, the loop keeps reading the market and
   * keeps deciding — the strategies are still worth watching — but books its fills on paper
   * instead of asking the venue again.
   */
  const venue = { checked: false, perm: '', canTrade: false, blocked: '', unlisted: [] }

  /** Rejections that will never succeed however many times they are retried. */
  const PERMANENT = /permission|not have trading|does not exist|not supported|unavailable/i

  /**
   * One in-flight handler per instrument, chained.
   *
   * Handling an event is `async` — it awaits the venue — and the socket calls it once per
   * message. Without this, a trade arriving while the previous order is still in flight
   * starts a *second* handler that reads `desk.position` before the first has written it,
   * so both size against the same stale number and both pass the cap. On paper that is
   * invisible (the await resolves immediately); against a real venue, where a market order
   * is a ~100ms round trip and prints arrive every few milliseconds, it means dozens of
   * concurrent handlers and a position orders of magnitude past its limit. Caught by a
   * replay that fired events without awaiting them, which is exactly what a socket does.
   *
   * Per instrument rather than globally: BTC and ETH share no state, and serialising them
   * together would make a slow venue call on one stall the other's book updates.
   */
  const chains = new Map()

  const enqueue = (instrument, task) => {
    const previous = chains.get(instrument) ?? Promise.resolve()
    // `.then(task, task)` — a failed predecessor must not cancel its successors. The chain
    // is for ordering, not for propagating outcomes.
    const next = previous.then(task, task)
    chains.set(instrument, next.catch(() => {}))
    return next
  }

  const remember = (entry) => {
    seq += 1
    decisions.push({ seq, ...entry })
    // A ring, not a growing array: this process is meant to run for weeks.
    if (decisions.length > DECISION_LOG) decisions.splice(0, decisions.length - DECISION_LOG)
  }

  /**
   * Handle one parsed feed event.
   *
   * @param {object} event - from `parseFeedFrame`.
   * @returns {Promise<void>} resolves once any order has been sent.
   */
  const onEvent = async (event) => {
    const desk = desks.get(String(event?.instrument ?? ''))
    if (!desk) return

    if (event.kind === 'book') {
      desk.book = event.book
      return
    }
    if (event.kind !== 'trades') return

    for (const trade of event.trades) {
      const at = Number(trade.ts) || now()
      const signal = strongestSignal(desk, trade, at)
      if (signal.action !== 'none') stats.signals += 1

      const verdict = decide(desk, signal, { now: at, sent, config })
      if (!verdict.send) {
        // Only a real opinion that was refused is worth recording. Logging every neutral
        // tick would bury the one line that explains a quiet session.
        if (signal.action !== 'none') {
          stats.blocked += 1
          remember({ ts: at, instrument: desk.instrument, strategy: signal.strategy,
            action: signal.action, taken: false, reason: verdict.reason })
        }
        continue
      }

      // Blocked means paper, not silence: the desk keeps showing what the strategies would
      // have done, and the snapshot says plainly why nothing reached the venue.
      const routing = venue.blocked ? { ...config, live: false } : config
      const fill = await sendOrder(verdict.order, desk, routing, deps)
      if (!fill.ok) {
        stats.errors += 1
        // A permanent refusal is learned once. Retrying it per signal is how a key with no
        // trade permission produced a four-figure error count and nothing else.
        if (config.live && !venue.blocked && PERMANENT.test(fill.error ?? '')) {
          venue.blocked = fill.error
          log.warn(`venue refused permanently — falling back to paper: ${fill.error}`)
        }
        remember({ ts: at, instrument: desk.instrument, strategy: signal.strategy,
          action: signal.action, taken: false, reason: fill.error })
        continue
      }

      sent.push(at)
      // Pruned here, not just measured. `throttleGate` returns the surviving window and
      // `decide` discarded it, so this array grew for the life of the process — a slow leak
      // and, worse, an O(n) filter re-run on every single signal, which gets more expensive
      // the longer the desk stays up. Trimmed in place so the array identity the throttle
      // reads stays the same one.
      const cutoff = at - 60000
      let keep = 0
      while (keep < sent.length && sent[keep] < cutoff) keep += 1
      if (keep > 0) sent.splice(0, keep)
      stats.orders += 1
      const realized = applyFill(desk, { side: verdict.order.side, size: verdict.order.size, px: fill.px })
      recordOutcome(desk, realized, at, config)
      remember({ ts: at, instrument: desk.instrument, strategy: signal.strategy,
        action: signal.action, taken: true, reason: verdict.reason, px: fill.px,
        size: verdict.order.size, realized })
    }
  }

  return {
    /**
     * Open the feed and begin trading.
     *
     * @returns {object} the trader, for chaining.
     */
    start() {
      if (feed) return this
      stats.startedAt = now()

      // Asked once, before the first signal can turn into an order. Not awaited: the feed
      // and the strategies have nothing to do with the answer, and blocking the loop's
      // start on a venue round trip would mean a slow OKX delays the market data too.
      if (config.live && config.hasKeys) {
        this.preflight().catch((err) => log.warn(`preflight failed: ${err?.message ?? err}`))
      }

      feed = (deps.feed ?? startFeed)({
        symbols: config.symbols,
        demo: config.demo,
        // Errors are swallowed rather than allowed to reject into the socket's message
        // handler, where nothing would catch them and the feed would look healthy.
        onEvent: (event) => {
          enqueue(String(event?.instrument ?? ''), () =>
            onEvent(event).catch((err) => {
              stats.errors += 1
              log.warn(`event failed: ${err?.message ?? err}`)
            }),
          )
        },
      })

      log.info(
        `trader up: ${config.symbols.join(', ')} · ${config.live ? 'LIVE' : 'paper'} · ` +
          `clip ${config.size} · ${config.maxPerMin}/min`,
      )
      return this
    },

    /**
     * Ask the venue what this key may do, and whether the symbols exist.
     *
     * Both halves of "why was my order refused", answered up front instead of once per
     * signal: a key without `trade` permission, and a symbol that is delisted, suspended or
     * mistyped. They fail identically at the order endpoint and have completely different
     * fixes.
     *
     * @returns {Promise<object>} the venue findings.
     */
    async preflight() {
      const account = await fetchAccountConfig(config, deps)
      venue.checked = true

      if (!account.ok) {
        venue.blocked = account.error
        log.warn(`venue preflight failed: ${account.error}`)
        return venue
      }

      venue.perm = account.perm
      venue.canTrade = canTrade(account.perm)
      if (!venue.canTrade) {
        // Named exactly, because the fix is two minutes on OKX's API page and impossible to
        // guess from a rejected order.
        venue.blocked = `key has no trade permission (perm: ${account.perm || 'none'}) — enable Trade on the API key`
        log.warn(venue.blocked)
      }

      const listed = await fetchInstruments(config, 'SPOT', deps)
      if (listed.ok) {
        venue.unlisted = config.symbols.filter((s) => !listed.live.includes(s))
        if (venue.unlisted.length > 0) {
          log.warn(`not tradable on this venue: ${venue.unlisted.join(', ')}`)
        }
      }

      return venue
    },

    /** Stop trading and close the feed. */
    stop() {
      feed?.close?.()
      feed = null
      return this
    },

    /**
     * Everything a dashboard needs, in one object.
     *
     * @returns {object} the snapshot.
     */
    snapshot() {
      const at = now()
      return {
        running: Boolean(feed),
        // The *effective* mode. A blocked venue means orders are being booked on paper
        // however the config reads, and a snapshot that still said LIVE would be lying to
        // the one person who needs to know.
        live: config.live === true && !venue.blocked,
        venue: { ...venue },
        feed: feed?.state?.() ?? 'dead',
        startedAt: stats.startedAt,
        uptimeMs: stats.startedAt ? at - stats.startedAt : 0,
        symbols: config.symbols,
        size: config.size,
        stats: { ...stats },
        // Newest first: a decision list is read top-down, and the interesting row is the
        // one that just happened.
        decisions: decisions.slice(-100).reverse(),
        desks: [...desks.values()].map((desk) => ({
          instrument: desk.instrument,
          position: desk.position,
          avgPx: desk.avgPx,
          realized: desk.realized,
          unrealized: desk.position !== 0 && desk.book.mid > 0
            ? (desk.book.mid - desk.avgPx) * desk.position
            : 0,
          bid: desk.book.bid,
          ask: desk.book.ask,
          benchedFor: Math.max(0, desk.cooldownUntil - at),
        })),
      }
    },

    /** The instrument records, for tests. */
    desks,
  }
}
