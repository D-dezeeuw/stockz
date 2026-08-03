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
- Do not add integration tests, e2e tests, snapshot tests, or coverage gates. Do not run
  `vitest` bare (whole suite) as part of the feature cycle.

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
