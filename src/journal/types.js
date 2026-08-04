/**
 * What a trade is, once the venue's fills stop being the unit of thought.
 *
 * A venue reports executions. A trader thinks in **scalps** — got in here, got out there,
 * made this. On a desk doing hundreds of round trips a day the gap between those two is the
 * whole difference between a journal and a log file: forty fills across six partial exits
 * is one decision, and reviewing it as forty rows teaches nobody anything.
 *
 * So the journal's unit is the round trip, and this typedef is the contract every consumer
 * — metrics, replay, CSV, the dashboard — reads. Both fill legs travel with the record
 * rather than being summarised away: the average entry answers "what did I pay", and only
 * the fills themselves answer "did I get filled well", which is the more useful question
 * and the one nobody can reconstruct later.
 */

/**
 * One executed fill, as the journal keeps it.
 *
 * @typedef {object} JournalFill
 * @property {string} id - the venue's own execution id, or a synthesised one.
 * @property {string} venue - which venue filled it.
 * @property {string} instrument - what was traded.
 * @property {number} qty - signed: positive bought, negative sold.
 * @property {number} px - the execution price.
 * @property {number} fee - what it cost, positive being a charge.
 * @property {number} ts - when the venue says it happened.
 */

/**
 * One completed round trip.
 *
 * @typedef {object} TradeRecord
 * @property {string} id - stable across reloads: instrument + open timestamp + sequence.
 * @property {string} instrument - what was traded.
 * @property {string} side - 'long' or 'short', the direction of the *entry*.
 * @property {number} qty - the round trip's size, always positive.
 * @property {JournalFill[]} entryFills - what opened it.
 * @property {JournalFill[]} exitFills - what closed it.
 * @property {number} entryPx - quantity-weighted average entry.
 * @property {number} exitPx - quantity-weighted average exit.
 * @property {number} openTs - the first entry fill.
 * @property {number} closeTs - the last exit fill.
 * @property {number} fees - both legs together.
 * @property {number} pnl - gross, before fees; `net` is what was actually made.
 * @property {number} net - after fees, which is the only number that pays for anything.
 */

/**
 * An entry lot still waiting for its exit.
 *
 * @typedef {object} OpenLot
 * @property {string} instrument - what is held.
 * @property {number} qty - signed remaining size.
 * @property {number} px - what it was opened at.
 * @property {number} fee - the entry's share of the fee, pro-rated as it is consumed.
 * @property {number} ts - when it opened.
 * @property {string} id - the fill that opened it.
 */

export const JOURNAL_TYPES = Object.freeze(['JournalFill', 'TradeRecord', 'OpenLot'])
