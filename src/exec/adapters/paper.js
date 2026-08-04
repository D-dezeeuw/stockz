import { appState } from '../../app/engine.js'
import { capabilityFor, capabilityFlags } from '../capabilities.js'

/**
 * The paper adapter — the desk trading against itself.
 *
 * Paper mode was a *label* before this existed: `trade.mode` was read in exactly one
 * place, to decide whether to nag for credentials, and every order went to the venue
 * regardless of what the switch said. A desk that can run strategies unattended needs a
 * mode where being wrong costs nothing, and it has to be a mode that cannot leak.
 *
 * So this is an adapter rather than a flag consulted at the send site. It imports no venue
 * client and holds no credentials: there is no code path from here to an exchange, which
 * is a far stronger guarantee than a boolean checked correctly at every call site. The
 * engine picks it up in `adapterFor`, ahead of the real venue, so every order — ticket,
 * hotkey, bot, flatten — takes this path or none.
 *
 * Fills are deliberately optimistic but not free: a market order crosses the spread, a
 * limit order fills at its price. Simulating queue position or partial fills would invent
 * detail nobody should trust; the honest claim is "this is what you would have paid at the
 * top of book", and the journal marks every one of them paper.
 */

/** Paper can do whatever the venue being simulated can. */
export const PAPER_CAPABILITIES = Object.freeze(capabilityFlags(capabilityFor('okx', 'SWAP-SWAP')))

/**
 * The price a paper order fills at.
 *
 * @param {object} intent - the order intent.
 * @param {{bid?: number, ask?: number, mid?: number}} [market] - the book's top.
 * @returns {number} the fill price, or 0 when nothing can be quoted.
 */
export function paperFillPrice(intent, market = {}) {
  const bid = Number(market?.bid) || 0
  const ask = Number(market?.ask) || 0
  const mid = Number(market?.mid) || 0

  // A limit order fills at its limit: it is the price that was asked for, and pretending
  // to do better is how a paper record flatters a strategy that would have been queued.
  if (intent?.type !== 'market' && Number(intent?.price) > 0) return Number(intent.price)

  // A market order pays the spread — the whole cost a scalper is fighting. Reporting the
  // mid here would make every strategy look half a spread better than it is, which on a
  // hundred trades a day is the entire difference between profit and loss.
  const cross = intent?.side === 'sell' ? bid : ask
  return cross || mid || Number(intent?.price) || 0
}

/**
 * Create the paper adapter.
 *
 * @param {{venue?: string, market?: () => object}} [deps] - injectable plumbing.
 * @returns {object} the adapter.
 */
export function createPaperAdapter(deps = {}) {
  const {
    venue = 'paper',
    market = () => ({
      bid: appState?.market?.bid,
      ask: appState?.market?.ask,
      mid: appState?.market?.mid,
    }),
  } = deps

  return {
    venue,
    capabilities: () => [...PAPER_CAPABILITIES],
    paper: true,

    async submit(intent) {
      const clientId = String(intent?.clientId ?? '')
      const price = paperFillPrice(intent, market())

      // Unfillable rather than silently filled at zero: a paper fill at no price would
      // book a position whose P&L is nonsense for the rest of the session.
      if (!(price > 0)) {
        return { ok: false, reason: 'no_market', message: 'no price to fill against', clientId }
      }

      return {
        ok: true,
        clientId,
        order: { state: 'filled', avgPx: price, filled: Number(intent?.size) || 0, paper: true },
      }
    },

    async cancel() {
      // Nothing rests: a paper order is filled or refused on submit, so a cancel has
      // nothing to chase and says so rather than pretending to have caught something.
      return { ok: true }
    },
  }
}
