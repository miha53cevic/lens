# lens

A reading lens for AI-generated code. lens statically classifies every region of a
file and **folds the parts that carry no review signal** — imports, doc comments,
input guards, logging, defensive boilerplate — so a reviewer sees the lines where
the actual behavior lives. Pure parsing and rules (tree-sitter); no AI involved.

## Why

AI assistants write correct-looking but *padded* code: every function re-validates
its inputs, wraps everything in try/catch, logs generously, and carries a JSDoc
essay. The interesting 10 lines end up buried in 40 lines of ceremony. Editors fold
by syntax; lens folds by review relevance.

## Install

```bash
npm install
npm run install-cli     # npm-links a global `lens` command (live-updates with the source)
npm run uninstall-cli   # removes it
```

## Usage

```bash
# open the web viewer on files or directories
lens path/to/file.ts
lens src/

# review what just changed (the killer use case for AI edits)
lens diff              # worktree vs index
lens diff --staged     # staged changes
lens diff HEAD~1       # any git diff args pass through

# other outputs
lens src/ --term       # folded view in the terminal
lens diff --term --hunks  # terminal, changed hunks only (PR-style)
lens src/ --json       # the fold model as JSON, for other tools
```

Viewer flags: `--port <n>` (default 5326), `--no-open`, `--threshold <n>`,
`--theme <name>` (any [Shiki theme](https://shiki.style/themes), default `vesper`).
The viewer also has a live theme dropdown — switching re-tokenizes on the server.
`--term` output uses the same theme as 24-bit ANSI color when stdout is a terminal
(plain text when piped, or with `NO_COLOR` set).

Diff mode includes **every text file the diff touched** — unsupported types
(json, md, yaml, ...) appear with change markers, removed lines, and syntax
colors when Shiki knows the language, just without folding (binaries are
skipped). Lockfiles and minified/generated files (`exclude` in `.lens.json`)
are listed as dimmed `⊘` rows without being read at all, and pure renames
show as `R` rows (`old → new` on hover). A **hunks only**
toggle shows just the changed hunks with 3 lines of context, PR-style, with
click-to-expand separators for the unchanged stretches — folds still apply
inside the hunks. The sidebar has a filter box (Esc clears), a ⚙ settings
modal showing the effective config, and is collapsible and resizable. Press
`?` in the viewer for the keyboard shortcuts (j/k files, e/c folds, [/]
threshold, h hunks, x removed lines, t tests, / filter, s sidebar, r refresh). The viewer also shows the **removed lines** inline (red,
struck-through, anchored where they were deleted) with a toggle to hide them,
and the **↻ refresh** button re-runs the analysis — new file contents and a
fresh `git diff` — without restarting the server. A **hide tests** toggle
filters `*.spec.*` / `*.test.*` files out of the tree (patterns configurable
via `testFilePatterns` in `.lens.json`), and the file tree is collapsible
and resizable.

Requires Node >= 23 (runs TypeScript directly via type stripping).

## How it works

```
file | directory | git diff
        │
        ▼
   parse (tree-sitter WASM — typescript, tsx, javascript)
        │
        ▼
   classify + score  ←  .lens.json (optional)
        │
        ▼
   fold model (plain JSON: regions with category, score, summary)
        │
        ├── web viewer (default)
        └── terminal printer (--term)
```

Each region gets a category and an importance score; regions scoring at or
below the fold threshold collapse into a one-line summary pill with original
line numbers preserved. The threshold levels mean:

| level | what folds                                                                  |
| ----- | --------------------------------------------------------------------------- |
| off   | nothing — the plain file                                                     |
| 0     | zero-signal scaffolding: imports, comments, barrel files                     |
| 1     | **default** — also defensive ceremony: guards, logging, telemetry, log-and-rethrow catches, accessors |
| 2–3   | reserved headroom: nothing extra by default; fold categories you score 2–3 in `.lens.json` |
| —     | score 4 never folds: TODO/FIXME comments and `lens:keep` regions             |

The viewer's slider switches levels live, with a description of what the
current level folds in the open files; hover it for the full per-level
breakdown (computed from the actual regions, so custom categories show up too). **Fold ≠ hide**: every pill is one click from the real code,
and in diff mode a `●` marks pills that contain changed lines.

### Fold taxonomy

| category            | what folds (conservatively)                                            |
| ------------------- | ---------------------------------------------------------------------- |
| `import`            | contiguous import statements and `export ... from` re-exports           |
| `comment`           | whole-line comments and doc blocks — TODO/FIXME-style markers and suppressions (`eslint-disable`, `@ts-ignore`, ...) stay visible |
| `guard`             | any else-less `if` whose body only exits (throw/return/continue/break), optionally with a log line |
| `logging`           | `console.*` / `logger.*` calls whose result is unused                   |
| `telemetry`         | fire-and-forget `metrics.*` / `telemetry.*` / `analytics.*` calls       |
| `error-boilerplate` | catch blocks that only log and/or rethrow                               |
| `accessor`          | getters/setters and one-statement delegation methods in classes         |
| `barrel`            | files that are nothing but imports and re-exports fold to a single pill |
| `data`              | pure-literal constants: lookup maps, option objects, literal enums, runs of one-liner consts (3+ lines) |

Guards fold regardless of what they return — judging whether a guard hides a bug
is the reviewer's job, and the pill quotes the exit (`1 guard → return DEFAULTS + log`)
so nothing is invisible. An `if` whose body does real work (assignments, calls
whose results matter) is never a guard.

## Configuration

lens's own rules live in [lens.defaults.json](lens.defaults.json) — the "base
game" is itself just a config file. A `.lens.json` in your project root (found
by walking upward) merges over it: **scalars override, maps merge, lists
extend**. Set `"base": false` to replace the built-in rules entirely instead
of extending them.

**[CONFIG.md](CONFIG.md) documents every field, using the defaults as the
worked example** — threshold levels, category switches, scores, custom
call patterns, keep markers, and the `lens:keep` directive.

```json
{
  "threshold": 1,
  "theme": "github-dark",
  "categories": { "logging": false },
  "scores": { "guard": 2 },
  "callPatterns": [
    { "category": "audit", "receivers": ["audit", "featureFlags"] },
    { "category": "logging", "receivers": ["*Reporter"], "methods": ["send"] }
  ],
  "keepCommentMarkers": ["SECURITY"],
  "keepDirective": "lens:keep"
}
```

Managing the config from the CLI:

```bash
lens config          # show the effective merged config + its source
lens config init     # create .lens.json here — a standalone copy of the defaults
lens config reset    # restore defaults (.lens.json moves to .lens.json.bak)
```

`reset` is reversible: rename the `.bak` back to bring your custom config back.

## Development

```bash
npm test            # typecheck + node --test
npm run typecheck
```

Classifier rules live in `src/classify/typescript.ts` (shared by ts/tsx/js).
Fixture-driven tests in `test/` are the main defense against a fold hiding a real
bug — a rule change that suddenly folds more fails loudly.

## Non-goals (v1)

No AI/LLM anything (future maybe). No semantic analysis or type checking. No
editing — lens is read-only. No editor plugin yet, though the fold model JSON is
designed so one can exist later.
