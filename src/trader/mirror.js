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
  mode: 'paper',
  signedOut: false,
  feed: 'off',
  venue: { checked: false, perm: '', canTrade: false, blocked: '', unlisted: [], suggest: [],
    adopted: [] },
  uptimeMs: 0,
  symbols: [],
  stats: { signals: 0, orders: 0, blocked: 0, errors: 0 },
  breakdown: [],
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
    // The configured mode, which is the persistent one — it lives in the server's .env and
    // no browser can change it. Kept separate from `live` (what is actually happening) so
    // "configured for paper" and "configured live but refused" stop looking identical.
    mode: raw.mode === 'live' ? 'live' : 'paper',
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
      suggest: Array.isArray(raw.venue?.suggest) ? raw.venue.suggest : [],
      // Substitutions the loop made for itself. Pre-rendered as text here rather than in
      // the template: the block binds one string per row, and building it in the markup
      // would put the arrow glyph somewhere no test can reach it.
      adopted: (Array.isArray(raw.venue?.adopted) ? raw.venue.adopted : []).map((swap) => ({
        from: String(swap?.from ?? ''),
        to: String(swap?.to ?? ''),
        label: `${swap?.from ?? ''} → ${swap?.to ?? ''}`,
      })),
    },
    uptimeMs: Number(raw.uptimeMs) || 0,
    symbols: Array.isArray(raw.symbols) ? raw.symbols : [],
    stats: {
      signals: Number(stats.signals) || 0,
      orders: Number(stats.orders) || 0,
      blocked: Number(stats.blocked) || 0,
      errors: Number(stats.errors) || 0,
    },
    breakdown: decisionBreakdown(raw.tally),
    decisions: (Array.isArray(raw.decisions) ? raw.decisions : []).map((d, i) => ({
      // The server's monotonic sequence is the row's identity — a timestamp is not one,
      // because OKX stamps several prints in the same millisecond. Falls back to the index
      // only for a server too old to send it, which still beats a colliding key.
      seq: Number(d?.seq) || i,
      ts: Number(d?.ts) || 0,
      // LOCAL time, not UTC. `toISOString().slice(11, 19)` was rendering every row two
      // hours behind an Amsterdam summer clock, which makes a decision log unreadable
      // against a wall clock — the one thing it is scanned for. `toTimeString()` is the
      // viewer's zone with a fixed `HH:MM:SS` head, so it needs no locale and no Intl.
      time: new Date(Number(d?.ts) || 0).toTimeString().slice(0, 8),
      instrument: String(d?.instrument ?? ''),
      strategy: String(d?.strategy ?? ''),
      action: String(d?.action ?? ''),
      taken: d?.taken === true,
      why: String(d?.why ?? ''),
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
 * How every actionable opinion ended up, ordered and labelled for reading.
 *
 * Two slices are taken (an entry and an exit), the rest are passes. Sorted with the taken
 * ones first and the largest refusal next, because the question this answers is "did it
 * trade, and if not what stopped it" — and the answer to the second half is almost always
 * one dominant category.
 *
 * `noop` is dropped: a flat signal with nothing to close is not a trade passed on, and it
 * is the most frequent line the loop produces. Left in, it would be the biggest slice on
 * the chart and would mean nothing at all.
 *
 * @param {object} tally - the server's per-category counts.
 * @returns {object[]} slices with label, count, share and tone.
 */
export function decisionBreakdown(tally) {
  const counts = tally && typeof tally === 'object' ? tally : {}
  const rows = [
    { key: 'entry', label: 'entered', tone: 'up' },
    { key: 'exit', label: 'exited', tone: 'up' },
    { key: 'benched', label: 'benched', tone: 'down' },
    { key: 'weak', label: 'too weak', tone: 'muted' },
    { key: 'cap', label: 'at cap', tone: 'muted' },
    { key: 'throttled', label: 'throttled', tone: 'muted' },
    { key: 'venue', label: 'venue refused', tone: 'down' },
    { key: 'misconfigured', label: 'misconfigured', tone: 'down' },
  ]
    .map((row) => ({ ...row, count: Number(counts[row.key]) || 0 }))
    .filter((row) => row.count > 0)

  const total = rows.reduce((sum, row) => sum + row.count, 0)
  if (total === 0) return []

  return rows.map((row) => ({
    ...row,
    share: row.count / total,
    // Rendered here rather than in the template: a percentage is read, not computed.
    pct: `${Math.round((row.count / total) * 100)}%`,
    taken: row.key === 'entry' || row.key === 'exit',
  }))
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
