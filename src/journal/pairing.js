import { setValue } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { splitFlipFill } from '../positions/math.js'
import { createLogger } from '../utils/log.js'

/**
 * Turning fills into trades.
 *
 * **FIFO, and not configurable.** Not because average-cost or LIFO are wrong in general —
 * they are the right answer in other contexts — but because a journal exists to be trusted
 * later, and a matching policy that can be changed retroactively turns every past entry
 * into a number that depends on a setting nobody remembers the value of. Oldest lot first,
 * always, for everyone.
 *
 * Three things make this harder than it sounds, and each has a function:
 *
 * - **Partial exits.** A scalp scaled out in three pieces is one trade, not three. A lot
 *   consumed by a smaller exit splits, and the remainder carries forward.
 * - **Flips.** A sell that is larger than the long it is closing is a close *and* an open,
 *   and booking it as one thing produces a trade with a negative quantity that every
 *   downstream metric then has to defend itself against.
 * - **Replayed fills.** Every venue reconnect re-sends recent executions. Without an id
 *   set, one dropped WebSocket frame doubles a day's trade count — and the trader has no
 *   way to know which half is real.
 */

const log = createLogger('journal')

/** How many completed trades stay in memory. */
export const TRADE_CAP = 1000

/** Open lots, per instrument, oldest first. */
let lots = new Map()

/** Venue execution ids already folded in. */
let seen = new Set()

/** Completed round trips, newest last. */
let trades = []

/** Distinguishes two trades that opened on the same instrument in the same millisecond. */
let sequence = 0

/**
 * Normalise a venue fill into the journal's own shape.
 *
 * @param {object} raw - the venue fill.
 * @returns {object|null} the fill, or null when it is not one.
 */
export function normalizeFill(raw) {
  const qty = Number(raw?.qty)
  const px = Number(raw?.px)
  const instrument = String(raw?.instrument ?? raw?.symbol ?? '')
  if (!instrument || !Number.isFinite(qty) || qty === 0 || !Number.isFinite(px) || px <= 0) {
    return null
  }

  // The sign is the journal's language; sides are the venue's. Converting once here means
  // nothing downstream has to remember which convention it is holding.
  const side = String(raw?.side ?? '').toLowerCase()
  const signed = side === 'sell' ? -Math.abs(qty) : side === 'buy' ? Math.abs(qty) : qty

  return {
    id: String(raw?.id ?? raw?.fillId ?? raw?.tradeId ?? `${instrument}|${raw?.ts}|${qty}|${px}`),
    venue: String(raw?.venue ?? ''),
    instrument,
    qty: signed,
    px,
    fee: Math.abs(Number(raw?.fee) || 0),
    ts: Number(raw?.ts) || 0,
  }
}

/**
 * Split a fill that crosses through flat.
 *
 * @param {object} fill - the normalised fill.
 * @param {number} held - the signed position before it.
 * @returns {{closing: object|null, opening: object|null}} the two legs.
 */
export function splitCrossingFill(fill, held) {
  const { closing, opening } = splitFlipFill(held, Number(fill?.qty) || 0)
  const total = Math.abs(Number(fill?.qty) || 0) || 1

  // The fee follows the quantity. Charging the whole fill's fee to the closing leg would
  // make the round trip that happened to be crossed through look worse than one that was
  // not, which is a difference the trader never made.
  const leg = (qty) =>
    qty === 0 ? null : { ...fill, qty, fee: Number((fill.fee * (Math.abs(qty) / total)).toFixed(10)) }

  return { closing: leg(closing), opening: leg(opening) }
}

/**
 * Match an exit against the open lots, oldest first.
 *
 * @param {object[]} open - the open lots for one instrument.
 * @param {object} exit - the closing fill.
 * @returns {{matched: object[], rest: object[], unfilled: number}} what closed and what is left.
 */
export function matchLots(open, exit) {
  const queue = (Array.isArray(open) ? open : []).map((lot) => ({ ...lot }))
  let remaining = Math.abs(Number(exit?.qty) || 0)
  const matched = []

  while (remaining > 0 && queue.length > 0) {
    const lot = queue[0]
    const available = Math.abs(lot.qty)
    const take = Math.min(available, remaining)

    // A lot consumed by a smaller exit splits and the remainder carries forward: a scalp
    // scaled out in three pieces is one trade, not three.
    const share = take / available
    matched.push({ ...lot, qty: take * Math.sign(lot.qty), fee: Number((lot.fee * share).toFixed(10)) })

    remaining = Number((remaining - take).toFixed(10))
    if (take >= available) queue.shift()
    else {
      lot.qty = Number((lot.qty - take * Math.sign(lot.qty)).toFixed(10))
      lot.fee = Number((lot.fee * (1 - share)).toFixed(10))
    }
  }

  return { matched, rest: queue, unfilled: remaining }
}

/**
 * Build the trade record a set of matched lots and their exit describe.
 *
 * @param {object[]} matched - the entry lots that closed.
 * @param {object} exit - the closing fill.
 * @returns {object|null} the trade, or null when nothing closed.
 */
