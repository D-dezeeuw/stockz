# Testing Policy — One Test Per Function

This project deliberately does **not** practice broad continuous testing. The rule, with
no exception:

> **Every function gets exactly one Vitest unit test. When testing, only THAT function's
> test is run.**

## What that means in practice

- One `it()` per function, ever. Not two, not zero. The single test exercises the
  function's primary contract (happy path plus its most important edge in one test body
  is fine — it is still one test).
- Test files are colocated: `src/lib/pnl.js` → `src/lib/pnl.test.js`.
- Inside a test file, one `describe(functionName)` per function containing exactly one
  `it('...')`.
- Run a single function's test — never the whole suite as routine:

  ```bash
  npx vitest run src/lib/pnl.test.js -t "avgEntryPrice"
  ```

- A feature is "green" when each of its new functions' single tests passes when run
  individually like that.
- Do not add integration tests, e2e tests, or snapshot tests. Do not run `vitest` bare
  (whole suite) as part of the feature cycle.

## The merge gate: coverage above 80%, including branching

Passing tests alone do not merge a feature. Before the auto-merge to `main`
(see `way-of-working.md`), the feature's tests are run once more **with coverage,
scoped to the files the feature touched**, and must report **> 80% lines, statements,
functions and branches**:

```bash
npx vitest run src/lib/pnl.test.js \
  --coverage.enabled \
  --coverage.include='src/lib/pnl.js' \
  --coverage.thresholds.lines=80 --coverage.thresholds.statements=80 \
  --coverage.thresholds.functions=80 --coverage.thresholds.branches=80
```

- Requires the `@vitest/coverage-v8` dev dependency (installed in Phase 1).
- Gate green → the feature **merges and pushes to main automatically**, no approval.
- Gate red → raise coverage *within the policy*: make each function's single test walk
  more of its branches, or split a too-branchy function into smaller functions that each
  get their own single test. Never add a second test to the same function, and never
  lower the thresholds.
- Coverage is measured only at this gate and only over the feature's files — no global
  coverage reports, no repo-wide thresholds.

## Writing the one test well

Since each function gets only one shot, make it count:

- Assert the **contract**, not the implementation (inputs → outputs, no spying on
  internals).
- Prefer pure functions so the single test needs no mocks. Push side effects
  (DOM, network, Spektrum state) to thin edges that the test skips.
- Name the test after the guarantee: `it('pairs fills into round trips FIFO')`.
- Deterministic only: no timers, no real network, no `Math.random()` without a seed
  parameter.

## Vitest setup

- Config lives in `vite.config.js` (`test` key) — environment `node` for pure logic,
  `jsdom` only for functions that must touch DOM APIs.
- No global setup files, no watch mode in the cycle: `vitest run` targeted, exit, move on.
