# lens — notes for Claude

- Don't use Claude's memory feature for this project. Durable guidance goes in this file.
- [README.md](README.md) is for users and stays as short as it can: what lens does, install, use, the commands, the config fields. No internals, walkthroughs or keys (`?` lists them). Update it in the same change as a command, flag, major feature, fold category or config field.

## Running and testing

- Bun (>= 1.4) runs the `.ts` sources directly; there is no build step. `bun run lens …` runs the live source; `--no-open` skips the browser, `--json` dumps the fold model. The only Node is Electron's own.
- `bun run test` runs the three typechecks (`tsconfig.json`: `src/cli-app/` and tests; `tsconfig.viewer.json`: `src/viewer/`, `src/ui/` and their page tests; `tsconfig.desktop.json`: `src/desktop/`) and then `bun test --isolate test/`. Run it before calling a change done; plain `bun test` skips the typechecks. Tests import from `bun:test`.
- Rules a reading of the sources can check are tests: `test/layers.test.ts` (imports between folders), `test/tokens.test.ts` (design scales), `test/rules.test.ts` (the rest). A new rule of that kind goes there, not only here.
- **Prettier formats all code** (`.prettierrc`: 2 spaces, single quotes, 120 columns, `endOfLine: auto` for Windows' CRLF). `bun run format`; `bun run test` fails on unformatted code.
- **Timings** (Settings → Debug, or `"timings": true`): every step's time goes to `~/.lens/timings.jsonl`, one file for the machine, each run starting with a line about the machine; `bun run lens timings` (`--repo <name>`, `--json`) reads it. The file is what the user hands over to have speed looked at. A new step worth watching is a `timed(...)` (`src/cli-app/timings.ts`) or `measure(...)` (the viewer's `actions/timings.ts`).
- Desktop app: `bun run app` (from the checkout; Settings → Sandbox shows every primitive), `bun run app:smoke` (scripted tour, see Desktop app), `bun run app:dist` (packs into `release/`). Package scripts stay shell-free (`bun …`, `&&` at most) so they run on Windows.
- `bun run compile` makes `dist/lens/lens`, what the packed app runs. Anything the CLI reads at run time is imported, never read from a path beside the sources: `lens.defaults.json` and `package.json` as JSON, `viewer.html` as text, the tree-sitter wasm as files, the viewer as `lens:viewer-bundle` (`VIEWER_MODULE` in `bundle.ts`). `test/compile.test.ts` runs the compiled lens far from the checkout.
- Releases: release-please (`.github/workflows/macos-app.yml`) bumps the version and `CHANGELOG.md` from conventional commits (`fix:` patch, `feat:` minor) and attaches `Lens.app` to the release. Never bump the version by hand; keep commit prefixes and PR titles conventional (PRs are squash-merged). A build change goes in the scripts or `forge.config.ts`, not the workflow.

## Code rules (everywhere)

