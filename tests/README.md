# tests/

Unit tests are **colocated** with their source (`src/lib/pnl.js` → `src/lib/pnl.test.js`)
per `.claude/context/testing-policy.md` — one Vitest test per function, run individually.

This folder holds only **shared fixtures and helpers** used by those colocated tests
(e.g. recorded venue payloads, tick fixtures). Nothing here is a test itself.
