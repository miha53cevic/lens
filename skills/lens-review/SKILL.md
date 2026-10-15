---
name: lens-review
description: Write the lens viewer's Summary for a code diff — per changed function, component or hook a headline, what behaves differently (When / Before / Now), and callers it may break. Use when the user runs /lens-review or asks for a lens summary of staged changes, a commit range, a branch, or a GitHub PR.
argument-hint: "[git diff args, e.g. --staged or main...feature | pr <url|number>]"
---

# lens review

Lens splits the diff into units and checks your answer; you write the summary. Nothing
here needs an API key — you are the model.

1. Run `lens summary prepare $ARGUMENTS`
   (no arguments = unstaged working-tree changes, same as `lens diff`).
2. Follow the instructions it prints. They are the source of truth for the result format,
   the rules and the length limits — they come from the installed lens, so they're current.
   If you can, hand the analysis to a subagent with a fresh context instead of doing it in
   the session that wrote the code: a fresh reviewer doesn't share the author's blind spots.
3. Run the `lens summary submit …` command from the instructions. If it rejects entries,
   fix exactly those and submit once more.
4. Tell the user the summary is ready: refresh the lens viewer (↻) and open the
   Summary tab (`v`).

If `lens` isn't on the PATH, ask the user to run `bun run install-cli` in the lens repo.
