# Way of Working

STOCKZ is delivered feature by feature from `.claude/context/masterplan.md`
(30 phases → 10 features each → 10 tasks each). The unit of delivery is the **feature**
(story). Phases are worked in order; features within a phase may be reordered when a
dependency demands it.

## The feature cycle (mandatory, every feature)

1. **Sync main** — `git checkout main && git pull origin main`.
2. **Branch** — create a feature branch from main, named
   `feature/f<phase>-<feature>-<slug>`, e.g. `feature/f15-3-arm-toggle`.
3. **Implement** — only the tasks of that feature (`T<phase>.<feature>.1..10`).
   Nothing outside the feature's scope rides along.
4. **Test** — write exactly one Vitest unit test per new function and run each of those
   tests individually (see `testing-policy.md`). Green = every new function's single test
   passes.
5. **Gate** — run the auto-merge gate (below): all single tests pass AND coverage on the
   feature's files is above 80%, including branch coverage.
6. **Sync again** — `git pull origin main` into the feature branch; resolve conflicts on
   the feature branch, never on main; re-run the gate if the resolution touched code.
7. **Auto-merge** — when the gate is green, merge the feature branch into main
   (`git checkout main && git merge --no-ff feature/...`) and **push to main
   automatically — no human approval step**. Delete the feature branch.
8. **Tick the plan** — mark the feature's tasks `- [x]` in `masterplan.md` in the same
   merge.
9. Only then start the next feature. After the phase's **tenth** feature, close the
   phase and clear the context (below).

## Phase boundaries — clear the context window

**After every phase (all 10 features merged), the context window is cleared before the
next phase begins.** Long sessions accumulate dead detail — resolved errors, superseded
file contents, finished branches — and a scalping codebase needs the model's attention
on the phase in front of it, not the twenty features behind it.

The rule only works because state lives on disk, not in the conversation. Before
clearing, the phase must be **closeable**:

1. All 10 features merged to `main` and pushed; no feature branches left behind.
2. All 100 task checkboxes for the phase ticked in `masterplan.md`.
3. Working tree clean — nothing uncommitted, nothing untracked.
4. `.claude/context/progress.md` updated: phase closed, what shipped, the next phase's
   first feature, and any gotcha the next session would otherwise rediscover the hard
   way.
5. No stray processes: dev/preview servers stopped, ports free, scratch clones deleted.
6. **Deployed and shared** — `npm run deploy`, then post
   `https://d-dezeeuw.github.io/stockz/` in the reply with one line on what is newly
   visible. Every phase ends on a clickable result. From phase 15 (Rapid Order Entry)
   onward this is the point of the phase — the user must be able to click the thing
   that was built.

Then clear the context (`/clear`) and start the next phase fresh — **immediately**. The
boundary exists to make state durable, not to pause for approval; closing a phase and
starting the next one belong in the same working session. The first act of the
new context is to read `CLAUDE.md`, `progress.md` and the next phase in `masterplan.md`
— that trio is the entire handoff. Nothing else may be assumed to carry over.

Mid-phase, do not clear: a half-finished feature's reasoning is not on disk. If the
context is genuinely full mid-phase, finish or abandon the current feature first
(branch merged or branch deleted), update `progress.md`, then clear.

## Auto-merge gate (the only quality bar)

A feature merges and pushes to `main` **automatically** the moment both hold:

1. **Tests green** — every new function's single Vitest test passes when run
   individually (`testing-policy.md`).
2. **Coverage above 80%, including branching** — the feature's test files, run with
   coverage scoped to the files the feature touched, report **> 80% for lines,
   statements, functions AND branches**:

   ```bash
   npx vitest run src/engine/bracket.test.js \
     --coverage.enabled \
     --coverage.include='src/engine/bracket.js' \
     --coverage.thresholds.lines=80 --coverage.thresholds.statements=80 \
     --coverage.thresholds.functions=80 --coverage.thresholds.branches=80
   ```

