import { setValue, appState, watch } from '../../app/engine.js'
import { PATHS } from '../../state/paths.js'
import { openPositions } from '../../positions/store.js'
import { createLogger } from '../../utils/log.js'
import { createHold } from '../../ui/hold.js'
import { resetPositions } from '../../positions/store.js'
import { resetPaperBook } from './engine.js'

/**
 * The practice account.
 *
 * Cash, equity and exposure — the three numbers that decide whether a session was
 * survivable, not just profitable. Kept separate from the live P&L for a reason that only
 * shows up later: a paper session and a live one *both* feed the ledger, and an equity
 * curve that silently mixed them would be the most confidently wrong chart on the desk.
 *
 * Cash moves on fills. Equity is cash plus what the open book is worth *right now* at live
 * marks — so it breathes with the market between trades, which is the whole difference
 * between a balance and a position.
 */

const log = createLogger('paper-account')

/** What a practice account starts with when nobody has said otherwise. */
export const DEFAULT_BALANCE = 10000

/**
 * Apply one fill's cash effect.
 *
 * @param {number} balance - the cash before.
 * @param {{side?: string, qty?: number, px?: number, fee?: number}} fill - the fill.
 * @returns {number} the cash after.
 */
export function applyFillToBalance(balance, fill) {
  const cash = Number(balance) || 0
  const qty = Math.abs(Number(fill?.qty ?? fill?.size) || 0)
  const px = Math.abs(Number(fill?.px ?? fill?.price) || 0)
  if (qty <= 0 || px <= 0) return Number(cash.toFixed(8))

  // Buying spends, selling receives. The fee is always a cost regardless of side — a
  // signed fee would let a sell that paid commission read as one that earned it.
  const notional = qty * px
  const fee = Math.abs(Number(fill?.fee) || 0)
  const delta = fill?.side === 'sell' ? notional : -notional

  return Number((cash + delta - fee).toFixed(8))
}

/**
 * What the open book is worth at live marks.
 *
 * @param {object[]} positions - the open positions.
 * @param {Record<string, number>} marks - instrument → last price.
 * @returns {{unrealized: number, notional: number}} the mark-to-market.
 */
export function markToMarket(positions, marks = {}) {
  let unrealized = 0
  let notional = 0

  for (const position of Array.isArray(positions) ? positions : []) {
    const qty = Number(position?.qty) || 0
    const entry = Number(position?.avgPx) || 0
    const mark = Number(marks?.[String(position?.instrument ?? '')]) || 0
    if (qty === 0 || entry <= 0) continue

    // No mark is not a mark of zero. An instrument the feed has gone quiet on is worth
    // what it was worth, and pricing it at nothing would show a total loss on a position
    // that is merely unquoted.
    const at = mark > 0 ? mark : entry
    unrealized += (at - entry) * qty
    notional += Math.abs(qty) * at
  }

  return { unrealized: Number(unrealized.toFixed(6)), notional: Number(notional.toFixed(6)) }
}

/**
 * How leveraged the practice book is.
 *
 * @param {number} notional - the open notional.
 * @param {number} equity - the account's equity.
 * @returns {number} exposure as a fraction of equity.
 */
export function computeExposure(notional, equity) {
  const open = Math.abs(Number(notional) || 0)
  const worth = Number(equity) || 0
  // A wiped account with an open position is infinitely leveraged, which is true and
  // useless. Reported as a hard ceiling instead, so the tile stays readable at the moment
  // it matters most.
  if (worth <= 0) return open > 0 ? 99 : 0

  return Number((open / worth).toFixed(4))
}

/**
 * Recompute and publish the account.
 *
 * @param {{balance?: number, positions?: object[], marks?: object}} [input] - overrides.
 * @returns {object} the account now published.
 */
export function refreshAccount(input = {}) {
  const balance = Number(input.balance ?? appState?.trade?.paperBalance ?? DEFAULT_BALANCE)
  const positions = input.positions ?? openPositions()
  const marks = input.marks ?? paperMarks()

  const { unrealized, notional } = markToMarket(positions, marks)
  const equity = Number((balance + unrealized).toFixed(6))
  const start = Number(appState?.settings?.paperStartBalance ?? DEFAULT_BALANCE) || DEFAULT_BALANCE

  const account = {
    balance: Number(balance.toFixed(6)),
    equity,
    unrealized,
    notional,
    exposure: computeExposure(notional, equity),
    // Session P&L against the *starting* stake, not against yesterday: a practice account
    // exists to answer "did this week work", and a delta from an arbitrary point does not.
    sessionPnl: Number((equity - start).toFixed(6)),
    positions: positions.length,
    // Formatted here rather than in the template. The raw numbers are what the tests and
    // any future chart read; the labels are what the tile renders, and a template that
    // formatted money inline would need a formatter that does not exist.
    equityLabel: equity.toFixed(2),
    balanceLabel: balance.toFixed(2),
    sessionLabel: `${equity - start >= 0 ? '+' : ''}${(equity - start).toFixed(2)}`,
    exposureLabel: `${(computeExposure(notional, equity) * 100).toFixed(0)}%`,
  }

  setValue(PATHS.trade.paperAccount, account)
  return account
}

