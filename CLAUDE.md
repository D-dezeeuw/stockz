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

1. **One feature = one branch.** Implement only that feature there; merge to main when its
   tests are green; then the next feature. See `way-of-working.md`.
2. **Exactly one Vitest unit test per function.** When testing, run only that function's
   test — never the whole suite as routine. See `testing-policy.md`.
3. **No GitHub Actions.** Ever. Deploys go out locally via the `gh-pages` package.
4. **UI = Spektrum from unpkg CDN** (importmap, pinned major `spektrum@1`). No SPA framework.
5. **Secrets never land in git.** Env vars `STOCKZ_OKX_*` / `STOCKZ_ETORO_*` are for local
   dev; in the browser keys come from URL params or the key modal.
6. **Speed first.** Every interaction targets <100ms perceived latency; every hot path is O(1)
   or rAF-batched. If a change adds a confirmation step, it is wrong.

## Quick commands

```bash
npm run dev       # Vite dev server
npm run build     # production build (GitHub Pages base path)
npm run deploy    # build + publish dist/ to gh-pages branch (local, no CI)
npx vitest run <file> -t "<functionName>"   # test exactly one function
```
