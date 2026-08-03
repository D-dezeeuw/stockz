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

## 3. Update `.claude/context/progress.md`

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

## 4. Deploy and share the live page

Every phase ends on a URL the user can click — the result has to be *seeable*, not just
described:

```bash
npm run deploy      # vite build && gh-pages -d dist  (local, no CI)
```

Then post the link in the reply, with one line on what is newly visible there:

> Phase <N> live: https://d-dezeeuw.github.io/stockz/ — <what to look at now>

Smoke it before sharing (load, no console errors, theme applied). If a phase produced
nothing visually new, say so and share the link anyway. From **phase 15 (Rapid Order
Entry)** onward the live page is the real deliverable — the order ticket, hotkeys,
positions and PnL are things the user needs to click for themselves, so never close
those phases without a working deploy and an explicit "try this" pointer.

If Pages is not yet enabled for the repo, say so plainly and tell the user to switch it
on (Settings → Pages → Branch: `gh-pages`, `/root`) rather than silently skipping the
step.

## 5. Clear the context

Tell the user the phase is closed, share the link, then `/clear`.

The next context bootstraps by reading `CLAUDE.md` → `progress.md` → the next phase in
`masterplan.md`. Nothing else carries over — if a fact matters beyond this phase, it
belongs in one of those files, not in the conversation.
