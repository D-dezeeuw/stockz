/**
 * Published venue rates, in basis points of notional.
 *
 * A leaf module on purpose. The rate card is a table of numbers, but `fees.js` around it
 * reaches the ledger and `setValue`, which drags Spektrum in behind it — and a **module
 * worker gets no importmap**, so anything the backtest worker imports must resolve to
 * relative paths with no bare specifier anywhere in its graph. Splitting the constant out
 * lets the spread-capture strategy and the phase 27 sim fill model price a trade inside a
 * worker without importing the desk.
 *
 * OKX Lv1: spot 0.080% maker / 0.100% taker; perpetuals 0.020% / 0.050%. EToro charges no
 * commission on the instruments this desk trades but takes a spread markup, ~1% on crypto,
 * which is a fee by another name and is counted as one.
 */
export const FEE_SCHEDULE = Object.freeze({
  okx: Object.freeze({
    spot: Object.freeze({ maker: 8, taker: 10 }),
    swap: Object.freeze({ maker: 2, taker: 5 }),
  }),
  etoro: Object.freeze({
    spot: Object.freeze({ maker: 100, taker: 100 }),
    swap: Object.freeze({ maker: 100, taker: 100 }),
  }),
})