/**
 * The marks the desk currently has.
 *
 * @param {object} [state] - engine state.
 * @returns {Record<string, number>} instrument → last price.
 */
export function paperMarks(state = appState) {
  const marks = {}
  for (const row of state?.market?.watchRows ?? []) {
    const price = Number(row?.last ?? row?.px)
    if (price > 0) marks[String(row?.symbol ?? '')] = price
  }

  // The focused instrument's mid is fresher than the watchlist poll, so it wins where the
  // two disagree — a tile lagging the ladder on the very instrument being traded is the
  // one place the lag is visible.
  const focus = String(state?.market?.focus ?? '')
  const mid = Number(state?.market?.mid) || 0
  if (focus && mid > 0) marks[focus.includes(':') ? focus.split(':').pop() : focus] = mid

  return marks
}

/**
 * Book a fill against the practice account.
 *
 * @param {object} fill - the fill.
 * @returns {number} the balance after.
 */
export function bookPaperFill(fill) {
  // Only paper fills. A live fill reaching this would move the practice balance by real
  // money, and the two accounts would drift apart in a way nothing on screen explains.
  if (fill?.paper !== true) return Number(appState?.trade?.paperBalance ?? DEFAULT_BALANCE)

  const balance = applyFillToBalance(appState?.trade?.paperBalance ?? DEFAULT_BALANCE, fill)
  setValue(PATHS.trade.paperBalance, balance)
  refreshAccount({ balance })

  return balance
}

/**
 * Reset the practice account to its starting stake.
 *
 * @param {object} _state - engine state (unused).
 * @param {{value?: number}} [payload] - a new starting stake.
 * @returns {number} the balance now.
 */
export function resetPaperAccount(_state, payload = {}) {
  const wanted = Number(payload?.value ?? payload?.balance)
  const start =
    Number.isFinite(wanted) && wanted > 0
      ? wanted
      : Number(appState?.settings?.paperStartBalance) || DEFAULT_BALANCE

  // Everything at once. A reset that cleared the cash but left the positions would leave
  // the account holding a book it never paid for, and the equity would be wrong from the
  // first tick — worse than not resetting at all, because it looks like it worked.
  if (payload?.keepBook !== true) {
    resetPaperBook()
    resetPositions()
  }
  setValue(PATHS.trade.paperBalance, start)
  setValue(PATHS.trade.paperResting, [])
  refreshAccount({ balance: start, positions: [] })
  log.info(`practice account reset to ${start}`)

  return start
}

/**
 * The press that wipes the practice account.
 *
 * Held rather than confirmed, for the same reason going live is: a dialog is wrong by this
 * project's rules, and a stray click that erases a week of practice is worse than one that
 * costs a trade.
 */
const wipe = createHold({
  path: PATHS.trade.resetHoldPct,
  ms: 600,
  onComplete: (payload) => resetPaperAccount(null, payload ?? {}),
})

/**
 * Begin the press-and-hold that wipes the account.
 *
 * @param {object} state - engine state (unused).
 * @param {object} [payload] - injectable timer and document.
 * @returns {boolean} true when a hold started.
 */
export function beginPaperReset(state, payload) {
  return wipe.begin(state, payload)
}

/**
 * Abandon the wipe before it takes.
 *
 * @param {object} state - engine state (unused).
 * @param {object} [payload] - injectable timer and document.
 * @returns {boolean} true when a hold was cancelled.
 */
export function cancelPaperReset(state, payload) {
  return wipe.cancel(state, payload)
}

/**
 * Keep the account in step with fills and marks.
 *
 * @param {{subscribe?: Function, watch?: Function}} [deps] - injectable plumbing.
 * @returns {() => void} stop.
 */
export function startPaperAccount(deps = {}) {
  const watcher = typeof deps.watch === 'function' ? deps.watch : watch

  // Equity breathes with the market between trades — that is the difference between a
  // balance and a position, and a tile that only moved on fills would hide every drawdown
  // that happened while the trader was doing nothing.
  //
  // Fills reach the balance from the paper book directly rather than through a bus: there
  // is no fill bus, and inventing one for a single consumer would be a second definition
  // of "a fill happened" beside `ingestFill`.
  const unmark = watcher([PATHS.market.mid, PATHS.market.watchRows], () => refreshAccount())
  refreshAccount()

  return () => unmark?.()
}
