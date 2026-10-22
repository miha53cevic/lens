# lens

**The code review tool for the agentic era.**

Agents write code faster than anyone can read it, so reading is now the slow part of
shipping. lens is built for that part. It shows you a change with the noise folded away,
has your own coding agent brief you on it function by function, and lets you ask that
agent questions while you read.

| | what it does | who does the work |
| --- | --- | --- |
| **Code view** | Folds what carries no review signal (imports, doc comments, input guards, logging, defensive boilerplate), so you see the lines where the behavior lives. | lens: parsing and rules (tree-sitter), no AI |
| **Summary view** | One changed function at a time: a headline, concerns, what behaves differently, callers it may break. | your agent writes it, lens checks it |
| **Ask** | A rail where you ask about the code you're reading. Answers cite `path:line`. | your agent answers, lens checks the cites |

lens never calls an AI itself and needs no API key. The summaries and answers come from
the agent you already use, on your existing subscription.

## Install

**macOS app**: download `Lens-darwin-arm64.zip` from the
[latest release](https://github.com/miha53cevic/lens/releases/latest), unzip it, move
`Lens.app` to `/Applications`, then clear the download mark once (the app isn't
notarized, so macOS otherwise calls it "damaged"):

```bash
xattr -dr com.apple.quarantine /Applications/Lens.app
```

**From source** (needs [Bun](https://bun.com) >= 1.4 and git):

```bash
bun install
bun run app             # run the desktop app from this checkout
bun run app:dist        # or pack it for this machine into release/
```

In the app, **Settings → Agent** installs the `lens` command and the agent skills
(`/lens-review`, `/lens-build-review`, `/lens-ask`), and removes them again.

## Quick start

In a repository with changes:

```bash
lens diff               # open your uncommitted changes in the viewer
```

In your agent, to get the Summary tab written:

```bash
/lens-review            # same arguments as `lens diff`
```

Or open the desktop app, pick the repository and what to review.

## Commands

| command | what it opens or prints |
| --- | --- |
| `lens <path…>` | files or directories, folded |
| `lens diff` | the worktree against the index, new untracked files included |
| `lens diff --staged` | staged changes |
| `lens diff HEAD~1` | any `git diff` arguments pass through |
| `lens pr 123` / `lens pr <url>` | a GitHub PR, fetched with plain git (no API, no gh) |
| `lens info` | what could be reviewed here: the branch, its changes, the PR remote |
| `lens config` | the effective config and where it comes from |
| `lens clear` | what lens keeps in `.lens/`, by kind; `lens clear summaries --all` (or `<key>`) clears it |

| flag | meaning |
| --- | --- |
| `--port <n>` | the viewer's port (default: one per repository, from 5400 up) |
| `--no-open` | don't open the browser |
| `--summary` | open on the Summary tab |
| `--threshold <n>` | fold regions with a score up to `n` |
| `--theme <name>` | any [Shiki theme](https://shiki.style/themes) |
| `--json` | print the fold model as JSON, for debugging |
| `--version` | print lens's version |

Loose files and these flags are CLI-only; the desktop app's picker covers the diff and PR
modes.

## Desktop app

The same lens, with screens in place of arguments: one tab per repository, a picker for
what to review (working tree, staged, branch vs a base, custom `git diff` arguments, a PR),
and the viewer in the tab. It reopens as you left it. The viewer runs sandboxed, since it
shows code you didn't write.

## The viewer

- **Folds** collapse into one-line pills that quote what they hide
  (`1 guard → return DEFAULTS + log`), one click from the real code.
- **Diff reading**: hunks only, inline removed lines, word diff, hide tests.
- **Search** across loaded files (⌘P / Ctrl P), ⌥-click for usages.
- **Viewed marks** and a progress ring, so you know what's left. A file or change whose code moved
  after you ticked it says so.
- **The code theme** colors the whole page; a light theme turns it light.
- **Reload** (`r`) re-runs the analysis; the status bar says when the code changed on disk.
- **Clear saved data** (⋯ menu): this review's summary or every review's, and the viewed and
  concern marks, each ticked on its own and listed before anything goes. Settings stay.

Press `?` in the viewer for every key.

## Summary mode

The Summary tab walks the diff one unit (function, component, hook, method, type) at a
time: a headline, **concerns** (possible bugs, risks and questions, each on its line, with
what triggers it and the smallest fix), what behaves differently, and callers it may
break. You mark each concern and possible break *real* or *dismiss* it, and copy the real
ones back to your agent. Units are grouped into **flows**: one story each, read step by step, ranked P1 to
P3, with each unit in one flow and import-only or formatting-only changes under
Housekeeping. An overview of the whole diff sits on top. With **Full units** on (the ⋯ menu),
the rest of a unit's file sits above and below it, behind a bar that says what it holds.

With **Build previews** on (the ⋯ menu, on by default), the agent also draws what the
change looks like: **previews** of the screens a UI diff changes, in your project's own
design system, with the changed parts marked (Before / Now); and **sequences**, diagrams
of what now happens at run time across routes, services, stores and queues. A preview is
the agent's HTML, checked on submit and shown in a sandboxed frame that runs no script but
lens's and loads nothing from outside. Both show on the overview and on each unit they
cover, and go stale with their code.

```bash
/lens-review --staged           # in your agent; or: pr 87
```

The skill runs `lens summary prepare` (splits the diff into units, writes the agent's
instructions) and `lens summary submit` (checks the agent's result and stores it). Any
agent with a shell can follow `prepare`'s printed instructions. `submit` drops any claim
that doesn't point at real code, and a summary goes stale when its code changes.
A summary is written from the checked-out code, so a branch diff (`main...feature`) is
summarized with that branch checked out; a PR is summarized from any branch.
`/lens-build-review` does the whole review step after an agent's build.

## Ask mode

Press `a` to ask your agent about the change you have open, with your selection and the
unit's open concerns and possible breaks along. Run `/lens-ask` in your agent to answer; it only reads, never
edits. Answers cite `path:line`, and lens checks each cite. With no agent listening, a
question can be copied as a prompt for any chat.

## How folding works

Each region gets a category and a score (0–3) and folds when its score ≤ the threshold
(default 1; `[` / `]` change it live). TODO/FIXME comments and `lens:keep` regions never
fold.

| category            | what folds (conservatively) |
| ------------------- | --------------------------- |
| `import`            | contiguous imports and `export … from` re-exports |
| `comment`           | whole-line comments and doc blocks. Work markers and suppressions stay visible |
| `guard`             | an else-less `if` whose body only exits (throw/return/continue/break), optionally with a log line |
| `logging`           | `console.*` / `logger.*` calls whose result is unused and whose arguments do no work |
| `telemetry`         | fire-and-forget `metrics.*` / `telemetry.*` / `analytics.*` calls |
| `error-boilerplate` | catch blocks that only log and/or rethrow |
| `accessor`          | getters/setters that only return or store a value, and one-statement delegation methods |
| `barrel`            | files that are only imports and re-exports |
| `data`              | pure-literal constants: lookup maps, option objects, literal enums |

Folding works on ts, tsx and js. Other files in a diff get change markers and syntax
colors, without folds.

## Configuration

lens's rules are [lens.defaults.json](lens.defaults.json). A `.lens.json` in your project
(the nearest one walking upward) merges over it: scalars override, maps merge, lists
extend. `"base": false` makes your file the whole rule set.

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

| field | meaning |
| ----- | ------- |
| `threshold` | fold regions with score ≤ this (default `1`) |
| `theme` | the Shiki theme the viewer starts in (default `"vesper"`) |
| `categories` | per-category switch; `false` never folds it |
| `scores` | importance per category, 0–3 |
| `callPatterns` | fire-and-forget calls to fold: `{ category, receivers, methods?, score? }` |
| `keepCommentMarkers` | comments containing these never fold |
| `keepDirective` | a region containing it, or right below it, never folds (default `"lens:keep"`) |
| `testFilePatterns` | what *hide tests* hides, and what summary mode treats as tests |
| `exclude` | listed in a diff as `⊘` without being read; skipped in directory walks |
| `buildPreviews` | summary mode asks for previews and sequences (default `true`); the ⋯ menu's switch overrides it for you, in `.lens/settings.json` |

Patterns: `*` matches within a path segment, `**` across them, and a pattern matches
anywhere in the path.

## Development

```bash
bun run test        # typechecks, format check, bun test
bun run app         # the desktop app (Settings → Sandbox shows the design system)
bun run app:smoke   # the app's scripted tour, with pictures in dist/smoke
bun run compile     # lens as one executable, in dist/lens (what the packed app runs)
```

Sources are `src/cli-app/` (the command and the viewer's server), `src/ui/` (the design
system), `src/viewer/` (the viewer page) and `src/desktop/` (the Electron app). Releases go
through release-please: merging its release PR publishes the macOS app.

## Non-goals

- **No AI calls.** Summary and ask mode hand the writing to your own agent.
- **No semantic analysis or type checking.**
- **No editing.** lens is read-only.
- **No terminal output.** The viewer is the only interface (plus `--json` for debugging).
