---
name: lens-build-review
description: Review step for the end of a plan → build workflow. After the agent has implemented a plan, a fresh subagent writes the lens Summary of everything the build changed, and the lens viewer opens on it so the user reviews the result function by function. Use when a build/implementation phase finishes, when a workflow says "review the build with lens", or when the user runs /lens-build-review.
argument-hint: "[base commit recorded before the build — default: all uncommitted changes vs HEAD] [plan file]"
---

# lens build review

The last step of a plan → build workflow: you hand the finished build to lens, a fresh
subagent explains it, and the user reviews it in the lens viewer. You drive every step;
the user only reads the result.

## 1. Pick the diff
- If a base commit was recorded before the build started (e.g. `git rev-parse HEAD` at
  build start), the diff is `<base>` — it covers commits made during the build plus
  uncommitted work.
- Otherwise it's `HEAD`: everything uncommitted, staged or not.
- Files the build **created** need no `git add`: lens shows untracked files as added
  whenever the diff's new side is the working tree, which both diffs above are.

Call the diff arguments `<diff>` below (e.g. `HEAD` or `3f2a91c`).

## 2. Summarize it in a fresh context
Spawn a subagent (a fresh context, not this session — you wrote the code, a fresh
reviewer doesn't share your blind spots) with this task:

> Run `lens summary prepare <diff>` in `<repo root>` and follow the instructions it
> prints exactly: read the tasks, research callers in the repo, write result.json, run
> `lens summary submit`, fix anything it rejects and submit once more. If the tasks come
> in parts, finish with the final pass (flows and the overview) the instructions describe.
> Every bug or risk you notice goes into the unit's `concerns` — the user reads the
> viewer, not your reply.
> [If there is a plan file: "The build implemented `<plan file>`. When a unit does
> something the plan didn't ask for, add a question concern saying so."]
> Reply with only: the concerns you recorded (unit id, kind and one line each), and
> anything submit still rejected.

If your agent can't spawn subagents, do it yourself, following the same printed
instructions.

## 3. Open the viewer on the summary
Start `lens diff <diff> --summary` as a **background** process (it's a server that
keeps running). It opens the browser on the Summary tab. If it reports the port is in
use, a viewer is already running: tell the user to press ↻ refresh in it instead.

## 4. Hand over to the user
In a few lines: the build is summarized in lens (give the URL it printed), how many
units there are, and the concerns the subagent recorded, bugs first — those are where
to start reading; the user confirms or dismisses each one in the viewer. Don't repeat the summary itself; the viewer shows it next to the code.

If `lens` isn't on the PATH, ask the user to install it from the lens desktop app (Settings → Agent).
