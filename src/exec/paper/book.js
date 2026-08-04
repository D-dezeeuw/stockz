/**
 * Paper fills that behave like real ones.
 *
 * The old paper adapter filled a limit order the instant it was submitted, at its own
 * price. That is not practice, it is a cheat code: the single hardest thing about resting
 * an order is that the market has to come to you *and* trade through everyone who was
 * already there. A scalper who practises with instant limit fills learns a strategy that
 * does not exist.
 *
 * So a resting order joins a **queue**. Its position is the size already showing at that
 * price when it arrives, and every print at the level eats into that size before it
 * touches the order. Price alone is never enough — the tape has to actually trade the
 * volume.
 *
 * Pure over plain arrays and objects, so the whole model is testable without a feed.
 */

/**
 * How much size sits ahead of an order joining a level.
 *
 * @param {number} price - the level.
 * @param {{bids?: object[], asks?: object[]}} book - the depth snapshot.
 * @param {string} side - 'buy' rests on the bid, 'sell' on the ask.
 * @returns {number} the size ahead; 0 when the level is empty.
 */
export function queuePosition(price, book, side) {
  const level = Number(price)
  if (!Number.isFinite(level) || level <= 0) return 0

  const levels = side === 'sell' ? book?.asks : book?.bids
  const rows = Array.isArray(levels) ? levels : []

  // Only the trader's own level counts. Size at better prices fills first but is a
  // different queue, and folding it in would make an order at the touch look as though it
  // were behind the whole book.
  const match = rows.find((row) => Number(row?.px ?? row?.[0]) === level)
  return Math.max(0, Number(match?.sz ?? match?.[1]) || 0)
}

/**
 * Put an order into the resting list, price-ordered.
 *
 * @param {object[]} orders - the resting orders.
 * @param {object} order - the order to rest.
 * @returns {object[]} a new list.
 */
export function insertResting(orders, order) {
  const list = Array.isArray(orders) ? orders : []
  const id = String(order?.id ?? '')
  const price = Number(order?.price)
  if (!id || !Number.isFinite(price) || price <= 0) return list

  // Replaced rather than duplicated on the same id: an amend that re-rested without
  // removing would leave two orders competing for one fill.
  const without = list.filter((row) => String(row?.id) !== id)
  const next = [...without, { ...order, id, price, remaining: Math.abs(Number(order?.size) || 0) }]

  // Best-first within a side: a buy at 101 fills before a buy at 100, and a list that had
  // to be sorted at match time would sort on every print.
  return next.sort((a, b) => (a.side === 'sell' ? a.price - b.price : b.price - a.price))
}

/**
 * Take an order out of the resting list.
 *
 * @param {object[]} orders - the resting orders.
 * @param {string} id - the order id.
 * @returns {object[]} a new list.
 */
export function removeResting(orders, id) {
  const wanted = String(id ?? '')
  return (Array.isArray(orders) ? orders : []).filter((row) => String(row?.id) !== wanted)
}

/**
 * Fill a market order against the top of book.
 *
 * @param {object} intent - the order intent.
 * @param {{bid?: number, ask?: number, mid?: number}} market - the book's top.
 * @param {{slipBps?: number}} [config] - size-based slip.
 * @returns {object} the fill, or `{filled: false}`.
 */
export function paperMarketFill(intent, market = {}, config = {}) {
  const size = Math.abs(Number(intent?.size) || 0)
  const buying = intent?.side !== 'sell'
  const touch = buying ? Number(market?.ask) || 0 : Number(market?.bid) || 0
  const fallback = Number(market?.mid) || 0
  const price = touch || fallback
  if (!(price > 0) || size <= 0) return { filled: false, reason: 'no_market' }

  // Pays the spread, and then some. Reporting the mid would make every strategy look half
  // a spread better than it is, which over a hundred trades a day is the whole difference
  // between profit and loss.
  const bps = Math.max(0, Number(config?.slipBps) || 0)
  const filled = buying ? price * (1 + bps / 10000) : price * (1 - bps / 10000)

  return {
    filled: true,
    side: buying ? 'buy' : 'sell',
    size,
    price: Number(filled.toFixed(8)),
    liquidity: 'taker',
    // Named so the ledger, the journal and the fee model can all tell a simulated fill
    // from a real one without inspecting where it came from.
    paper: true,
  }
}

/**
 * Work one print against a resting order.
 *
 * @param {object} order - the resting order, carrying `queue` and `remaining`.
 * @param {{px?: number, sz?: number, ts?: number}} print - a tape print.
 * @returns {{order: object, fill: object|null}} the order after the print, and any fill.
 */
export function paperLimitMatch(order, print) {
  const price = Number(order?.price)
  const px = Number(print?.px)
  const printed = Math.abs(Number(print?.sz) || 0)
  const remaining = Math.abs(Number(order?.remaining ?? order?.size) || 0)
  if (!(price > 0) || !(px > 0) || printed <= 0 || remaining <= 0) return { order, fill: null }

  const buying = order?.side !== 'sell'
  // A print *through* the price fills regardless of queue — the market traded past the
  // level, so everything resting at it is gone. A print *at* the price only works the
  // queue down, which is the whole reason a limit order is not free.
  const through = buying ? px < price : px > price
  const at = px === price
  if (!through && !at) return { order, fill: null }

  let queue = Math.max(0, Number(order?.queue) || 0)
  let volume = printed

  if (!through) {
    // Ahead-volume eats the print first. This is the model's entire point: price alone is
    // never enough, the tape has to trade the size that was already there.
    const eaten = Math.min(queue, volume)
    queue -= eaten
    volume -= eaten
    if (volume <= 0) return { order: { ...order, queue }, fill: null }
  } else {
    queue = 0
  }

  // Partial fills are the honest outcome: a clip larger than the print that reached it did
  // not all trade, and reporting it as filled would credit size the tape never showed.
  const size = Math.min(remaining, through ? remaining : volume)

  return {
    order: { ...order, queue, remaining: Number((remaining - size).toFixed(8)) },
    fill: {
      filled: true,
      id: String(order?.id ?? ''),
      side: buying ? 'buy' : 'sell',
      size: Number(size.toFixed(8)),
      // At the limit, never better: a resting order gets the price it asked for, and
      // giving it the improvement would credit it with the aggressor's edge.
      price: Number(price.toFixed(8)),
      ts: Number(print?.ts) || 0,
      liquidity: 'maker',
      paper: true,
      // A partly-filled order stays working; the caller needs to know which it is.
      done: remaining - size <= 1e-12,
    },
  }
}

/**
 * Move a resting order to a new price.
 *
 * @param {object[]} orders - the resting orders.
 * @param {string} id - the order to amend.
 * @param {number} price - the new price.
 * @param {object} book - the depth snapshot, for the new queue position.
 * @returns {object[]} a new list.
 */
export function amendResting(orders, id, price, book) {
  const list = Array.isArray(orders) ? orders : []
  const order = list.find((row) => String(row?.id) === String(id ?? ''))
  const next = Number(price)
  if (!order || !Number.isFinite(next) || next <= 0) return list

  // Re-queued at the back of the new level, exactly as a real amend is: a venue treats a
  // price change as a cancel and a replace, and an amend that kept its old queue position
  // would make repricing free.
  return insertResting(removeResting(list, id), {
    ...order,
    price: next,
    size: order.remaining ?? order.size,
    queue: queuePosition(next, book, order.side),
  })
}
