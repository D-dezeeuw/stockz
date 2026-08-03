---
name: feature-cycle
description: Run the STOCKZ feature delivery cycle for one masterplan feature - branch from main, implement its 10 tasks, single unit tests, merge back to main. Use whenever starting or finishing a feature (F<phase>.<n>).
---

# Feature Cycle

The only way code reaches `main`. One feature (`F<phase>.<n>` from
`.claude/context/masterplan.md`) per cycle, no exceptions.

## Steps

1. **Locate the feature.** Open `masterplan.md`, find `F<phase>.<n>`, read its What/How
   and 10 tasks. If a task is impossible or obsolete, note it now — don't discover it
   mid-branch.
2. **Sync + branch.**
   ```bash
   git checkout main && git pull origin main
   git checkout -b feature/f<phase>-<n>-<slug>
   ```
3. **Implement task by task** (T1 → T10). Keep commits small:
   `feat(f<phase>.<n>): <task summary>`. Scope discipline: if it isn't in the task
   list, it isn't in this branch.
4. **Test per function.** For every function created, write its one Vitest test and run
   it individually:
   ```bash
   npx vitest run src/path/module.test.js -t "functionName"
   ```
   Green = all of this feature's new functions pass their single tests.
5. **Coverage gate.** Run the feature's test files with coverage scoped to the files the
   feature touched; all four metrics must exceed 80% — **including branches**:
   ```bash
   npx vitest run src/path/module.test.js \
     --coverage.enabled --coverage.include='src/path/module.js' \
     --coverage.thresholds.lines=80 --coverage.thresholds.statements=80 \
     --coverage.thresholds.functions=80 --coverage.thresholds.branches=80
   ```
   Red gate = stay on the branch; deepen each function's single test (or split the
   function), never add a second test or lower thresholds.
6. **Re-sync.** `git pull origin main` into the branch. Resolve conflicts **on the
   branch**. Re-run the single tests (and the gate, if code changed) of anything touched
   by the resolution.
7. **Auto-merge.** Tests green + gate green = merge and push to main **immediately and
   automatically — no approval step**:
   ```bash
   git checkout main
   git merge --no-ff feature/f<phase>-<n>-<slug> -m "feat(f<phase>.<n>): <feature name>"
   git push origin main
   git branch -d feature/f<phase>-<n>-<slug>
   ```
8. **Tick the plan.** Mark the feature's `- [ ]` tasks as `- [x]` in `masterplan.md`
   (include this in the merge or as `docs(f<phase>.<n>): tick plan`).

## Guards

- Never start feature B while feature A is unmerged.
- Never rebase `main`; never force-push `main`.
- Never add `.github/workflows/` — this project has no CI by design.
- A conflict you can't resolve confidently = stop and surface both sides, don't guess.
