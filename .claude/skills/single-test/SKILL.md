---
name: single-test
description: Write and run the one Vitest unit test a STOCKZ function is allowed to have, and run only that test. Use when creating functions, fixing a failing test, or verifying a feature is green.
---

# Single Test

Policy (`.claude/context/testing-policy.md`): **one function → one test → tested alone.**

## Writing the test

- Colocate: `src/lib/pnl.js` → `src/lib/pnl.test.js`.
- Shape — exactly one `it` inside one `describe` per function:

  ```js
  import { describe, it, expect } from 'vitest'
  import { avgEntryPrice } from './pnl.js'

  describe('avgEntryPrice', () => {
    it('weights partial fills into one average entry', () => {
      const fills = [{ px: 100, sz: 1 }, { px: 102, sz: 3 }]
      expect(avgEntryPrice(fills)).toBeCloseTo(101.5)
    })
  })
  ```

- One test carries the contract: pick the assertion that would catch the most damaging
  regression. Multiple `expect`s in the single `it` are fine; multiple `it`s are not.
- Deterministic: no real network, no timers (use fake timers only if the function is
  time-math), no unseeded randomness.
- If a function is hard to test with one test, the function is too big — split it
  (each part gets its own single test).

## Running the test (the only allowed invocations)

```bash
# one function
npx vitest run src/lib/pnl.test.js -t "avgEntryPrice"

# each new function of a feature, one command per function
npx vitest run src/engine/bracket.test.js -t "buildBracket"
npx vitest run src/engine/bracket.test.js -t "ocoSibling"
```

Never run bare `npx vitest` / whole-suite / watch mode as part of the cycle. When a
test fails: decide first whether the contract (test) or the code is wrong; fix that
one; re-run that one.
