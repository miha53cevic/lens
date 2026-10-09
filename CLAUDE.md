# lens — notes for Claude

- Don't use Claude's memory feature for this project. Durable guidance goes in this file.
- [README.md](README.md) is the user docs (CLI, viewer, summary mode, config). Update it in the same change as any user-visible behavior, flag, key or config field.

## Running and testing

- Node >= 23.6 runs the `.ts` sources directly (type stripping). There's no build step, and `npm run install-cli` links `lens` to the live source.
- `npm test` runs both typechecks (`tsconfig.json` for src/test, `tsconfig.viewer.json` for the viewer's browser code in `src/render/web/client/`) and then `node --test test/*.test.ts`. Run it before calling a change done.
- To see a change, run `node src/cli.ts diff` (or `<path>`, `pr N`) and open the viewer. Add `--no-open` to skip the browser and `--json` to dump the fold model.
- `install-skill` / `uninstall-skill` run `scripts/skills.ts`, which links each folder in `skills/` into `~/.claude/skills` (junctions on Windows). Keep npm scripts shell-free: npm runs them with cmd.exe on Windows, even from Git Bash.

## Paths (Windows too)

Paths that lens shows, matches config patterns against, or uses in unit ids are always `/`-separated, so the same code works on Windows. Build them with `relPath` / `toPosix` from `src/paths.ts`, never with `path.relative` or `path.join` directly. On Windows those return `\`, which silently breaks `exclude`, `testFilePatterns` and summary unit ids.

## TypeScript constraints

- `erasableSyntaxOnly`: no enums, namespaces or constructor parameter properties. Use union types and plain objects.
- Imports carry the `.ts` extension (`./config.ts`), and type-only imports use `import type` (`verbatimModuleSyntax`).
- `strict` and `noUnused*` are on for src and tests.

## Layout

```
cli.ts            arg parsing → analyze() → serveViewer(), or runSummary()
analyze.ts        paths | diff | pr → ViewerInput; re-run on ↻ refresh
git.ts, pr.ts     git diff parsing, PR refs via plain git fetch (no GitHub API)
config.ts         lens.defaults.json merged with the nearest .lens.json
parse/parser.ts   tree-sitter (wasm) for ts / tsx / js
classify/         fold rules → FoldRegion[] (model.ts has the shapes)
render/highlight.ts   Shiki tokens, computed server-side
render/web/       server.ts, bundle.ts + the viewer page and its client/ code (see below)
summary/          summary mode (see below)
ask/              ask mode: the viewer's Ask rail and `lens ask listen|reply` (see below)
```

### Folding rules

- The rule *data* (receivers, methods, scores, markers, patterns) lives in `lens.defaults.json`. The structural analysis lives in `src/classify/typescript.ts`, which is shared by the ts, tsx and js grammars.
- When regions overlap, `CATEGORY_PRIORITY` decides which one wins.
- A new built-in category also needs a color in `CAT_COLORS` (`client/shared.ts`) and rows in the README's category and config tables.
- Be conservative: folding a line that matters is the failure mode lens exists to avoid. Every rule change gets a test in `test/classify.test.ts`. Use the fixture (`test/fixtures/loadConfig.ts`) or inline sources, and assert exact line ranges and pill text.

### Viewer (`src/render/web/`)

- The viewer is a React app in `client/`, written in strict TypeScript (`main.tsx` is the entry). `bundle.ts` bundles it with esbuild when the server starts, so there's still no build step. `server.ts` inlines `viewer.css` and the bundle into `viewer.html` (a `#root` element and nothing else), and puts the payload in the `lens-data` JSON script, which `client/shared.ts` reads as `INITIAL_DATA`.
- State lives in `client/store.ts`: one immutable `LensState`, replaced on every change. Components read it with `useLens()`. `model.ts` derives what they show from it (the tree, the code plans, the summary list, the Ask context), as pure functions. `actions.ts` changes it. Use `commit()` instead of `update()` when the DOM must show the new state before you touch it, e.g. scrolling to a row.
- `components/` has one file per area: `Header` (top bar and toolbar), `Nav` (tree and summary list), `CodePane` (tabs and the file), `SummaryPane`, `AskRail`, `Dialogs` (settings, `?` help, search), and `CodeRows`, which both views use for code.
- Keep the markup and class names `viewer.css` expects. Rows are memoized and their highlighted lines are prebuilt HTML strings, so a toggle re-renders only the rows it changes. Keep it that way on big files.
- Browser code imports server-side types with `import type` (e.g. `ViewerPayload` from `server.ts`, `SummaryView` from `summary/view.ts`), so a shape change breaks the viewer's typecheck instead of the page.
- Server endpoints: `/api/tokens` (theme switch), `/api/refresh`, `/api/summary`, `/api/summary/stamp` (polled on window focus), `/api/shutdown`, and the Ask rail's `/api/ask*` (in `src/ask/routes.ts`).
- Browser-only state, such as viewed marks, lives in `localStorage`.

## Viewer: the Summary view extends the Code view

The Summary tab shows the same code snippets as the Code view, with the agent's summary on top. Anything added to or changed in the Code view that affects how code is shown must also work on the Summary tab's unit code, in the same change. That covers folds, fold chips, the fold level, expand/collapse, hunks only, removed lines, hide tests, and their keyboard shortcuts.

- The toolbar stays visible on the Summary tab. Its controls change state, and both views render from that state: `foldScope` and `chipCategories` pick the open file's or the open unit's folds.
- Both views get their rows from `client/rows.ts`: `fileSpans` / `unitSpans` pick the shown lines and hidden stretches, and `planCode` turns them into lines, folds, removed lines and gaps. Both views render the plan with `CodeRows`, and each passes in its own row marks (cited lines, concern notes, the Ask selection). Change how code is shown there, and both views follow. `rows.ts` has no DOM, so `test/viewer.test.ts` tests it in node.
- A new control should change state both views read (e.g. `openCats` for the fold chips) or get a Summary branch (e.g. `unitSpans` for hunks only, `listModel` for hide tests).
- Share constants between the views instead of duplicating them (e.g. `HUNK_CONTEXT` in `client/rows.ts`).
- New keys go in `client/keys.ts` (and its `SUMMARY_KEYS` when they act on a unit), and in the `?` help (`KEYS` in `components/Dialogs.tsx`).

## Summary mode (`src/summary/`)

lens never calls an AI. The user's agent writes `result.json`, and lens checks it.

- Pipeline: `collect.ts` (load the diff) → `units.ts` (split it into units) → `bundle.ts` (`prepare` writes `.lens/summary/<key>/`) → agent → `validate.ts` (`submit`) → `store.ts` (`summary.json`) → `view.ts` (`SummaryView` for the viewer) → `client/model.ts` and `components/SummaryPane.tsx`.
- Invariant: every changed and removed line belongs to exactly one unit. `checkCoverage` enforces it, so keep it true when changing how units are found.
- `validate.ts` drops claims that don't point at real code and gives the agent a reason it can act on. A new kind of claim gets the same treatment.
- The agent instructions are generated in `bundle.ts` and are the source of truth. The skills in `skills/` are thin pointers to them, so put format and rule changes in `bundle.ts`, not in a skill.
- Changing the result's shape touches all of these: `RESULT_SCHEMA` and the instructions (`bundle.ts`), `validate.ts`, the types in `store.ts`, `view.ts`, the viewer (`client/model.ts`, `components/SummaryPane.tsx`), and `test/summary.test.ts`. The stored format is `version: 1`, and `readStored` ignores files of any other version.
- Summaries are keyed by unit hash, so a code change marks a unit stale instead of showing an outdated summary.
- Tests build real diffs with `git diff --no-index` and real temp repos (see the helpers at the top of `test/summary.test.ts` and `test/git.test.ts`). Follow that pattern rather than hand-writing diff text.

## Ask mode (`src/ask/`)

The Ask rail (`client/ask.ts`, `components/AskRail.tsx`) asks the user's agent about the open change. As in summary mode, lens never answers anything itself.

- Flow: the viewer posts a question (`routes.ts`) → `session.ts` holds the chat in memory, one per server → `lens ask listen` (`command.ts`) long-polls `/api/ask/next` and prints the agent text → `lens ask reply` posts the answer → `cites.ts` keeps the `path:line` cites that resolve.
- The agent text, including the read-only rules, is generated in `context.ts` and is the source of truth. `skills/lens-ask` only points at it.
- Context is the open change (the Summary tab's unit, or the Code tab's file) plus the user's current selection. Nothing else, such as summary items, goes along.
- A question stores its unit's hash (or the file's content hash). ↻ refresh marks it stale when that changes.
- The server writes `.lens/server.json` (port, pid) so `lens ask` can find it, and removes it on exit.

## Non-goals

lens never calls an AI, does no semantic analysis or type checking, never edits code, and has no terminal UI (`--json` is for debugging only). Don't add features that cross these lines.

## Git

Commits use conventional prefixes (`feat:`, `fix:`, `refactor:`, `chore:`). Don't add a `Co-Authored-By` trailer or any other Claude attribution to commits. Work goes on `features/*` branches and is merged to `main` through PRs.
