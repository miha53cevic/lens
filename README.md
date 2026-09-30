# lens

A reading lens for AI-generated code. lens statically classifies every region of a
file and **folds the parts that carry no review signal** — imports, doc comments,
input guards, logging, defensive boilerplate — so a reviewer sees the lines where
the actual behavior lives. Pure parsing and rules (tree-sitter); no AI involved.
An optional **Summary** view adds a per-function review summary written by *your own*
coding agent — lens never calls an AI itself and needs no API key.

## Why

AI assistants write correct-looking but *padded* code: every function re-validates
its inputs, wraps everything in try/catch, logs generously, and carries a JSDoc
essay. The interesting 10 lines end up buried in 40 lines of ceremony. Editors fold
by syntax; lens folds by review relevance.

## Install

Requires Node >= 23.6 (runs TypeScript directly via type stripping).

```bash
npm install
npm run install-cli     # npm-links a global `lens` command (live-updates with the source)
npm run uninstall-cli
npm run install-skill   # links the /lens-review and /lens-build-review skills into ~/.claude/skills
npm run uninstall-skill
```

## Usage

```bash
lens src/ path/to/file.ts  # files or directories

lens diff              # worktree vs index
lens diff --staged     # staged changes
lens diff HEAD~1       # any git diff args pass through

lens pr https://github.com/owner/repo/pull/123   # run inside a clone of the repo
lens pr 123            # a PR on the origin remote

lens config            # print the effective config and where it comes from
lens diff --json       # the fold model as JSON, for debugging
```