export function makeTrade(matched, exit) {
  const lotsIn = Array.isArray(matched) ? matched.filter(Boolean) : []
  if (lotsIn.length === 0) return null

  const qty = Number(lotsIn.reduce((sum, lot) => sum + Math.abs(lot.qty), 0).toFixed(10))
  if (qty === 0) return null

  const weighted = lotsIn.reduce((sum, lot) => sum + Math.abs(lot.qty) * lot.px, 0)
  const entryPx = Number((weighted / qty).toFixed(10))
  const exitPx = Number(exit?.px) || 0
  const long = lotsIn[0].qty > 0

  const entryFees = lotsIn.reduce((sum, lot) => sum + (Number(lot.fee) || 0), 0)
  const fees = Number((entryFees + (Number(exit?.fee) || 0)).toFixed(10))
  // Gross and net both, because they answer different questions: gross says whether the
  // idea worked, net says whether it paid, and on a scalping desk those diverge constantly.
  const pnl = Number(((long ? exitPx - entryPx : entryPx - exitPx) * qty).toFixed(10))

  sequence += 1

  return {
    id: `${lotsIn[0].instrument}|${lotsIn[0].ts}|${sequence}`,
    instrument: lotsIn[0].instrument,
    side: long ? 'long' : 'short',
    qty,
    entryFills: lotsIn,
    exitFills: [exit],
    entryPx,
    exitPx,
    openTs: lotsIn[0].ts,
    closeTs: Number(exit?.ts) || 0,
    fees,
    pnl,
    net: Number((pnl - fees).toFixed(10)),
  }
}

/**
 * Fold fills into the journal.
 *
 * @param {object[]} incoming - venue fills.
 * @returns {object[]} the trades this call completed.
 */
export function pairFills(incoming) {
  const closed = []

  for (const raw of Array.isArray(incoming) ? incoming : []) {
    const fill = normalizeFill(raw)
    if (!fill) continue

    // Every venue reconnect re-sends recent executions. Without this, one dropped frame
    // doubles the day's trade count and the trader cannot tell which half is real.
    if (seen.has(fill.id)) continue
    seen.add(fill.id)

    const open = lots.get(fill.instrument) ?? []
    const held = open.reduce((sum, lot) => sum + lot.qty, 0)
    const { closing, opening } = splitCrossingFill(fill, held)

    if (closing) {
      const { matched, rest } = matchLots(open, closing)
      const trade = makeTrade(matched, closing)
      if (trade) closed.push(trade)
      lots.set(fill.instrument, rest)
    }

    if (opening) {
      const rest = lots.get(fill.instrument) ?? []
      lots.set(fill.instrument, [...rest, { ...opening, instrument: fill.instrument }])
    }
  }

  if (closed.length) {
    trades = [...trades, ...closed].slice(-TRADE_CAP)
    setValue(PATHS.journal.trades, trades.slice(-200).reverse())
    setValue(PATHS.journal.count, trades.length)
  }

  return closed
}

/**
 * The completed trades.
 *
 * @returns {object[]} oldest first.
 */
export function journalTrades() {
  return trades
}

/**
 * The lots still open.
 *
 * @returns {object[]} every open lot, flattened.
 */
export function openLots() {
  return [...lots.values()].flat()
}

/** Where the half-open state lives. */
export const LOTS_KEY = 'stockz.journal.openLots'

/**
 * Write the half-open state so a reload mid-scalp does not lose it.
 *
 * @param {Storage} [storage] - storage to write to.
 * @returns {boolean} true when it was written.
 */
export function saveOpenLots(storage = globalThis.localStorage) {
  try {
    // The seen-ids set travels with it. Restoring lots without them would replay every
    // recent fill on the next reconnect straight back into the journal.
    storage?.setItem?.(
      LOTS_KEY,
      JSON.stringify({ lots: [...lots.entries()], seen: [...seen].slice(-500) }),
    )
    return true
  } catch (err) {
    log.warn(`unwritable open lots: ${err?.message ?? err}`)
    return false
  }
}

/**
 * Read the half-open state back.
 *
 * @param {Storage} [storage] - storage to read from.
 * @returns {object[]} the restored lots.
 */
export function loadOpenLots(storage = globalThis.localStorage) {
  try {
    const parsed = JSON.parse(storage?.getItem?.(LOTS_KEY) ?? 'null')
    lots = new Map(Array.isArray(parsed?.lots) ? parsed.lots : [])
    seen = new Set(Array.isArray(parsed?.seen) ? parsed.seen : [])
  } catch (err) {
    // A corrupt cache degrades to an empty journal rather than stopping the desk booting.
    log.warn(`unreadable open lots: ${err?.message ?? err}`)
    lots = new Map()
    seen = new Set()
  }

  return openLots()
}

/**
 * Forget everything.
 *
 * @returns {boolean} true.
 */
export function resetJournal() {
  lots = new Map()
  seen = new Set()
  trades = []
  sequence = 0
  setValue(PATHS.journal.trades, [])
  setValue(PATHS.journal.count, 0)

  return true
}

/**
 * Fold the live fill stream into the journal.
 *
 * @param {object} fill - one venue fill.
 * @returns {object[]} the trades it completed.
 */
export function onJournalFill(fill) {
  const closed = pairFills([fill])
  // Persisted on every fill rather than on a timer: the state worth keeping is precisely
  // the half-open scalp, and a reload always happens at the wrong moment.
  saveOpenLots()
  if (closed.length) setValue(PATHS.journal.last, closed[closed.length - 1])

  return closed
}

/**
 * How the journal currently reads.
 *
 * @returns {{trades: number, open: number, seen: number}} the counts.
 */
export function journalState() {
  return { trades: trades.length, open: openLots().length, seen: seen.size }
}