- Gate green → merge + push to main immediately; do not wait, do not ask.
- Gate red → the feature stays on its branch. Coverage below 80% is fixed by making the
  one test per function exercise more of its function (or by splitting an oversized
  function so each part gets its own single test) — never by adding a second test to a
  function.
- The gate is scoped to the feature's own files — it never measures, or is blocked by,
  the rest of the codebase.

Never stack a second feature on an unmerged branch. Never push a feature branch's work
straight to main without the cycle. Work-in-progress commits on the feature branch are
fine; the merge commit message follows the convention below.

## Commit conventions

- Format: `<type>(f<phase>.<feature>): <imperative summary>` —
  e.g. `feat(f15.3): add arm/disarm toggle to order ticket`.
- Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`, `style`.
- The merge to main uses `--no-ff` so each feature is one visible bubble in history.

## Keep a changelog

`CHANGELOG.md` is maintained by hand in [Keep a Changelog](https://keepachangelog.com/)
format — it is the human-readable record of what the desk gained, separate from the
commit log.

- **Every feature that reaches `main` adds a line under `## [Unreleased]`**, in the same
  merge. Group it under `Added` / `Changed` / `Fixed` / `Removed`, write it from the
  trader's point of view (what they can now do, not which file changed), and tag it with
  the feature id: `- **Order ticket** — one-click buy/sell at bid, ask or market. (F15.1)`
- Internal-only changes (a refactor nobody can perceive) do not need an entry; a
  behavioural change always does.
- **At phase close**, cut `[Unreleased]` into a released section:
  `## [0.<phase>.0] — <date> — Phase <n>: <name>`, with a one-line summary of what the
  phase delivered, and update the compare links at the bottom.

## Versioning (semver)

Pre-1.0 while the masterplan is in flight; **each closed phase is a minor release** —
phase 1 → `0.1.0`, phase 2 → `0.2.0`, … phase 30 → `0.30.0`. **When phase 30 closes,
the desk ships as `1.0.0`.** Fixes between phase closes are patch releases (`0.7.1`).

A version bump touches three places and they must not drift:

1. `package.json` → `version`
2. `src/app/version.js` → `APP_VERSION` (the `appVersion` test fails if it disagrees
   with `package.json`)
3. `CHANGELOG.md` → the new released section

Then tag: `git tag v0.<phase>.0 && git push --tags`.

## Git identity (commit authorship)

All commits in this repository — including commits produced by Claude or any agent —
are authored and committed as the project owner:

```bash
git config user.name  "Danny de Zeeuw"
git config user.email danny@nekomedia.nl
```

- This is a deliberate owner decision: the commit **author ID is Danny, never a bot
  identity**. Do not switch `user.email` to `noreply@anthropic.com` or any other
  identity, even if a hook or tool suggests it; an "Unverified" badge on GitHub is
  accepted.
- AI assistance is credited in the message body via a `Co-Authored-By:` trailer, not
  in the author field.
- Every agent working in this repo must verify `git config user.email` prints
  `danny@nekomedia.nl` before its first commit of a session.

## Product values that gate every change

- **Snappy over safe-looking.** No confirmation dialogs on the trade path. The single
  arm/disarm toggle (Phase 15) and the lean circuit breakers (Phase 24) are the entire
  safety surface — do not add more.
- **O(1) hot paths.** Order submission and tick handling never loop over unbounded data.
- **Grid discipline.** Every dashboard block has identical width and height; only header
  and footer differ. A feature that breaks the grid is redesigned, not excepted.
- **Cache the user, not the market.** Settings persist locally (spektrum/persist);
  market data is always live.

## Definition of done (per feature)

- [ ] All 10 tasks implemented or consciously marked n/a in the plan.
- [ ] One unit test per new function, each passing when run individually.
- [ ] Coverage gate green: > 80% lines/statements/functions/branches on the feature's
      files — then auto-merged and pushed to main without approval.
- [ ] No GitHub Actions files introduced. No secrets in the diff.
- [ ] Grid/theme rules respected (`design-system.md`).
- [ ] Merged to main via the cycle above, masterplan checkboxes updated.
