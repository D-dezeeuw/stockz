import { setValue } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { createLogger } from '../utils/log.js'

/**
 * The dashboard's window onto the server-side trader.
 *
 * The loop that trades does not live here any more. It runs in the Node process on the
 * host, all day, whether or not a browser is open — so this module's whole job is to ask
 * what happened and publish the answer. It sends nothing, decides nothing, and cannot stop
 * anything: a phone glancing at the desk must never be able to halt a trading loop it is
 * only watching.
 *
 * Polled rather than streamed. The snapshot is small, the dashboard wants it a few times a
 * minute, and a pull model means a reader on a train tunnel's worth of latency can never
 * apply back-pressure to the order path. It also means a dropped connection needs no
 * recovery logic — the next poll simply works.
 */

const log = createLogger('trader-mirror')

/** Where the server publishes its snapshot. */
export const TRADER_ENDPOINT = '/api/trader'

/** How often to ask. Fast enough to feel live, slow enough to cost nothing. */
export const POLL_MS = 2000

/** The shape published when the server has no trader — an honest "off", not a blank. */
export const TRADER_OFF = Object.freeze({
  running: false,
  live: false,
  feed: 'off',
  uptimeMs: 0,
  symbols: [],
  stats: { signals: 0, orders: 0, blocked: 0, errors: 0 },
  decisions: [],
  desks: [],
})

/**
 * Normalise a snapshot into the shape the block binds to.
 *
 * Every field is defaulted rather than trusted: this is the one place a server that is
 * older than the page can disagree with it, and a missing field must render as "nothing
 * yet" rather than as a broken binding.
 *
 * @param {object} raw - the server's snapshot.
 * @returns {object} the view model.
 */
export function toTraderView(raw) {
  if (!raw || typeof raw !== 'object') return { ...TRADER_OFF }

  const stats = raw.stats ?? {}
  return {
    running: raw.running === true,
    live: raw.live === true,
    feed: String(raw.feed ?? 'dead'),
    uptimeMs: Number(raw.uptimeMs) || 0,
    symbols: Array.isArray(raw.symbols) ? raw.symbols : [],
    stats: {
      signals: Number(stats.signals) || 0,
      orders: Number(stats.orders) || 0,
      blocked: Number(stats.blocked) || 0,
      errors: Number(stats.errors) || 0,
    },
    decisions: (Array.isArray(raw.decisions) ? raw.decisions : []).map((d) => ({
      ts: Number(d?.ts) || 0,
      time: new Date(Number(d?.ts) || 0).toISOString().slice(11, 19),
      instrument: String(d?.instrument ?? ''),
      strategy: String(d?.strategy ?? ''),
      action: String(d?.action ?? ''),
      taken: d?.taken === true,
      reason: String(d?.reason ?? ''),
      px: Number(d?.px) || 0,
      realized: Number(d?.realized) || 0,
    })),
    desks: (Array.isArray(raw.desks) ? raw.desks : []).map((desk) => ({
      instrument: String(desk?.instrument ?? ''),
      position: Number(desk?.position) || 0,
      avgPx: Number(desk?.avgPx) || 0,
      realized: Number(desk?.realized) || 0,
      unrealized: Number(desk?.unrealized) || 0,
      benched: Number(desk?.benchedFor) > 0,
    })),
  }
}

/**
 * A one-line summary of the loop, for the header.
 *
 * @param {object} view - the view model.
 * @returns {string} e.g. 'server: LIVE · 12 orders · 340 signals'.
 */
export function traderSummary(view) {
  if (!view?.running) return 'server trader: off'

  const mode = view.live ? 'LIVE' : 'paper'
  const { orders, signals, blocked } = view.stats
  return `server ${mode} · ${orders} sent · ${signals} signals · ${blocked} blocked`
}

/**
 * Ask the server once and publish what it said.
 *
 * @param {{fetch?: Function}} [deps] - injectable transport.
 * @returns {Promise<object>} the view model published.
 */
export async function pollTrader(deps = {}) {
  const fetchImpl = deps.fetch ?? globalThis.fetch

  let view
  try {
    const response = await fetchImpl(TRADER_ENDPOINT, { headers: { accept: 'application/json' } })
    view = toTraderView(await response.json())
  } catch (err) {
    // An unreachable server is "off", not an error the trader has to dismiss — the desk
    // is a viewer here, and a failed poll is fixed by the next one.
    log.debug(`poll failed: ${err?.message ?? err}`)
    view = { ...TRADER_OFF }
  }

  setValue(PATHS.trader.view, view)
  setValue(PATHS.trader.summary, traderSummary(view))
  return view
}

/**
 * Keep the mirror current.
 *
 * @param {{everyMs?: number, timer?: object, poll?: Function}} [options] - the schedule.
 * @returns {() => void} stop.
 */
export function startTraderMirror(options = {}) {
  const timer = options.timer ?? globalThis
  const poll = options.poll ?? pollTrader
  const everyMs = Number(options.everyMs) > 0 ? Number(options.everyMs) : POLL_MS

  // Immediately, then on the interval: a dashboard that showed "off" for two seconds after
  // every load would have people reaching for the logs.
  poll().catch(() => {})
  const handle = timer.setInterval?.(() => poll().catch(() => {}), everyMs)
  return () => timer.clearInterval?.(handle)
}
