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
  signedOut: false,
  feed: 'off',
  venue: { checked: false, perm: '', canTrade: false, blocked: '', unlisted: [] },
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
    signedOut: raw.signedOut === true,
    feed: String(raw.feed ?? 'dead'),
    // What the venue said about the key itself. The one failure the trader cannot fix and
    // the owner can, so it is carried all the way to the screen rather than left in a log.
    venue: {
      checked: raw.venue?.checked === true,
      perm: String(raw.venue?.perm ?? ''),
      canTrade: raw.venue?.canTrade === true,
      blocked: String(raw.venue?.blocked ?? ''),
      unlisted: Array.isArray(raw.venue?.unlisted) ? raw.venue.unlisted : [],
    },
    uptimeMs: Number(raw.uptimeMs) || 0,
    symbols: Array.isArray(raw.symbols) ? raw.symbols : [],
    stats: {
      signals: Number(stats.signals) || 0,
      orders: Number(stats.orders) || 0,
      blocked: Number(stats.blocked) || 0,
      errors: Number(stats.errors) || 0,
    },
    decisions: (Array.isArray(raw.decisions) ? raw.decisions : []).map((d, i) => ({
      // The server's monotonic sequence is the row's identity — a timestamp is not one,
      // because OKX stamps several prints in the same millisecond. Falls back to the index
      // only for a server too old to send it, which still beats a colliding key.
      seq: Number(d?.seq) || i,
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
  // Signed out is not "off". The loop is almost certainly still trading on the host; it is
  // this browser that has lost its session, and saying "off" would send somebody to the
  // server logs to look for a loop that never stopped.
  if (view?.signedOut) return 'signed out — reload to sign in'
  if (!view?.running) return 'server trader: off'
  // The blocker first, always. A loop that is running and cannot trade is the state most
  // easily mistaken for a working one.
  if (view.venue?.blocked) return `server BLOCKED — ${view.venue.blocked}`

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
    // A 401 is its own answer, not a failed request. The session died — usually because the
    // backend restarted with an ephemeral signing secret — and every other poller on the
    // page is about to discover the same thing. Reported once, plainly, instead of parsed
    // as a snapshot and rendered as an idle trader.
    if (response?.status === 401) view = { ...TRADER_OFF, signedOut: true }
    else view = toTraderView(await response.json())
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
