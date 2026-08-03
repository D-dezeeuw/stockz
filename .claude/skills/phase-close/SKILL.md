---
name: phase-close
description: Close a finished STOCKZ phase - verify all 10 features merged, update progress.md, stop stray processes, then clear the context window before the next phase. Use when a phase's last feature is merged.
---

# Phase Close

Run this the moment a phase's **tenth** feature merges. It makes the phase's state
durable on disk so the context window can be cleared without losing anything.

## 1. Verify the phase is actually closed

```bash
git branch --list 'feature/*'                                  # must be empty
git status --porcelain                                         # must be empty
grep -c "^- \[x\] \*\*T<N>\." .claude/context/masterplan.md    # must be 100
git log origin/main..main                                      # must be empty (all pushed)
```

Any of these failing means the phase is not closed — finish it first. A leftover
feature branch is unfinished work; do not clear a context that owns it.

## 2. Stop everything still running

```bash
pkill -f "bin/vite"; ss -ltn | grep -E '5173|4173'   # no dev/preview servers
pgrep -c chrome                                       # no headless browsers
```

Delete scratch clones and build output you no longer need. A cleared context cannot
clean up processes it does not remember starting.

## 3. Cut the release: changelog + version

1. In `CHANGELOG.md`, turn `## [Unreleased]` into
   `## [0.<phase>.0] — <YYYY-MM-DD> — Phase <n>: <name>` with a one-line summary of what
   the phase delivered, then open a fresh empty `[Unreleased]` above it and fix the
   compare links at the bottom.
2. Bump the version in **both** `package.json` and `APP_VERSION` in
   `src/app/version.js` — the `appVersion` test fails if they drift. Phase `n` → `0.n.0`;
   **phase 30 → `1.0.0`** (feature-complete).
3. Tag after pushing: `git tag v<version> && git push --tags`.

## 4. Update `.claude/context/progress.md`

This file *is* the handoff. Rewrite the top section so it states:

- **Phase closed** — number, name, date, and the one-line outcome.
- **What shipped** — a row per feature: what a user can now do, and where the code
  lives.
- **Next up** — the next phase and its first feature, with anything already decided
  about it.
- **Gotchas** — environment quirks, venue oddities, tooling traps a fresh context would
  otherwise rediscover the hard way (e.g. "Vite coerces env bag values to strings").
- **Deviations from the plan** — where implementation diverged from `masterplan.md` and
  why, so the next session does not "fix" a deliberate choice.

Commit it to `main` with `docs(f<N>): close phase <N>` and push.

## 5. Deploy and share the live page

Every phase ends on a URL the user can click — the result has to be *seeable*, not just
described:

```bash
npm run deploy      # git push origin main && verify:pages  (Pages serves main root)
```

Then post the link in the reply, with one line on what is newly visible there:

> Phase <N> live: https://d-dezeeuw.github.io/stockz/ — <what to look at now>

Smoke it before sharing (load, no console errors, theme applied). If a phase produced
nothing visually new, say so and share the link anyway. From **phase 15 (Rapid Order
Entry)** onward the live page is the real deliverable — the order ticket, hotkeys,
positions and PnL are things the user needs to click for themselves, so never close
those phases without a working deploy and an explicit "try this" pointer.

`verify:pages` must pass before you share the link — a push is not evidence the site
loads. If it fails, fix it before closing the phase rather than sharing a broken URL.

## 6. Clear the context — then keep going

Tell the user the phase is closed, share the link, then `/clear`.

**A phase boundary is a checkpoint, not a stopping point.** Closing a phase means the
state is durable enough to survive a context reset — it does not mean the work pauses for
approval. Unless the user asked for a pause, start the next phase's first feature
immediately. When running autonomously, never end a turn at a phase boundary while there
is runway left: close the phase, then begin the next one in the same turn.

The next context bootstraps by reading `CLAUDE.md` → `progress.md` → the next phase in
`masterplan.md`. Nothing else carries over — if a fact matters beyond this phase, it
belongs in one of those files, not in the conversation.
