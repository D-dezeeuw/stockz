# CSP readiness

STOCKZ holds venue API keys in browser memory, so it is exactly the kind of page that
should be able to run under a strict Content-Security-Policy. This documents how it gets
there, and why the seam exists from phase 2 rather than being retrofitted.

## The problem

Spektrum evaluates `{{expr}}` and `:attr="expr"` bindings at runtime. That needs
`script-src 'unsafe-eval'`, which is the single directive most worth not having: it is
what turns an injected string into executable code.

## The fix: precompile the expressions

`spektrum/compile` accepts expressions compiled ahead of time. Once every expression the
page uses is registered via `precompile(source, fn)`, the engine looks them up instead of
evaluating strings, and the policy no longer needs `unsafe-eval`.

```bash
npm run build:csp   # node scripts/compile-templates.mjs && vite build
```

`scripts/compile-templates.mjs` reads `index.html`, collects every expression with
`collectExpressions()` from `src/app/csp.js`, and writes
`src/app/compiled-expressions.js`.

## Why the extraction is unit-tested

An expression the extractor fails to see does not error at build time — it fails
*silently at runtime* under a policy without `unsafe-eval`, as a binding that never
updates. That is a bad failure mode on a trading screen, so `extractMustaches`,
`extractAttrExpressions` and `collectExpressions` each carry a test, and one of them
asserts against the real `index.html` rather than a fixture.

## The policy

`cspMeta()` is the single source for the shipped policy:

```
default-src 'self';
script-src 'self' https://unpkg.com;      ← no unsafe-eval
style-src 'self' 'unsafe-inline';
connect-src 'self' https://unpkg.com https://www.okx.com wss://ws.okx.com;
img-src 'self' data:;
object-src 'none';
base-uri 'self'
```

`cspMeta({ reportOnly: true })` returns the `Content-Security-Policy-Report-Only`
variant — the staged rollout: ship it report-only, watch for violations on a live
session, then enforce.

`unpkg.com` is allowed because the engine loads from there. When the engine's origin
changes, this function is the one place to update. `connect-src` grows as venue phases
land (phase 9 adds OKX, phase 10 EToro).

## Status

- Extraction, module generation and the policy: **done** (F2.10), unit-tested.
- Loading `compiled-expressions.js` at boot and enforcing the meta tag: **deferred** —
  it belongs with the hardened build in phase 30, once the full set of bindings exists.
  The default build is deliberately unchanged, so nothing about the normal dev loop or
  the live page moves today.