- **Comments** say what the code can't: why, an invariant, a constraint or workaround, a unit or format (`N<line>` / `O<line>`, 1-based), what `null` means, who relies on it. Never what the name, type or next line says. Fix or delete comments a change makes wrong.
- **Paths** that lens shows, matches patterns against or puts in unit ids are `/`-separated: build them with `relPath` / `toPosix` (`src/cli-app/paths.ts`), never `path.relative` / `path.join` directly (Windows' `\` silently breaks `exclude`, `testFilePatterns` and unit ids). `test/rules.test.ts` keeps `relative` out of every file but `paths.ts`.
- **TypeScript**: `erasableSyntaxOnly` (no enums, namespaces or parameter properties), imports carry `.ts`, type-only imports use `import type`, `strict` and `noUnused*` everywhere.

## Layout

```
src/cli-app/   the `lens` command: analysis, git, summary/ask/plan modes, the viewer's server
src/ui/        shared by every page: design tokens, primitives, the polling loop, the sandbox
src/viewer/    the React page the server bundles and serves
src/desktop/   the Electron app: runs the command and shows its viewer
```

`src/viewer/` and `src/desktop/` import from `src/ui/` and `src/cli-app/` (types and pure helpers), never from each other. `src/ui/` and `src/cli-app/` import from none of them (the CLI only bundles the viewer's entry). `test/layers.test.ts` holds this; a new folder under `src/` gets its rule there.

## Folding rules (`src/cli-app/classify/`)

- Rule *data* lives in `lens.defaults.json`; the structural analysis in `classify/typescript.ts` (ts, tsx and js). Overlaps are decided by `CATEGORY_PRIORITY`.
- A new built-in category needs a color in `CAT_COLORS` (`src/viewer/shared.ts`) and its name in the README's `folds` row.
- A new config field is checked in `parse` (`config.ts`), which reports a bad value as a `ConfigProblem` and skips it, and gets a README row. Problems never stop lens: the CLI prints them, the payload carries them, the status bar opens Settings on them.
- **Be conservative**: folding a line that matters is the failure lens exists to avoid. Every rule change gets a test in `test/classify.test.ts` asserting exact line ranges and pill text.

## Viewer (`src/viewer/`)

- `render/web/bundle.ts` bundles the viewer with `Bun.build` and Tailwind when the server starts; `server.ts` inlines it into `viewer.html` with the payload in the `lens-data` script (`INITIAL_DATA` in `shared.ts`).
- State: one immutable `LensState` in `store.ts`, read with `useLens(selector)`. `model/` derives what's shown (pure functions), `actions/` changes state (one file per area), `ask/` is the Ask rail's logic. Use `commit()` instead of `update()` when the DOM must show the new state before you touch it.
- **Polling** is `src/ui/poll.ts`'s one loop (pauses while hidden, never runs a watcher twice at once). A new poll is a `Watcher` registered with `watch()` in `main.tsx`, with no timer of its own. Something new for the page to notice is a field of `/api/stamp`'s answer, not another request.
- **Page tests** (`test/viewer-page.<area>.test.ts`, harness `test/fixtures/viewerPage.ts`) run the real bundle in happy-dom on a real fixture repo (`viewerRepo.ts`) with `fetch` stubbed. A behavior change gets a test there, asserting what the reader sees (`data-part`s, `data-*` state, rows). `settle()` after each action.
- Rows are memoized and their highlighted lines are prebuilt HTML, so a toggle re-renders only the rows it changes. Keep it that way. Browser code imports server types with `import type`.
- **The API is a contract** (`src/cli-app/api/contract.ts`): each route (`'POST /api/notes/:id'`) with its body and answer. The server registers it with `router.json(route, parse, run)`, the page calls `api(route, …)`. A new endpoint starts there; wire types live there. `test/api.test.ts` checks both sides; `test/payload.test.ts` snapshots the payload's shape (`--update-snapshots` to rewrite). Only non-JSON is `router.raw`.
- **Never stale code**: each analysis has an id and the viewer applies tokens only for its own (the code is drawn from the tokens' text). A refresh reuses tokens, folds and units only when path, text (and diff, and config) are unchanged, compared whole, never by hash or time. Blobs are read fresh every analysis; one that doesn't come back whole is an error.
- **The status bar** says whether something runs or failed, so everything that talks to the server goes through `actions/status.ts`: `api` / `request` / `reach`, never bare `fetch` (except shutdown; `test/rules.test.ts`). Wrap slow work in `tracked({ id, label, failed }, work)`; wait on it with `isBusy`; report with `noteDone`; don't catch an error only to log it. What the bar shows comes from `STATUS_SOURCES` and `NOTICE_SOURCES` in `model/status.ts`; a new kind is a new source there. A notice must be true while shown.
- **Storage**: the browser keeps nothing (no `localStorage`/`sessionStorage`/IndexedDB; `test/rules.test.ts`). Per review (key `reviewKey`, as summaries): viewed marks and verdicts in `.lens/marks/`, notes in `.lens/notes/`, served in the payload; a change updates state, then posts the one change. Per machine: view settings in `~/.lens/settings.json` (`view`, posted as diffs to `/api/view`; `LENS_HOME` moves the folder, and `test/fixtures/home.ts` points tests at a temp one). Cookies, read by the server so the page arrives right: `lens-theme` (also painted on `<html>` by `renderPage`), `lens-code-size` (`--text-code`), `lens-ui-zoom` (CSS `zoom` + `--ui-zoom`).

### Design system (`src/ui/`)

- **New UI follows it.** Before designing or mocking, read `styles/tokens.css` and the primitives, look at the sandbox, and match the nearest existing component. Mocks use the same tokens and primitives, in vesper and github-light. Don't invent colors, radii, shapes or tinted boxes; if something is really missing, add a token or primitive and say so.
- **Reuse a primitive** for anything clicked, picked, typed into or read as a label. Differ with a `className` (merged through `cn`) or a prop, never by copying its look. When nothing fits, ask before adding a primitive (what, where else, why none fits). A new primitive gets a sandbox section (`test/launcher-page.test.ts`).
- Primitives: `Button`, `IconButton`, `Field`, `TextArea`, `Select`, `Menu` (`MenuItem`, `MenuSwitch`, `MenuSection`, `MenuPanel`), `Segmented`, `Stepper`, `Tab` (`flat` for editor tabs; no `onClose`, no close button), `Tag`, `Disclosure`, `ListRow` / `listRow()`, `Chip`, `Choice` / `ChoiceList`, `Tip` / `tipAttrs`, `HoverCard`, `TopBar`, `Brand`, `Swatch`, `ThemeMenu`, `StatusBar`, `Kbd`, `Spinner`, `FileStatus`, `ProgressRing`, `CopyCommand`, `Skeleton`, `ReviewSkeleton`, `ErrorBoundary`. Helpers in `styles/base.css`: `.dot` (`.pulse` for live), `.eyebrow`, `.empty`, `.no-match`, `.cite`, `.sig-*` / `.k-*`; a new one only for generated HTML or many readers.
- **Styling is Tailwind v4** utilities in `className`; `clsx` for conditions. Four stylesheets exist (`tokens.css`, `tailwind.css`, `base.css`, `CodeRows/style.css`); a new one is the rare case and joins the list in `test/tokens.test.ts`.
- **Hooks aren't classes**: tests and code find elements by `data-part`, state is `data-*`. A primitive puts its `data-part` before `{...props}`. Exceptions: the code rows' classes and `base.css` helpers.
- **Tokens**: components use semantic tokens (`--bg`, `--surface`, `--text`, `--muted`, `--line`, `--accent`, the diff and signal colors), mixed from the code theme's colors, with a light set under `data-appearance='light'`. Never raw colors. The scales are closed and `test/tokens.test.ts` fails a step outside them: type `text-2xs`…`text-2xl` + `text-code`; space is a 4px grid (`p-3` is the token's step; 2, 6, 10px aren't allowed); radius `rounded-xs`…`rounded-full`; control heights `h-control-xs` 22 / `-sm` 26 / `h-control` 30 / `-lg` 36; elevation `shadow-1` (card, tooltip), `-2` (menu), `-3` (dialog); layers `z-(--z-sticky|float|tip)`; tints `--tint*` over transparent (`--tone` + `bg-tone-tint`, `border-tone-line`). Small-caps labels are `.eyebrow`.
- **Window size** is `--screen-w` / `--screen-h`, never `vw`/`vh`/`w-screen` (the UI zoom zooms those). A screen length set as a style or `scrollTop` goes through `cssPx` (`src/ui/zoom.ts`).
- **Motion** is short and only for what just changed (never what the page arrives with). Timings come from `--motion*` tokens. CSS where it can (transitions, `starting:` for popovers and dialogs); otherwise `src/ui/motion.ts` (ref callbacks `riseIn`/`fadeIn`/`widenIn`, or after `commit()`: `slideIn`, `growOpen`, `pop`, `crossFade`; exits `slideOut`, `growClosed`, `narrowOut`, cancelled by `stay`). Never animate code rows.
- **One highlight color**: the theme's accent. Selected is `--selected-bg` / `--selected-ring`; the picked option of a switch or segmented control and primary buttons are solid `--accent`. Hover is `--hover-bg` (never `--surface-2`), and never replaces a selected look. Never invert `--text` for selection. Green, red and signal colors keep their meaning. Exceptions: a `flat` `Tab` in front is the editor's surface with an accent top line; a pressed Real verdict is solid `--add`.
- **Skeletons** only for what isn't there yet; what's on screen stays while it reloads. Waits under 150 ms show nothing (`animate-[wait-hidden_150ms]`).
- **Tooltips** are lens's own (`tipAttrs`, shown by `tooltip.tsx`; each page calls `installTooltips()`), never a native `title` except on frames (`test/rules.test.ts`). An `IconButton` with a `shortcut` gets one. Otherwise only for text that's cut off (`{ cut: true }`) or that adds something; never one that repeats what's shown.

### Viewer code rules

- **Shared state in Zustand, a component's own in `useState`.** Remount with a `key` to reset. Scroll positions and other state that shouldn't re-render go in `scrollStore`. No state in module-level `let`s or `Map`s (resources and caches are fine).
- **Selectors** pick a slice; they may return state values or a memoized `model/` result, never build new objects or arrays.
- **Avoid `useEffect` / `useLayoutEffect`**: put the work in the action, a handler, a `key`, a ref callback or a store subscription in `main.tsx`. When none fits, comment why right above it (`test/rules.test.ts`).
- Names are camelCase and say what they hold (`unit`, not `u`). Icons are `lucide-react` with a `size` (`SignalIcon` for signals). Dialogs keep their own open state (`showModal()`, native close).
- **Files**: a one-file component is `Name.tsx`, never `Name/index.tsx` alone (`test/rules.test.ts`). Past ~150 lines, split into a `Name/` folder (`index.tsx`, `const.ts`, `util.ts`, `hooks.ts`, `types.ts`, `Sub.tsx`). Shared components sit directly in `components/`. No React context today; if ever needed, provider and context in separate files.

## The Summary view extends the Code view

The Summary tab shows the same code as the Code view, under the agent's summary. A change to how code is shown (folds, fold chips, fold level, expand/collapse, removed lines, hide tests, their keys) works on the Summary tab's unit code in the same change. The one exception: hunks only (a unit is already the code around its change).

- Both views get rows from `src/viewer/rows.ts` (`fileSpans` / `unitSpans` → `planCode`) and render with `CodeRows`, each with its own row marks. `rows.ts` and `wordDiff.ts` have no DOM; `test/viewer.test.ts` tests them.
- A new control changes state both views read (`openCats`) or gets a Summary branch (`listModel`). Share constants (`HUNK_CONTEXT`).
- New keys go in `keys.ts` (`SUMMARY_KEYS` for a unit) and in `KEY_GROUPS` (`KeysDialog/const.ts`); `test/rules.test.ts` fails an unlisted one.

## Summary mode (`src/cli-app/summary/`)

lens never calls an AI: the user's agent writes `result.json`, lens checks it.

- Pipeline: `collect.ts` → `units.ts` → `bundle.ts` (`prepare` writes `.lens/summary/<key>/`) → agent → `validate.ts` (`submit`) → `store.ts` → `view.ts` → the viewer.
- `prepare` does what lens can: housekeeping units' summaries (import- and formatting-only), and each unit's likely callers (`usages.ts`, one `git grep -w`).
- Summaries are written from the code on disk, so a branch diff needs that branch checked out (`checkoutFirst`); a PR is exempt. Don't read the code from git instead (tried, not worth it).
- **Invariant**: every changed and removed line belongs to exactly one unit (`checkCoverage`).
- `validate.ts` drops claims that don't point at real code, with a reason the agent can act on.
- The agent instructions are generated in `bundle.ts` (the source of truth); `skills/` only point at them.
- Changing the result's shape touches `RESULT_SCHEMA` and the instructions, `validate.ts`, `store.ts` types, `view.ts`, the viewer, and `test/summary.test.ts`. The stored format is `version: 1`.
- Summaries are keyed by unit hash (counted from the unit's anchor, so a move keeps it). `fit.ts` (`fitStored`) is the one place that decides whether a stored summary still fits; what cites lines without moving (previews, sequences, Ask questions) is keyed by `placedHash`.
- A run in progress shows where it got to (`summaryBuild`, `runGoing`); a stalled one says so (`buildStalled`).
- **Previews are untrusted HTML**: `previews.ts` rejects scripts, handlers and outside loads on submit, serves them under a CSP with only lens's nonce'd script, in a frame without `allow-same-origin`; the page hears only its height (`onPreviewMessage`). Keep all of that.
- Clear saved data lists kinds: a new kind on disk is an entry in `CLEAR_KINDS` (`clear.ts`), naming its own paths under `.lens/` (timings: `~/.lens/timings.jsonl`). Settings aren't data.
- Tests build real diffs with `git diff --no-index` and temp repos (helpers atop `test/summary.test.ts`), never hand-written diff text.

## Ask mode (`src/cli-app/ask/`)

- The viewer posts a question → `session.ts` holds the chat in memory → `lens ask listen` long-polls and prints it → `lens ask reply` posts the answer → `cites.ts` keeps the cites that resolve.
- The agent text and read-only rules are generated in `context.ts`; `skills/lens-ask` points at it.
- Context: the open unit or file, the selection, and the unit's open (undismissed) concerns and breaks. Nothing else from the summary.
- A question stores its unit's (or file's) hash; refresh marks it stale when that changes. `.lens/server.json` (port, pid) lets `lens ask` find the server.

## Plan mode (`src/cli-app/plan/`)

The Plan tab shows the user's Lavish plans; lens writes none.

- Behind `planTab` (on by default; the reader's switch overrides the config). Off, nothing of the tab shows.
- lens reads only Lavish's state file and `/health`, and runs only `lavish-axi <plan> --no-open` (`--reopen` only on the reader's click). These are Lavish's internals: read little, and fail to "not known", never to a wrong claim.
- `proxy.ts` frames Lavish from a second loopback port (`planPort` in `.lens/server.json`), forwarding only `admit`ted sessions' own paths, with a `frame-ancestors` naming only this viewer. Keep all of that.

## Desktop app (`src/desktop/`)

An Electron shell around the CLI. **It holds no lens logic**: it picks arguments, runs the same `lens` command, and shows its viewer in a tab. The CLI must keep working without it. `forge.config.ts` is the whole build, as Forge hooks; a new build step goes in a hook.

- **CLI and app stay in sync by construction**: from a checkout it runs `src/cli-app/cli.ts` with bun; packed, the same sources compiled (`compiledCli`). A new runtime dependency comes along by being imported (`bun run app:smoke -- --packed` checks).
- **`shared/choice.ts` is the only place that writes CLI arguments** (`test/app-choice.test.ts`). A new mode or flag that changes what is reviewed gets a picker control in the same change, unless it's meant to stay CLI-only.
- **What the app knows of a repository comes from `lens info --json`.** Git logic lives in `src/cli-app/`. The app reads only the ready line, the failure line `lens: <reason>` (`test/app-session.test.ts`) and `.lens/server.json`.
- **The viewer has no app-specific code.** The app only switches a viewer's theme by clicking `#theme-<name>` and hides `#theme-btn`; keep those ids.
- **Security (`security.ts`) is not optional**: the viewer is sandboxed, has no preload, stays on its origin, has its own partition. App pages are `lens-app://app` under a strict CSP. Every IPC call checks its sender (`isAppPage`) and arguments (`shared/ipc.ts`; `test/app-ipc.test.ts`); a repository must be one the app listed or the dialog returned; a review goes through `parseChoice`. Stored tabs are untrusted data, and no command line is ever stored or sent. The CLI is spawned with an argument list, never a shell.
- **Logic is tested without Electron**: `tab.ts`, `tabs.ts`, `tabKeys.ts`, `session.ts`, `store.ts`, `bounds.ts`, `setup.ts`, `ipc.ts` and `shared/` import nothing from `electron` (`test/app-*.test.ts`). `window.ts`, `themes.ts`, `security.ts`, `menu.ts` are glue; keep logic out. `bun run app:smoke` checks what only a real window shows and saves pictures to `dist/smoke`: run it after changing glue or packing, and say so first (it opens a window on the user's screen).
- The app's pages follow the design system and viewer code rules, and import nothing from `src/viewer/`. A page arrives in the theme (`themeAttributes`, and the view background reported by `chrome`).
- The app reopens as it was left (`store.ts`, `Tab.restore`), trusting none of it: a gone repository gets no tab, only the front tab starts its review.
- The picker polls `lens info` every 5 s while in sight (front tab only); don't shorten it without a cheaper read.
- Setup only removes what it installed (marker `lens-app-shim`, `.lens-app` in skill folders).
- Packing is Forge `package` with no makers (a folder, not an installer); don't add one unless asked. Nothing signs the app; leave the cookie-encryption fuse off (it prompts for the Keychain).

## Non-goals

lens never calls an AI, never edits code, and has no terminal UI (`--json` is for debugging). The desktop app adds none of these.

## Git

Conventional prefixes (`feat:`, `fix:`, `refactor:`, `chore:`). No `Co-Authored-By` or other Claude attribution. Work on `features/*` branches, merged to `main` through PRs. Never push or open PRs, and don't offer to: the user does that.
