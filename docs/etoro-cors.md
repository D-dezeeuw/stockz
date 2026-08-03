# EToro from a browser: CORS

EToro's API does not send `Access-Control-Allow-Origin` for browser requests, so a page
served from `d-dezeeuw.github.io` **cannot call it directly**. This is a property of the
venue, not something the desk can code around, and it is worth being explicit about
rather than discovering it live.

## What the desk does about it

**Development:** Vite proxies `/etoro/*` to the API, so the browser only ever talks to
`localhost` and CORS never applies. Add to `vite.config.js` when working on EToro:

```js
server: {
  proxy: {
    '/etoro': { target: 'https://api.etoro.com', changeOrigin: true,
                rewrite: (p) => p.replace(/^\/etoro/, '') },
  },
}
```

**Offline / no keys:** `src/venues/etoro/mock.js` answers every endpoint the desk calls
with deterministic, *moving* prices, through the real mappers and the real poller. This is
the path tests use, and it keeps the whole EToro pipeline exercisable without a network.

**Production:** the honest options are a thin relay you host, or accepting that EToro is
unavailable from a static page. **A public CORS proxy is not an option here** — it would
see the API keys in the headers of every request, which is the one thing the vault exists
to prevent. The desk therefore ships with EToro feature-flagged off by default and runs
OKX-only, which is a complete scalping desk on its own.

## The flag

`settings.venues.etoro` (default `false`) gates every EToro call. With it off there are no
requests, no errors and no LED — the desk simply has one venue.
