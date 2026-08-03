# Integrations — OKX & EToro

Two venues feed the desk. All venue code lives in `src/venues/<venue>/` and speaks the
unified internal schema (`pipeline/`); nothing outside that folder knows venue quirks.

## Credentials

| Venue | Local dev (env vars) | Browser (production) |
| --- | --- | --- |
| OKX | `STOCKZ_OKX_API_KEY`, `STOCKZ_OKX_SECRET_KEY`, `STOCKZ_OKX_PASSPHRASE` | URL params or key modal |
| EToro | `STOCKZ_ETORO_API_KEY`, `STOCKZ_ETORO_USER_KEY` | URL params or key modal |

- Env vars are exposed to dev builds via Vite (`envPrefix: 'STOCKZ_'` →
  `import.meta.env.STOCKZ_OKX_API_KEY`). `.env*` files are gitignored. **Values never
  appear in git, in the masterplan, or in Spektrum state/history.**
- In the browser, keys arrive by URL param (`?okxKey=...&okxSecret=...&okxPass=...`,
  `?etoroKey=...&etoroUser=...`) or through the key modal. After parsing, the URL is
  scrubbed with `history.replaceState`. Keys live only in the in-memory vault module;
  the optional "remember on this device" stores an obfuscated copy in localStorage
  behind an explicit opt-in.

## OKX (crypto — primary scalping venue)

- **Public WS** `wss://ws.okx.com:8443/ws/v5/public`: `tickers`, `trades`, `books5` /
  `books-l2-tbt` channels per instrument.
- **Private WS** `.../v5/private`: login frame signed with HMAC-SHA256 (Web Crypto,
  key+secret+passphrase), then `orders`, `positions`, `account` channels.
- **REST** `https://www.okx.com/api/v5/...` signed with `OK-ACCESS-*` headers for
  order placement fallback, instrument catalog, history.
- Book integrity: apply deltas, verify OKX checksum, resubscribe on mismatch.
- Reconnect: exponential backoff (250ms → 8s cap), resubscribe all channels, dedupe
  in-flight client order IDs on recovery.

## EToro (stocks/CFD — secondary venue)

- REST only: API key + user key sent as headers on every request.
- Quotes via adaptive polling: fast interval (~1s) for the focused instrument, slow
  (~5s) for watchlist rows, paused when tab hidden.
- Portfolio/positions polled and mapped into the same `trade.*` schema as OKX.
- Feature-flagged (`settings.venues.etoro`) so the desk runs clean OKX-only.
- CORS: if the browser is blocked, dev uses Vite's proxy; production documents a thin
  optional relay. Never bake a third-party CORS proxy into the app.

## Unified schema (what the rest of the app sees)

```js
tick     { venue, symbol, ts, last, bid, ask, size, side }
candle   { venue, symbol, tf, ts, o, h, l, c, v }
book     { venue, symbol, ts, bids: [[px, sz]...], asks: [[px, sz]...] }
order    { id, clientId, venue, symbol, side, type, px, sz, state, ts }
fill     { orderId, venue, symbol, side, px, sz, fee, ts }
position { venue, symbol, side, sz, avgPx, uPnl, rPnl, fees }
```

Every mapper from venue payload → schema is a pure function with its single unit test.