Flags: `--port <n>` (default 5326), `--no-open`, `--summary` (open on the Summary
tab), `--threshold <n>`, `--theme <name>` (any [Shiki theme](https://shiki.style/themes)).

**Files and directories** (`lens <path…>`) open any code folded, not just changes:
read an unfamiliar module before reviewing a change to it, open new files that aren't
tracked yet (no `git add -N` needed), use lens outside a git repo, or check what a
`.lens.json` edit folds across a whole folder (`lens src/ --json`). Directory walks
skip `node_modules`, `dist`, `build`, `out`, `coverage`, dotfolders and `exclude` matches; a file passed
explicitly is always analyzed.

## The viewer

- **Folds** collapse into one-line pills that quote what they hide
  (`1 guard → return DEFAULTS + log`); every pill is one click from the real code. In
  diff mode a `●` marks pills that contain changed lines.
- **Diff mode** shows every text file the diff touched. Unsupported types (json, md,
  yaml, …) get change markers and syntax colors, just no folding. Removed lines show
  inline, struck through, where they were deleted (`x` hides them). **Hunks only**
  (`h`) shows just the changes with 3 lines of context, PR-style. Lockfiles and
  minified files (`exclude`) are listed as dimmed `⊘` rows without being read; pure
  renames show as `R` rows.
- **Search**: ⌘P (Ctrl+P) searches across all loaded files; ⌥-click an identifier to
  find its usages.
- **↻ refresh** re-runs the analysis — new file contents, a fresh `git diff`, edits
  to `.lens.json` — without restarting the server. The ⚙ modal shows the effective
  config.
- **Keys** (`?` lists them): j/k files, e/c folds, [/] threshold, h hunks, x removed
  lines, t hide tests, / filter, s sidebar, r refresh, v Code/Summary.

**PR mode** uses git alone — no GitHub API or gh CLI, so private repos just use your
normal git auth. It fetches `refs/pull/N/head` (fork PRs work) from a matching local
remote and diffs from the merge base with the PR's target branch, the same range the
PR page shows. The target comes from GitHub's `refs/pull/N/merge`, falling back to
the remote's default branch when that ref is gone. ↻ refresh re-fetches, so new
pushes appear without restarting.

## Summary mode

In diff and PR mode the viewer has two tabs: **Code** (the default) and **Summary** —
one changed unit at a time (function, component, hook, method, type, …) with a
one-line headline, a **When / Before / Now** table of what behaves differently (each
row links to the line that causes it), callers outside the diff it may break (click
one to peek at the call), and the unit's code with the usual folds and removed lines.

The summary is written by your coding agent, on your existing subscription:

```bash
# in your agent (Claude Code: after npm run install-skill)
/lens-review --staged          # same arguments as `lens diff`, or: pr 87
```

which runs

```bash
lens summary prepare --staged  # splits the diff into units → .lens/summary/<key>/
                               # (tasks.md with labeled lines, schema.json, instructions)
lens summary submit .lens/summary/diff-staged
                               # validates the agent's result.json and stores it
```

Any agent with a shell can follow `prepare`'s printed instructions; the skill is only
a thin pointer to them. After a submit, the Summary tab shows a dot when you return to
the viewer (or press ↻).

**As the review step of a plan → build workflow**, `/lens-build-review [base-commit]
[plan-file]` has the agent do everything: pick the build's diff (making new files
visible with `git add --intent-to-add`), let a fresh subagent write and submit the
summary (flagging changes the plan didn't ask for), open the viewer on the Summary tab,
and point you at the units that need a look.

**What lens checks.** Units are found deterministically (tree-sitter, old and new side
of every changed file), and every changed or removed line belongs to exactly one unit.
`submit` drops, with a reason, any claim that doesn't point at real code: a table row
must cite one of the unit's changed (`N18`) or removed (`O16`) lines; a caller must be
a `path:line` that exists and mentions the unit; flows need 2+ known units; text over
the length limits is rejected. Summaries remember the unit's hash: when the code
changes, the unit shows "code changed — re-run", and the next `prepare` only asks
about units that changed.

`.lens/` carries its own `*` `.gitignore`, so nothing needs adding to your repo and
nothing is written into `.git`.

## How folding works

```
file | directory | git diff → parse (tree-sitter: ts, tsx, js) → classify + score ← .lens.json → viewer
```

Each region gets a category and a score (0–3); it folds when score ≤ threshold. The
viewer's slider switches the threshold live.

| threshold | what folds |
| --------- | ---------- |
| off (-1)  | nothing — the plain file |
| 0         | zero-signal scaffolding: imports, comments, barrel files |
| 1         | **default** — also guards, logging, telemetry, log-and-rethrow catches, accessors, constant data |
| 2–3       | nothing extra by default — headroom for categories you score 2–3 |
| —         | score 4 never folds: TODO/FIXME comments and `lens:keep` regions |

| category            | what folds (conservatively) |
| ------------------- | --------------------------- |
| `import`            | contiguous imports and `export … from` re-exports |
| `comment`           | whole-line comments and doc blocks — work markers and suppressions (`eslint-disable`, `@ts-ignore`, …) stay visible |
| `guard`             | an else-less `if` whose body only exits (throw/return/continue/break), optionally with a log line |
| `logging`           | `console.*` / `logger.*` calls whose result is unused |
| `telemetry`         | fire-and-forget `metrics.*` / `telemetry.*` / `analytics.*` calls |
| `error-boilerplate` | catch blocks that only log and/or rethrow |
| `accessor`          | getters/setters and one-statement delegation methods |
| `barrel`            | files that are only imports and re-exports fold to one pill |
| `data`              | pure-literal constants: lookup maps, option objects, literal enums, runs of one-liner consts (3+ lines) |

Guards fold regardless of what they return — judging whether a guard hides a bug is
the reviewer's job, and the pill quotes the exit so nothing is invisible. An `if`
whose body does real work is never a guard.

## Configuration

lens's own rules are [lens.defaults.json](lens.defaults.json). A `.lens.json` in your
project (the nearest one walking upward) merges over it: **scalars override, maps
merge, lists extend**. `"base": false` makes your file the whole rule set instead.
To go back to the defaults, delete (or rename) your `.lens.json`.

```json
{
  "threshold": 0,
  "categories": { "logging": false },
  "scores": { "guard": 2 },
  "callPatterns": [{ "category": "audit", "receivers": ["audit", "featureFlags"] }],
  "keepCommentMarkers": ["SECURITY"],
  "exclude": ["generated/**"]
}
```

This lowers the threshold, never folds logging, keeps guards visible until the slider
reaches 2, and **adds** an `audit` category next to the built-in call patterns.

| field | default | meaning |
| ----- | ------- | ------- |
| `threshold` | `1` | fold regions with score ≤ this; `--threshold` overrides per run |
| `theme` | `"vesper"` | Shiki theme; `--theme` overrides per run |
| `categories` | all `true` | per-category switch; `false` never folds it |
| `scores` | 0 for import/comment/barrel, 1 otherwise | importance per category, 0–3 (4 is reserved for never-fold) |
| `callPatterns` | logging, telemetry | fire-and-forget calls to fold, see below |
| `keepCommentMarkers` | TODO, FIXME, HACK, XXX, lint/type suppressions | comments containing these never fold |
| `keepDirective` | `"lens:keep"` | a region containing it, or right below it, never folds |
| `testFilePatterns` | `*.spec.*`, `*.test.*`, `__tests__/**` | what the viewer's **hide tests** toggle hides, and which files summary mode treats as tests |
| `exclude` | lockfiles, `*.min.js`, `*.min.css`, `*.map` | diff mode lists these as `⊘` without reading them; directory walks skip them (a file passed explicitly is always analyzed) |

Path patterns: `*` matches within a segment, `**` across segments, and a pattern
matches anywhere in the path (`*.min.js` matches `dist/app.min.js`).

**`callPatterns`** fold expression statements `<receiver>.<method>(...)` whose result
is unused:

- `category` — built-in or new; a new name gets its own pill label and chip.
- `receivers` — matched against the receiver's trailing segment, so `logger` matches
  `this.logger.info(…)`; `*` is a wildcard (`*Logger` matches `requestLogger`).
- `methods` — optional; omit to match any method.
- `score` — optional; defaults to `scores[category]`, then 1.

Calls matched by a pattern also count as noise inside guards and catch blocks, so
`if (!x) { logger.warn("no x"); return null; }` still folds as a guard.

**`keepDirective`** is the per-site escape hatch:

```ts
// lens:keep — this guard was buggy last week, always show it
if (!input) {
  throw new Error("input required");
}
```

## Development

```bash
npm test            # typecheck + node --test
```

Classifier rules live in `src/classify/typescript.ts` (shared by ts/tsx/js). The viewer
is `src/render/web/`: `viewer.html`, `viewer.css`, `viewer.js` (Code view) and
`summary.js` (Summary view), which the server inlines into one page. The scripts are
plain JS type-checked through JSDoc (`tsconfig.viewer.json`, part of `npm test`).
Fixture-driven tests are the main defense against a fold hiding a real bug — a rule
change that suddenly folds more fails loudly.

## Non-goals

lens itself calls no AI (summary mode hands the writing to your own agent). No
semantic analysis or type checking. No editing — lens is read-only. No terminal
output — the viewer is the only interface (plus `--json` for debugging).
