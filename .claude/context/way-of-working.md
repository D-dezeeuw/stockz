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
5. **Sync again** — `git pull origin main` into the feature branch; resolve conflicts on
   the feature branch, never on main.
6. **Merge** — merge the feature branch into main (`git checkout main && git merge --no-ff
   feature/...`), push main, delete the feature branch.
7. **Tick the plan** — mark the feature's tasks `- [x]` in `masterplan.md` in the same
   merge.
8. Only then start the next feature.

Never stack a second feature on an unmerged branch. Never push a feature branch's work
straight to main without the cycle. Work-in-progress commits on the feature branch are
fine; the merge commit message follows the convention below.

## Commit conventions

- Format: `<type>(f<phase>.<feature>): <imperative summary>` —
  e.g. `feat(f15.3): add arm/disarm toggle to order ticket`.
- Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`, `style`.
- The merge to main uses `--no-ff` so each feature is one visible bubble in history.

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
- [ ] No GitHub Actions files introduced. No secrets in the diff.
- [ ] Grid/theme rules respected (`design-system.md`).
- [ ] Merged to main via the cycle above, masterplan checkboxes updated.
