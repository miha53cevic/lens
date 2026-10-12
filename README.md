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

## Contents

- [Why](#why)
- [Quick start](#quick-start)
- [Commands](#commands)
- [Desktop app](#desktop-app)
- [The viewer](#the-viewer)
- [Summary mode](#summary-mode)
- [Ask mode](#ask-mode)
- [How folding works](#how-folding-works)
- [Configuration](#configuration)
- [Development](#development)
- [Non-goals](#non-goals)

## Why

AI assistants write correct-looking but *padded* code: every function re-validates its
inputs, wraps everything in try/catch, logs generously, and carries a JSDoc essay. The
interesting 10 lines end up buried in 40 lines of ceremony.

Editors fold by syntax. lens folds by review relevance.

## Quick start

Requires Node >= 23.6 (lens runs its TypeScript directly, via type stripping).

```bash
npm install
npm run install-cli     # links a global `lens` command (it follows the source)
npm run install-skill   # links /lens-review, /lens-build-review and /lens-ask into ~/.claude/skills
```

Then, in a repository with changes:

```bash
lens diff               # open your uncommitted changes in the viewer
```

And in your agent, to get the Summary tab written:

```bash
/lens-review            # same arguments as `lens diff`
```

To remove them again: `npm run uninstall-cli` and `npm run uninstall-skill`.

Prefer a window to a terminal? The [desktop app](#desktop-app) picks the repository and
the review for you, and installs the command and the skills from its Settings.

## Commands

| command | what it opens or prints |
| --- | --- |
| `lens <path…>` | files or directories, folded |
| `lens diff` | the worktree against the index, new untracked files included |
| `lens diff --staged` | staged changes |
| `lens diff HEAD~1` | any `git diff` arguments pass through |
| `lens pr 123` | a PR on the origin remote |
| `lens pr <url>` | a PR by its GitHub URL (run inside a clone of the repo) |
| `lens info` | what could be reviewed here: the branch, its changes, the PR remote |
| `lens config` | the effective config and where it comes from |

| flag | meaning |
| --- | --- |
| `--port <n>` | the viewer's port (default 5326) |
| `--no-open` | don't open the browser |
| `--summary` | open on the Summary tab |
| `--threshold <n>` | fold regions with a score up to `n` |
| `--theme <name>` | any [Shiki theme](https://shiki.style/themes) |
| `--json` | print the fold model as JSON, for debugging |

### Files and directories

`lens <path…>` opens any code folded, not just changes. Use it to:

- read an unfamiliar module before reviewing a change to it,
- use lens outside a git repo,
- check what a `.lens.json` edit folds across a whole folder (`lens src/ --json`).

Directory walks skip `node_modules`, `dist`, `build`, `out`, `coverage`, dotfolders and
`exclude` matches. A file passed explicitly is always analyzed.

### New files

`git diff` lists tracked files only. lens adds the untracked ones itself, as added files, whenever
the diff's new side is the working tree: `lens diff`, `lens diff HEAD`, `lens diff main`, each with
or without paths. So a file your agent just created is in the review without a `git add`, as it is
in VS Code's Source Control list. Ignored files stay out (`.gitignore`), and so do binary and empty
ones. `--staged`, `A..B`, `A...B` and PRs don't read the working tree, so they add none. lens only
reads: your index is never touched.

### Pull requests

PR mode uses git alone: no GitHub API and no gh CLI, so private repos just use your
normal git auth.

- It fetches `refs/pull/N/head` from a matching local remote. Fork PRs work.
- It diffs from the merge base with the PR's target branch, the same range the PR page
  shows. The target comes from GitHub's `refs/pull/N/merge`, falling back to the remote's
  default branch when that ref is gone.
- Reload re-fetches, so new pushes appear without restarting.

### `lens info`

Reads the repository you run it in and changes nothing. It prints:

- the branch,
- how many files are changed and staged,
- how far the branch is ahead of its base (the remote's default branch; `--base <ref>`
  picks another),
- the GitHub remote `lens pr <N>` would use.

`--json` prints it for a program to read (the desktop app's picker does), and `--themes`
adds the theme menu's themes with their colors (`--theme <name>` adds that one to them).

## Desktop app

The same lens, with screens in place of arguments. The app runs the `lens` command for
you and shows its viewer in a tab, so everything in [The viewer](#the-viewer),
[Summary mode](#summary-mode) and [Ask mode](#ask-mode) applies unchanged. The command
keeps working on its own, with or without the app.

```bash
npm run app            # run it from this checkout
npm run app:dist       # pack it for this machine into release/
```

`app:dist` makes a folder, not an installer: `release/Lens-darwin-arm64/` with `Lens.app`
on Apple-silicon macOS, `release/Lens-win32-x64/` with `Lens.exe` on 64-bit Windows.
Each is made on its own system. Keep the folder wherever you like and run the app from
it; removing the app is deleting the folder. The app needs git on the machine and
nothing else: it carries its own copy of the CLI.

It isn't signed with a certificate. An app you packed yourself opens as any other; one
copied from another machine may need a confirmation first: on macOS, right-click the app
and choose Open (or allow it under System Settings → Privacy & Security); on Windows,
More info → Run anyway.

### Tabs

One window, one tab per repository. The strip of tabs is the window's title bar. More tabs
than fit scroll sideways (a mouse's wheel moves them too), and the tab in front is kept in sight.

| in the strip | what it does |
| --- | --- |
| a tab | says what it shows: the repository, then the review (`staged changes`, `PR #482`) |
| **⇄** on a tab with a review | opens the picker over the review, to change what's reviewed; its back arrow returns to the review as you left it |
| **×** | closes the tab and stops its review |
| **+** | a new tab, on Start |
| the theme swatch | the code themes; picking one recolors the app and the open reviews. It is the app's one theme button: a review's own, in its header, is hidden here |
| the gear | Settings, in a tab of its own |

A repository gets one tab: opening it again goes to the tab it has. *End session* in a
review's ⋯ menu ends the review and leaves the tab on its picker.

### Where you left off

The app opens as you left it: the window where it was (maximized if it was), and the tabs
that had a repository, each on the review it showed.

- The tab in front starts its review again right away. The others start theirs the first
  time you click them, so a tab you don't look at costs nothing.
- Until its review shows, a reopened tab is a loading screen in the review's shape, not
  the picker. **Cancel** in the status bar stops it and shows the picker.
- A tab whose repository is gone (deleted, moved, not a repository anymore) isn't
  reopened.
- A review that can't start anymore leaves its tab on the picker, with the reason in the
  status bar: the base branch was deleted, the PR can't be fetched offline, nothing is
  changed anymore.
- A window last seen on a monitor that isn't there opens centered on the main display.

Start and Settings tabs aren't kept, and full screen isn't.

### Picking what to review

**Start** has one button, *Open repository*, and the folders you opened before. The
list remembers only the folders, no branch and no past review. A folder that is deleted
while its picker is open sends the tab back to Start, which says so.

The **picker** then offers what the command does, and shows the command it will run:

| choice | runs |
| --- | --- |
| Changes · Working tree | `lens diff` |
| Changes · Staged | `lens diff --staged` |
| Changes · This branch vs a base | `lens diff <base>...HEAD` |
| Changes · Custom | `lens diff <what you type>` |
| Pull request | `lens pr <number or URL>` |

The counts beside the choices come from [`lens info`](#lens-info), read again every 5
seconds while the picker is in sight: stage something in a terminal and the picker
follows. Opening loose files
(`lens <path…>`) and the flags (`--summary`, `--threshold`, `--theme`, `--json`) stay
with the command.

The status bar under the picker says what is happening, as the viewer's does: what is
being opened (with *Cancel*), why something couldn't be (the command's own reason), that
git wasn't found, or that a lens already runs for this repository, started from a
terminal. In that last case *Show that one here* opens the running one in the tab instead
of starting a second; your agent's answers go to whichever lens started last.

### Settings

Summary and Ask need your agent to run `lens` in a terminal. Settings → Agent installs
what that takes, and removes it again:

- **The lens command**: a small launcher on your PATH that runs the app's own copy of
  the CLI. On macOS it goes into a folder terminals already look in (`/usr/local/bin`,
  Homebrew's, or `~/.local/bin`); on Windows the app adds its own folder to your PATH.
- **Agent skills**: `/lens-review`, `/lens-build-review` and `/lens-ask`, copied into
  `~/.claude/skills`.

The command points at where the app is. After moving the app's folder, Settings says so:
install the command again from there.

Uninstall removes only what the app installed. A `lens` command or a skill folder that
came from somewhere else, such as this checkout's `npm run install-cli`, is shown as
*Not the app's* and never touched.

### What the app may do

A review shows code you didn't write, so the viewer is treated like a web page:

- It runs sandboxed and gets no bridge to the app: all it can talk to is its own local
  server, as in a browser.
- It is held to its own address. It can't navigate away, open windows, download, or be
  granted any permission except copying to the clipboard.
- Reviews keep their cookies and storage in a profile apart from the app's own screens.
- The app's own screens load only the app's files, under a Content-Security-Policy, and
  reach the main process through a fixed list of calls whose arguments are checked. A
  review is a typed choice that the main process turns into arguments itself.
- The command is started without a shell, so nothing typed into the picker is
  interpreted by one. What you type under *Custom* has the power it has after
  `lens diff` in your terminal, no more.

## The viewer

### Folds

Folds collapse into one-line pills that quote what they hide
(`1 guard → return DEFAULTS + log`). Every pill is one click from the real code. In diff
mode a `●` marks pills that contain changed lines.

### Reading a diff

Diff mode shows every text file the diff touched. Unsupported types (json, md, yaml, …)
get change markers and syntax colors, just no folding.

| setting | key | default | what it does |
| --- | --- | --- | --- |
| Hunks only | `h` | on | Shows just the changes with 3 lines of context, PR-style. Click a `⋯` row to show what it hides. |
| Removed lines | `x` | on | Removed lines show inline, struck through, where they were deleted. |
| Word diff | `d` | off | Marks the words a replaced line changed on both sides, so a one-character fix stands out. |
| Hide tests | `t` | on | Opening a test file anyway (a tab, a search hit, an Ask cite) turns it off for that page. |

Each file shows its status as a colored letter in the tree and on its tab: `A` added,
`M` modified, `D` deleted, `R` renamed (pure renames show as `R` rows), `⊘` excluded.
Lockfiles and minified files (`exclude`) are listed as dimmed `⊘` rows without being
read. The code card's header spells the status out, next to the file's path, the lines
it added and removed, and its fold chips. The Summary tab shows a change's code in the
same card.

### Finding your way

- **Search**: ⌘P (Ctrl+P) searches across all loaded files. ⌥-click an identifier to
  find its usages. When a loaded file declares the name (a top-level function, class,
  const, type or enum, or a class member), *Defined at* lists that first. It matches by
  name only, as a text search would: no types, no imports followed.
- **The ruler** beside the code shows where the changes (green), removed lines (orange)
  and, on the Summary tab, open concerns sit in the rows on screen. Click a tick to jump
  there; a folded change opens.
- **Jumps** (a search hit, a ruler tick, a cite) flash the line they land on, and leave
  it marked with an accent bar and line number until the next jump.

### Keeping track

- **Viewed marks**: tick a file in the tree (or press `m`) once you've read it. It dims,
  and the ring above the tree counts the files viewed.
- **The pill under the code** marks the open file viewed and opens the next one not
  viewed yet (*Viewed · next file*). *Prev* goes back. Both stop at the first and the
  last file of the tree instead of wrapping around (so do j/k), and the same goes for
  the Summary's changes.
- Marks live in the browser and clear themselves when the file's content changes.
  Summary changes have their own marks.

### The header and the ⋯ menu

The header keeps four buttons in sight: search, Ask, the code theme and reload.
Everything else is in the **⋯** menu: the code size, the fold level, expand / collapse all,
hunks only, removed lines, word diff and hide tests (each with its key), then the keyboard
shortcuts, the settings and *End session*.

- **Reload** (`r`) re-runs the analysis (new file contents, a fresh `git diff`, edits to
  `.lens.json`) without restarting the server.
- **Code size** in ⋯ makes the code larger or smaller, from 10 to 24px, in both the Code
  and the Summary view. The default is 12px, and the menu says so beside the setting's name. Only the code
  changes size, not the page around it. Your size is kept for every repository you open.
- **Settings** in ⋯ shows the effective config.
- **Ask** (`a`) opens a rail on the right where you ask your agent about the code you're
  reading. See [Ask mode](#ask-mode).

### The code theme

The theme colors the whole page, not just the code: the panels, lines and text are mixed
from the theme's background and foreground, and the accent is the color the theme gives
function names. A light theme turns the page light.

The theme you pick in the menu is remembered (in a cookie, so it holds on any `--port`),
and the viewer opens in it from then on. It goes before the config's `theme`; `--theme`
goes before both.

### The status bar

The bar along the bottom always says where lens stands.

On the left, one status:

- *Ready*;
- what's running, once it has run a moment (*Applying dracula…*, *Re-running the
  analysis…*);
- what a reload did (*Refreshed · 3 files changed*);
- a failure, with the server's reason, which stays until you dismiss it or start
  something else;
- *Waiting for your agent*, or *No agent for your question* when none is there to answer
  it;
- *Server stopped*, when a request can't reach lens anymore (*Retry* looks for it again).

On the right, notices that show only while they apply: code that changed on disk since
this page read it (click to reload), summaries the code has outgrown, a new summary
waiting (click to load it), an agent listening.

lens looks for the first and the third by itself, every 5 seconds while the page is in
sight: an edit, a `git add`, a commit or a new file shows as *Code changed on disk*
without a click. Nothing on screen moves until you reload. A PR review has no such
notice: a PR changes only when it is fetched, which reload does.

### Keys

`?` lists them in the viewer.

| key | everywhere |
| --- | --- |
| `⌘P` / `Ctrl P` | search in files |
| `v` | switch Code / Summary (diff mode) |
| `s` | toggle the sidebar |
| `e` / `c` | expand / collapse all folds of the open file or change |
| `[` / `]` | fold threshold down / up |
| `h` `x` `d` | hunks only, removed lines, word diff (diff mode) |
| `t` | hide tests |
| `r` | refresh the analysis |
| `a` | ask your agent about the open change (and your selection) |
| `\` | show / hide the Ask rail |
| `Esc` | close dialogs, clear the filter, leave the Ask input |

| key | Code tab | Summary tab |
| --- | --- | --- |
| `j` / `k` | next / previous file | next / previous change |
| `m` | mark the file as viewed | mark the change as viewed |
| `/` | focus the file filter | filter the changes |
| `o` | keep the preview tab open (pin it) | open the change in the code view |
| `w` | close the active tab | |
| `g` | | the overview |
| `⌥ click` | find usages of the clicked identifier | |

## Summary mode

In diff and PR mode the viewer has two tabs: **Code** (the default) and **Summary**.
The Summary tab shows one changed unit at a time: a function, component, hook, method,
type, and so on.

### What a unit shows

- **A headline**, one line.
- **Concerns**: the agent's possible bugs, risks and questions. Each sits on the line
  it's about and is repeated as a note under that line in the code. You mark each one
  *real* or *dismiss* it.
- **What behaves differently**, as scenarios: *when* …, with the old result struck out
  and the new one below, each linked to the line that causes it.
- **Callers** outside the diff it may break. Click one to peek at the call.
- **The unit's code**, with the usual folds and removed lines.

Deleted files are left out: there's nothing in them to read (the Code view's tree still
lists them).

### The overview

The tab opens on the **overview** (<kbd>g</kbd>): what the agent flagged (click a count
to list just those changes) and its account of the whole diff.

Before anything is summarized, the overview shows the command to run in your agent in
that place, and the changes can already be read one by one (*Start review*, or the list).

*Start review* opens the first change. From there the pill under the code marks each
change reviewed and opens the next (*Reviewed · next change*), and the ring above the
list counts how far you got.

### Flows and flags

The list on the left is organized by **flows**: one story each (a feature end to end, a
fix and the places it touches), listed by name like chapters. The agent ranks them from
P1 (review first) to P3 (mechanical). The ranking only sets their order, and P3 flows
start folded until you open them.

A unit is **flagged** only for a reason on record, each with its own mark:

| mark | reason |
| --- | --- |
| ⚠ | possible bug |
| ! | risk |
| ? | question |
| ↗ | may break callers |

Dismissed concerns don't count. Chips at the top of the list filter by these marks, and
a *dismissed* chip lists the changes whose concerns you dismissed. Your verdicts don't
reorder the list, and the change you're on stays listed under a filter.

### Getting a summary written

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

Any agent with a shell can follow `prepare`'s printed instructions; the skill is only a
thin pointer to them.

- **Big diffs** are split into several task files. Once every part is submitted, running
  `prepare` again asks for a **final pass**: flows and the overview, written from every
  unit's summary at once, so flows can span the whole diff. `submit` reports how many
  units the flows cover and which units with a concern or break are in none.
- **After a submit**, the Summary tab shows a dot when you return to the viewer (or
  press reload, `r`).
- **Commands are copyable**: wherever the viewer tells you to run one (`/lens-review …`,
  `/lens-ask`), click it to copy it.
- **Nothing to add to your repo**: `.lens/` carries its own `*` `.gitignore`, and nothing
  is written into `.git`.

### As the review step of a plan → build workflow

`/lens-build-review [base-commit] [plan-file]` has the agent do everything:

1. pick the build's diff (making new files visible with `git add --intent-to-add`),
2. let a fresh subagent write and submit the summary, flagging changes the plan didn't
   ask for,
3. open the viewer on the Summary tab,
4. point you at the units that need a look.

### What lens checks

Units are found deterministically (tree-sitter, old and new side of every changed file),
and every changed or removed line belongs to exactly one unit.

`submit` drops, with a reason, any claim that doesn't point at real code:

- a table row must cite one of the unit's changed (`N18`) or removed (`O16`) lines;
- a caller must be a `path:line` that exists and mentions the unit;
- flows need 2+ known units;
- text over the length limits is rejected.

Summaries remember the unit's hash. When the code changes, the unit shows "code changed
— re-run", and the next `prepare` only asks about units that changed. The overview
remembers the whole diff the same way; when only it is out of date, `prepare` asks for
just the overview.

## Ask mode

Press `a` (or the **Ask** button) to open a rail on the right and ask your agent about
the code while you review: "why is this check needed?", "what calls this?".

### What a question carries

- **The change you have open**: the Summary tab's unit, or the Code tab's file.
- **The code you have selected**, if any. Select across removed and added lines to send
  both sides. The selection stays while you type; a plain click in the code drops it.
- **The unit's open concerns** (the ones you haven't dismissed), for a question about a
  unit, so "is this risk real?" needs no retelling. A chip next to the unit's name says
  how many go along.

### The chat

- There is one chat for the whole lens session. Moving to another change, flow, file or
  tab keeps it, and each question is labeled with the change it was about (click the
  label to go back).
- Answers cite code as `path:line`. lens checks each one, and a valid cite flashes that
  line when clicked.
- After a reload, questions whose code changed are dimmed and their cites stop linking.
- The chat lives in the running viewer and ends with it.
- Drag the rail's edge to resize it; `\` hides it, `Esc` leaves the input.

### Getting answers

Answers come from your own agent, the same way summaries do:

```bash
# in your agent (Claude Code: after npm run install-skill)
/lens-ask
```

which loops on

```bash
lens ask listen                # waits for the next question, prints it with the rules
lens ask reply q3 answer.md    # posts the answer (a file, or - for stdin)
```

`listen` finds the viewer through `.lens/server.json` (pass `--port` if you started it
on another port). The agent is told to **only read and answer**, never to edit files or
run commands that change the repo, and to answer from a read-only subagent when it has
one.

- **With no agent listening**, the button turns into **Copy as prompt**: the question,
  file, lines and code as markdown, ready for any chat.
- **A question whose agent went away** says so instead of counting the wait: run
  `/lens-ask` again and the new agent gets it at once.
- An agent counts as there while it listens, for 30 seconds after, and for up to 5
  minutes while it answers a question it took.

## How folding works

```
file | directory | git diff → parse (tree-sitter: ts, tsx, js) → classify + score ← .lens.json → viewer
```

Each region gets a category and a score (0–3); it folds when score ≤ threshold. The
viewer's slider switches the threshold live.

| threshold | what folds |
| --------- | ---------- |
| off (-1)  | nothing: the plain file |
| 0         | zero-signal scaffolding: imports, comments, barrel files |
| 1         | **default**: also guards, logging, telemetry, log-and-rethrow catches, accessors, constant data |
| 2–3       | nothing extra by default: headroom for categories you score 2–3 |
| —         | score 4 never folds: TODO/FIXME comments (and any region holding one) and `lens:keep` regions |

| category            | what folds (conservatively) |
| ------------------- | --------------------------- |
| `import`            | contiguous imports and `export … from` re-exports |
| `comment`           | whole-line comments and doc blocks. Work markers and suppressions (`eslint-disable`, `@ts-ignore`, …) stay visible |
| `guard`             | an else-less `if` whose body only exits (throw/return/continue/break), optionally with a log line |
| `logging`           | `console.*` / `logger.*` calls whose result is unused and whose arguments do no work (no `await`, `=`, `++`) |
| `telemetry`         | fire-and-forget `metrics.*` / `telemetry.*` / `analytics.*` calls |
| `error-boilerplate` | catch blocks that only log and/or rethrow |
| `accessor`          | getters/setters that only return or store a value, and one-statement delegation methods |
| `barrel`            | files that are only imports and re-exports fold to one pill (it names side-effect imports: `; runs polyfills`) |
| `data`              | pure-literal constants: lookup maps, option objects, literal enums, runs of one-liner consts (3+ lines) |

Guards fold regardless of what they return. Judging whether a guard hides a bug is the
reviewer's job, and the pill quotes the exit so nothing is invisible. An `if` whose body
does real work is never a guard.

## Configuration

lens's own rules are [lens.defaults.json](lens.defaults.json). A `.lens.json` in your
project (the nearest one walking upward) merges over it: **scalars override, maps merge,
lists extend**. `"base": false` makes your file the whole rule set instead. To go back
to the defaults, delete (or rename) your `.lens.json`.

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
| `theme` | `"vesper"` | Shiki theme the viewer starts in, until you pick one in its theme menu; `--theme` overrides both per run |
| `categories` | all `true` | per-category switch; `false` never folds it |
| `scores` | 0 for import/comment/barrel, 1 otherwise | importance per category, 0–3 (4 is reserved for never-fold) |
| `callPatterns` | logging, telemetry | fire-and-forget calls to fold, see below |
| `keepCommentMarkers` | TODO, FIXME, HACK, XXX, lint/type/format suppressions, `@ts-check`, `/// <reference` | comments containing these never fold, nor does a region holding one |
| `keepDirective` | `"lens:keep"` | a region containing it, or right below it, never folds |
| `testFilePatterns` | `*.spec.*`, `*.test.*`, `__tests__/**` | what the viewer's **hide tests** toggle hides, and which files summary mode treats as tests |
| `exclude` | lockfiles, `*.min.js`, `*.min.css`, `*.map` | diff mode lists these as `⊘` without reading them; directory walks skip them (a file passed explicitly is always analyzed) |

### Path patterns

- `*` matches within a segment, `**` across segments.
- `**/` also matches no directory: `src/**/x.ts` matches `src/x.ts`.
- A pattern matches anywhere in the path: `*.min.js` matches `dist/app.min.js`.

### `callPatterns`

These fold expression statements `<receiver>.<method>(...)` whose result is unused:

- `category`: built-in or new. A new name gets its own pill label and chip.
- `receivers`: matched against the receiver's trailing segment, so `logger` matches
  `this.logger.info(…)`. `*` is a wildcard (`*Logger` matches `requestLogger`).
- `methods`: optional. Omit to match any method.
- `score`: optional. Defaults to `scores[category]`, then 1.

Calls matched by a pattern also count as noise inside guards and catch blocks, so
`if (!x) { logger.warn("no x"); return null; }` still folds as a guard.

### `keepDirective`

The per-site escape hatch:

```ts
// lens:keep — this guard was buggy last week, always show it
if (!input) {
  throw new Error("input required");
}
```

## Development

```bash
npm test            # typecheck + node --test
npm run app         # the desktop app, from this checkout
npm run app:smoke   # the app's own tour of itself: pictures of each screen in dist/smoke
```

- The sources are three folders under `src/`: `cli-app/` (the `lens` command and the
  viewer's server), `viewer/` (the page it serves) and `desktop/` (the desktop app).
- Classifier rules live in `src/cli-app/classify/typescript.ts` (shared by ts/tsx/js).
- The viewer is `src/viewer/`, a React app (TypeScript), which the server
  (`src/cli-app/render/web/`) bundles with esbuild when it starts and inlines into one
  page, `viewer.html`. There's no build step. `tsconfig.viewer.json` type-checks it as part of
  `npm test`.
- Fixture-driven tests are the main defense against a fold hiding a real bug: a rule
  change that suddenly folds more fails loudly.
- The desktop app is `src/desktop/`: an Electron shell that holds no lens logic. It runs the
  CLI's sources with its own Node, so the app and the command are always the same code.
  Electron Forge builds, starts and packs it (`forge.config.ts`); add `--packed` to
  `app:smoke` to tour the packed app.

## Non-goals

- **No AI calls.** Summary and ask mode hand the writing to your own agent.
- **No semantic analysis or type checking.**
- **No editing.** lens is read-only.
- **No terminal output.** The viewer is the only interface (plus `--json` for debugging).
