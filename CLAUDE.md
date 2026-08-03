# STOCKZ — Hyper-Scalping Micro-Trading Desk

Fast, snappy, high-frequency scalping dashboard. Speed is the product: no bureaucratic
confirm-dialogs, no endless guardrails — one lean circuit-breaker set and everything else
optimized for trades-per-hour.

## Read these before working

| File | What it governs |
| --- | --- |
| `.claude/context/masterplan.md` | The full delivery plan: 30 phases × 10 features × 10 tasks |
| `.claude/context/way-of-working.md` | Feature-branch cycle, merge rules, commit style |
| `.claude/context/testing-policy.md` | One unit test per function — no exceptions |
| `.claude/context/architecture.md` | Stack, module layout, data flow |
| `.claude/context/design-system.md` | Green/orange money-hacker theme, grid rules |
| `.claude/context/integrations.md` | OKX + EToro credentials and clients |
| `.claude/context/deployment.md` | GitHub Pages via `npm run deploy` — no GitHub Actions |

## Non-negotiables (short form)

1. **One feature = one branch.** Implement only that feature there; when its tests are
   green and the coverage gate passes, it **auto-merges and pushes to main — no approval
   step**; then the next feature. See `way-of-working.md`.
2. **Exactly one Vitest unit test per function.** When testing, run only that function's
   test — never the whole suite as routine. The merge gate additionally requires
   **> 80% coverage including branches** on the feature's files. See `testing-policy.md`.
3. **No GitHub Actions.** Ever. GitHub Pages serves the `main` branch root — pushing is
   deploying. The app ships as raw ES modules: no build step in the deploy path.
4. **UI = Spektrum from unpkg CDN** (importmap, pinned major `spektrum@1`). No SPA framework.
5. **Secrets never land in git.** Env vars `STOCKZ_OKX_*` / `STOCKZ_ETORO_*` are for local
   dev; in the browser keys come from URL params or the key modal.
6. **Speed first.** Every interaction targets <100ms perceived latency; every hot path is O(1)
   or rAF-batched. If a change adds a confirmation step, it is wrong.
7. **Keep `CHANGELOG.md`.** Every feature adds a line under `[Unreleased]` in its merge;
   each closed phase cuts `0.<phase>.0` (phase 30 ships **1.0.0**). See `way-of-working.md`.
8. **Never stop before phase 30 is done.** The masterplan is delivered end to end without
   pausing for approval. The failure mode is **ending a turn with a status summary** —
   after a merge or a phase close, the next action is the next feature's branch, not a
   recap. A green suite, a deploy, a closed phase are all mid-loop, not finish lines.
   Only an explicit instruction from the owner stops the work. See `way-of-working.md`.
9. **Clear the context after every phase.** When a phase's ten features are merged, close
   it (`phase-close` skill): update `.claude/context/progress.md`, then `/clear` and start
   the next phase fresh. Never clear mid-feature. See `way-of-working.md`.

## Starting a fresh context

Read, in order: this file → `.claude/context/progress.md` (where the project stands) →
the current phase in `.claude/context/masterplan.md`. That trio is the whole handoff.

## Quick commands

```bash
npm run dev       # Vite dev server
npm run build     # production build (GitHub Pages base path)
npm run deploy    # push main (the site) + verify the live page — no CI, no build step
npx vitest run <file> -t "<functionName>"   # test exactly one function
```
