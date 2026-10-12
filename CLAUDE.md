# lens — notes for Claude

- Don't use Claude's memory feature for this project. Durable guidance goes in this file.
- [README.md](README.md) is the user docs (CLI, viewer, summary mode, config). Update it in the same change as any user-visible behavior, flag, key or config field.

## Running and testing

- Node >= 23.6 runs the `.ts` sources directly (type stripping). There's no build step, and `npm run install-cli` links `lens` to the live source.
- `npm run gallery` writes the design system's gallery to `dist/gallery.html`: every primitive of `src/ui/` and its states, with a switch between a dark and a light code theme. Open it in a browser.
- `npm test` runs the three typechecks (`tsconfig.json` for `src/cli-app/` and the tests, `tsconfig.viewer.json` for the browser code in `src/viewer/` and `src/ui/` and their page tests, `tsconfig.desktop.json` for the desktop app in `src/desktop/` and its page tests) and then `node --test test/*.test.ts`. Run it before calling a change done.
- To see a change, run `node src/cli-app/cli.ts diff` (or `<path>`, `pr N`) and open the viewer. Add `--no-open` to skip the browser and `--json` to dump the fold model.
- The desktop app: `npm run app` runs it from the checkout, `npm run app:smoke` runs its scripted tour (see "Desktop app" below), `npm run app:dist` packs it for this machine into `release/` (a folder with the app in it, not an installer).
- `install-skill` / `uninstall-skill` run `scripts/skills.ts`, which links each folder in `skills/` into `~/.claude/skills` (junctions on Windows). Keep npm scripts shell-free: npm runs them with cmd.exe on Windows, even from Git Bash.

## Paths (Windows too)

Paths that lens shows, matches config patterns against, or uses in unit ids are always `/`-separated, so the same code works on Windows. Build them with `relPath` / `toPosix` from `src/cli-app/paths.ts`, never with `path.relative` or `path.join` directly. On Windows those return `\`, which silently breaks `exclude`, `testFilePatterns` and summary unit ids.

## TypeScript constraints

- `erasableSyntaxOnly`: no enums, namespaces or constructor parameter properties. Use union types and plain objects.
- Imports carry the `.ts` extension (`./config.ts`), and type-only imports use `import type` (`verbatimModuleSyntax`).
- `strict` and `noUnused*` are on for all three source folders and the tests.

## Layout

The sources are four folders under `src/`, each with its own section below:

```
src/cli-app/      the `lens` command: analysis, git, summary and ask modes, and the viewer's server
src/ui/           what every page shares: the design tokens, the primitives, the polling loop, the gallery
src/viewer/       the viewer: the React page the server bundles and serves
src/desktop/      the desktop app: an Electron shell that runs the command and shows its viewer
```

`src/viewer/` and `src/desktop/` import from `src/ui/` and from `src/cli-app/` (types, and the pure helpers below), and not from each other. `src/ui/` imports from none of them: a primitive knows nothing of the viewer's store or of the app. `src/cli-app/` imports from none either: it only bundles the viewer's entry file. `test/layers.test.ts` holds these directions, and a new folder under `src/` gets its rule there. Build output goes to `dist/`, the packed app to `release/`; neither is checked in.

`src/cli-app/`:

```
cli.ts            arg parsing → analyze() → serveViewer(), or runSummary() / runAsk() / runInfo()
info.ts           `lens info`: what could be reviewed in a repository (the desktop app's picker reads it)
analyze.ts        paths | diff | pr → ViewerInput; re-run on ↻ refresh
git.ts, pr.ts     git diff parsing, PR refs via plain git fetch (no GitHub API)
config.ts         lens.defaults.json merged with the nearest .lens.json
glob.ts, text.ts, theme.ts   pure helpers (path patterns, truncate / plural / escapeHtml, the theme cookie's name / isLightColor); the viewer imports them too
parse/parser.ts   tree-sitter (wasm) for ts / tsx / js
parse/declarations.ts   the names a file declares, for search's "Defined at" (by name, no types)
classify/         fold rules → FoldRegion[] (model.ts has the shapes)
render/highlight.ts   Shiki tokens, computed server-side
render/web/       server.ts, bundle.ts and viewer.html: what serves the viewer (see below)
summary/          summary mode (see below)
ask/              ask mode: the viewer's Ask rail and `lens ask listen|reply` (see below)
```

### Folding rules

- The rule *data* (receivers, methods, scores, markers, patterns) lives in `lens.defaults.json`. The structural analysis lives in `src/cli-app/classify/typescript.ts`, which is shared by the ts, tsx and js grammars.
- When regions overlap, `CATEGORY_PRIORITY` decides which one wins.
- A new built-in category also needs a color in `CAT_COLORS` (`src/viewer/shared.ts`) and rows in the README's category and config tables.
- Be conservative: folding a line that matters is the failure mode lens exists to avoid. Every rule change gets a test in `test/classify.test.ts`. Use the fixture (`test/fixtures/loadConfig.ts`) or inline sources, and assert exact line ranges and pill text.

### Viewer (`src/viewer/`, served by `src/cli-app/render/web/`)

- The viewer is a React app in `src/viewer/`, written in strict TypeScript (`main.tsx` is the entry). `bundle.ts` (in `render/web/`, with `server.ts` and `viewer.html`) bundles it with esbuild when the server starts, so there's still no build step: one script, plus one stylesheet collected from the `.css` files the code imports. `server.ts` inlines both into `viewer.html` (a `#root` element and nothing else), and puts the payload in the `lens-data` JSON script, which `src/viewer/shared.ts` reads as `INITIAL_DATA`.
- Shared state lives in `src/viewer/store.ts`: one immutable `LensState`, replaced on every change. Components read it with `useLens(selector)`.
  - `model/` derives what the components show, as pure functions: `tree.ts`, `plans.ts` (folds, row plans and the fold chips' categories), `signals.ts`, `summaryList.ts`, `progress.ts` (files viewed, changes reviewed, what's next) and `askContext.ts`.
  - `actions/` changes the state, one file per area: `tabs`, `folds`, `views` (including `jumpToLine`), `summary`, `dialogs` (including search), `session`, `prefs` (the sidebar, the view settings and the viewed marks), `review` (the review pill) and `status` (what the status bar reports).
  - `ask/` is the Ask rail's logic: `rail.ts`, `selection.ts` and `answers.ts`.
  - Use `commit()` instead of `update()` when the DOM must show the new state before you touch it, e.g. scrolling to a row.
  - `src/ui/poll.ts` is the one loop for everything a page asks again and again: it stops while the page is hidden, runs what is due when the page is in sight again or its window gets the focus, and never runs a watcher twice at once. A new poll is a `Watcher` (an id, an interval, when it applies, what to run) registered with `watch()` in `main.tsx`, like `askWatcher` and `stampWatcher`; it keeps no timer of its own. `check(id)` runs one now. Something new for the page to notice is a field in `/api/stamp`'s answer, not another request. The launcher's pages use the same loop.
- `components/` holds one component or folder per area: `Header` (with its theme and ⋯ menus), `Nav` (the tree and the summary list, under a progress ring), `Tabs`, `CodePane`, `SummaryPane`, `ReviewPill`, `StatusBar`, `AskRail`, `SettingsDialog`, `KeysDialog` and `SearchDialog`. Pieces several areas use sit next to them: `CodeRows` (both views' code), `CodeCard` (the card around it, with its header: status, path, counts, fold chips; the same in both views), `OverviewRuler` (the ticks beside the code; `model/ruler.ts` places them by row), `FoldChips`, `ViewedBox`, `Resizer`, `SignalMarker` and `ModalHead`. `main.tsx` sets up the document-level listeners and store subscriptions.
- `test/viewer-page.test.ts` runs the real bundle in happy-dom (`@happy-dom/global-registrator`) on a real analysis of a fixture repo (`test/fixtures/viewerRepo.ts`), with `fetch` stubbed, and drives it with keys, clicks and typing (`@testing-library/dom`'s `fireEvent`). A change to how the viewer behaves gets a test there. Assert on what the reader sees: the rows, the tree, classes like `open` and `pinned`. `settle()` after each action lets React render.
- Keep the markup and class names the stylesheets and the page tests expect. Rows are memoized and their highlighted lines are prebuilt HTML strings, so a toggle re-renders only the rows it changes. Keep it that way on big files.
- Browser code imports server-side types with `import type` (e.g. `ViewerPayload` from `server.ts`, `SummaryView` from `summary/view.ts`), so a shape change breaks the viewer's typecheck instead of the page.
- Server endpoints: `/api/tokens` (theme switch), `/api/refresh`, `/api/summary`, `/api/stamp` (the summary's stamp and the change's fingerprint, polled while the page is in sight), `/api/shutdown`, and the Ask rail's `/api/ask*` (in `src/cli-app/ask/routes.ts`).
- The server never shows stale code and keeps little in memory. Each analysis has an id (`analysis` in the payload and in `/api/tokens`' answer), and the viewer applies tokens only for its own analysis: the code is drawn from the tokens' text, so tokens from another analysis would show the wrong code. `serveViewer` keeps one theme's tokens and one rendered page, not one per theme tried. A ↻ refresh reuses a file's tokens only when its path, language and whole text are unchanged (`highlightFiles`). Blobs are read fresh on every analysis, in batches (`readBlobs` in `git.ts`), and one that doesn't come back whole is an error.
- The status bar (`components/StatusBar/`, which draws with `ui/StatusBar`) is how the reader always knows whether something is running or went wrong, so anything that talks to the server reports to it, through `actions/status.ts`:
  - Fetch with `request` (throws the server's `{ error }` reason) or `reach` (any status comes back), never bare `fetch`: they notice a server that stopped. The one exception is the shutdown call.
  - Wrap a slow action in `tracked({ id, label, failed }, work)`: the bar says `label` while it runs (after 150 ms) and `failed` plus the reason if it throws. A control waits for its action with `isBusy(state, id)`. Say what it did with `noteDone`. Don't catch an error only to log it.
  - What the bar says is decided in `model/status.ts`, from two ordered lists of sources: `STATUS_SOURCES` (the one status on the left, strongest first) and `NOTICE_SOURCES` (the standing notices on the right, shown only while they apply). A new kind of status or notice is a new source there, plus its handler in `StatusBar/const.ts` if it has a button. The component itself doesn't change.
  - A notice must be true when it shows: if what it reports is only known while something polls, show it only then (see `agentListening`).
- Browser-only state, such as viewed marks, lives in `localStorage`. The picked theme is the exception: it's in the `lens-theme` cookie (`saveTheme` in `actions/session.ts`), which the server reads on the page request, so the page arrives in that theme instead of switching to it. `renderPage` (`server.ts`) also writes the theme's colors on `<html>`, for the paint before the script runs. The code's size (`codeSize.ts`, the ⋯ menu's stepper) is in a cookie too, `lens-code-size`: `localStorage` is per port, and the desktop app gives each repository its own. `main.tsx` writes it as `--text-code` on `<html>`, so both views follow; its default is the token's, and `test/tokens.test.ts` holds the two together.

### Design system (`src/ui/`)

- **New UI follows this design system.** Before designing or mocking anything (a component, a control, a state), read `src/ui/styles/tokens.css` and the primitives in `src/ui/`, look at the gallery (`npm run gallery`), and find the nearest existing component to match. A mock for review is built from the same tokens and primitives as the viewer, in a dark and a light code theme (vesper and github-light), so what is approved is what gets built. Don't invent a look: no new colors, radii, button shapes or tinted boxes when a token or primitive already covers it. If the system really lacks something, add it as a token or a primitive, and say so.
- `src/ui/styles/tokens.css` holds the design tokens. The inputs are the code theme's colors (`--code-bg`, `--code-fg`, `--theme-accent`, set by `main.tsx` from the payload) and the scales (type, space, radius, motion). The semantic tokens components use (`--bg`, `--surface`, `--text`, `--muted`, `--line`, `--accent`, `--danger`, the diff and signal colors) are mixed from those inputs, with a light set under `data-appearance='light'`. Components use semantic tokens and scales, never raw colors. The scales are closed, and `test/tokens.test.ts` fails a stylesheet that steps outside them:
  - **Type**: `--text-2xs` to `--text-2xl`, plus `--text-code` for the code itself. No `px` font size in a component.
  - **Space**: a strict 4px grid. Padding, margins and gaps are `0` or a `--space-*` step. A bigger on-grid number with no step (the 64px the review pill clears) is allowed; 2, 6 and 10 are not.
  - **Radius**: `--radius-xs` to `--radius-full` (which is also what a circle uses, not `50%`).
  - **Control heights**: `--control-h-xs` 22 (a chip), `-sm` 26, `--control-h` 30, `-lg` 36. A new control takes one of them.
  - **Elevation**: `--elev-1` (a card, a tooltip, the review pill), `--elev-2` (a menu), `--elev-3` (a dialog). `--shadow` is only their color.
  - **Layers**: `--z-sticky`, `--z-float`, `--z-tip`. **Motion**: `--motion`, `--motion-slow`, `--tip-delay`. **Tints**: a color at `--tint` or `--tint-strong` over transparent, for a badge or a note.

  The theme's accent is the design system's one highlight color: anything selected, open or picked uses it (`--selected-bg` / `--selected-ring` for a selected tab, row, pressed button or checked chip: there is no other "on" look, solid `--accent` on `--accent-fg` for the picked option of a switch or segmented control, and for primary buttons). What's under the pointer, when it needs a background, gets `--hover-bg`: a neutral tint that works on the page, a card, a menu or a selected pill, and never replaces a selected look. Don't use `--surface-2` for a hover: on a dark menu it is all but the menu's own color. A field being typed into takes `--field-focus` on its border. Never invert `--text` for a selected state. Green, red and the signal colors keep their meaning (added, removed, viewed, concerns) and aren't used for selection. Category colors stay in `CAT_COLORS`.
- The accent is the theme's function-name color, which `themeAccent` in `src/cli-app/render/highlight.ts` reads from the Shiki theme.
- `src/ui/` holds the primitives: `Button`, `IconButton` (`size='sm'` inside another control: a tab's close, a field's clear), `Field` (one line of text, with an icon and a clear button; sm / md / lg), `Menu` (a native popover, with `MenuItem`, `MenuSwitch`, `MenuSection`), `Segmented` (`size='lg'`, with icons or a badge, for what a whole screen switches on, like Code | Summary; `tabs` when each option shows a panel), `Stepper` (a value among many, one step at a time: the code's size), `Chip` (a toggle; with a `color` it gets a dot), `Tip` (the tooltip `Button` and `IconButton` show for a `shortcut`), `TopBar` (a page's bar along the top, with `TopBarDivider`), `Brand` (the name), `Swatch` (a code theme at a glance), `ThemeMenu` (the code-theme button and its list of themes; `ThemeTrigger` and `ThemeList` are its two halves, for a page that shows them apart, and `MenuPanel` is a `Menu` without its button), `StatusBar` (the bar along the bottom: the page passes the one status and the notices, the primitive draws them), `Kbd` (a shortcut as keycaps: `Ctrl P` is two), `FileStatus` (`StatusLetter`, `StatusBadge`), `ProgressRing` and `CopyCommand` (a command to run in the agent, which copies on click). Build controls from these instead of styling a new `button` or `input`. A primitive added to `ui/` gets a place in the gallery (`src/ui/gallery/`): `test/gallery-page.test.ts` fails without one. A small round mark is the `.dot` helper (`src/ui/styles/base.css`), colored with `--dot`.
- Tooltips are for teaching a key: an `IconButton` with a `shortcut` gets one (the action and its keycap), one without gets none. Don't add a native `title` that only repeats what a button says; keep `title` for text that's cut off (a long path) or that adds something (a flow's why).
- Every component imports its own stylesheet: `style.css` in a component folder, `Name.css` next to a one-file component. `src/ui/styles/base.css` is the reset, focus ring and shared helpers, and the viewer's `styles/signals.css` maps a signal class to its color. `src/ui/css.d.ts` lets the imports typecheck.

### Viewer code rules

- **Shared state goes in Zustand, a component's own state in `useState`.** State that several components read, or that actions, keys or `model/` use, belongs in `LensState` (`useLens` in `store.ts`), instead of being passed down through layers of props. State that only one component and its direct children use stays in that component with `useState`, like the Ask draft (`AskRail/Composer.tsx`), the overview's tab or a unit page's opened callers. A `key` that remounts the component resets it (`UnitPage` is keyed by the unit). State that shouldn't re-render anything when it changes, like scroll positions, goes in its own store (`scrollStore`), read and written with `getState` / `setState`. Don't keep state in module-level `let`s or `Map`s. A module-level variable is fine for something that isn't state: a resource such as the Ask poll's timer handle, or a cache of derived values (`memo` in `shared.ts`, the `WeakMap`s keyed by file).
- **Components subscribe to what they show.** Pick a slice with `useLens((state) => …)` instead of taking the whole state as a prop. A selector may return state values, or the result of a memoized `model/` function. It must not build new objects or arrays itself, since that re-renders on every change.
- **Avoid `useEffect` and `useLayoutEffect`**, because they hide when things run. Put the work where the change happens: in the action (`commit()`, then touch the DOM), in an event handler, in a `key` that remounts a subtree (which resets its scroll), in a ref callback, or in a store subscription in `main.tsx` for document-level things like the title. This isn't a hard ban: when none of those fit, use an effect and say why in a comment.
- **Names are camelCase and say what they hold**: `state`, `unit`, `concern`, `caller`, `fileIndex`, not `s`, `u`, `c`, `i`. PascalCase is for components and types.
- **Icons come from `lucide-react`**, not Unicode glyphs: import the icon you need (esbuild bundles only those), and give it a `size`. A signal's icon is `SignalIcon`. Carets are `ChevronRight` with an `open` class that `styles/base.css` rotates.
- **Dialogs keep their own open state.** The `<dialog>` element knows whether it's open: `openDialog` / `openSearch` call `showModal()`, and Esc or the close button close it natively.
- **Prettier formats the viewer code** (`.prettierrc`: 2-space indent, single quotes, 120 columns, and `endOfLine: auto`, since Git checks files out with CRLF on Windows). Run `npm run format`. `npm test` fails on unformatted code under `src/ui/`, `src/viewer/` and `src/desktop/`, and in their tests.

### Viewer component files

- A component that is one file is `ComponentName.tsx`. Never wrap it in a folder that only holds an `index.tsx`.
- A component gets a `ComponentName/` folder once it needs sibling files. Around 150 lines is a soft ceiling: past that, split the file by concern into a folder, rather than squeezing it. The folder holds:

  ```
  ComponentName/
      index.tsx         the component itself
      const.ts          constants
      util.ts           local helper functions
      hooks.ts          local hooks
      types.ts          local types, if not shared
      schema.ts         a local Zod schema, if not shared (no Zod yet)
      SubComponent.tsx  a private subcomponent (SubComponent/ when it needs a folder of its own)
  ```

- The ceiling holds for the viewer's other modules too: `actions/`, `model/` and `ask/` are each split by area. `store.ts` and `rows.ts` run longer because each is one cohesive thing (the state's shape, the row plan).
- Subcomponents follow the same rule: one file is `SubComponent.tsx`, not `SubComponent/index.tsx`. A folder that has a `components/` subdirectory, or any of the split files above, keeps its `index.tsx`.
- Components that several areas share live directly in `components/`, e.g. `CodeRows`, `CodeCard` and `ViewedBox`.
- React context, if one is ever needed, is split into a provider file and a context file:
  - a context that belongs to a component goes in `Component/provider.tsx` + `Component/context.tsx`;
  - an app-wide one goes in `providers/<Name>Provider/index.tsx` + `context.tsx`.

  `context.tsx` exports exactly two things: the context, `createContext<… | null>(null)`, and a `use<Name>Data()` hook that throws when it's used outside the provider. The provider, `function <Name>Provider({ children }: <Name>ProviderProps)`, owns the state and renders `<<Name>Context.Provider value={…}>`. Keeping them in separate files keeps `react-refresh/only-export-components` happy, since it rejects a file that exports both a component and a hook. The viewer has no context today: Zustand covers its state.

## Viewer: the Summary view extends the Code view

The Summary tab shows the same code snippets as the Code view, with the agent's summary on top. Anything added to or changed in the Code view that affects how code is shown must also work on the Summary tab's unit code, in the same change. That covers folds, fold chips, the fold level, expand/collapse, hunks only, removed lines, hide tests, and their keyboard shortcuts.

- The view settings in the header's ⋯ menu, the fold chips in the code card's header and the review pill work on the Summary tab too. They change state, and both views render from that state: `foldScope` (`actions/folds.ts`) and `foldCategories` (`model/plans.ts`) pick the open file's or the open unit's folds.
- Both views get their rows from `src/viewer/rows.ts`: `fileSpans` / `unitSpans` pick the shown lines and hidden stretches, and `planCode` turns them into lines, folds, removed lines and gaps. Both views render the plan with `CodeRows`, and each passes in its own row marks (cited lines, concern notes, the Ask selection). Change how code is shown there, and both views follow. `rows.ts` has no DOM, so `test/viewer.test.ts` tests it in node. So does `wordDiff.ts`, which pairs replaced lines and marks the words they changed (`codeLines` in `shared.ts` hands both views the marked lines).
- A new control should change state both views read (e.g. `openCats` for the fold chips) or get a Summary branch (e.g. `unitSpans` for hunks only, `listModel` for hide tests).
- Share constants between the views instead of duplicating them (e.g. `HUNK_CONTEXT` in `src/viewer/rows.ts`).
- New keys go in `src/viewer/keys.ts` (and its `SUMMARY_KEYS` when they act on a unit), and in the `?` help: the Global, Code or Summary tab of `KEY_TABS` (`components/KeysDialog/const.ts`).

## Summary mode (`src/cli-app/summary/`)

lens never calls an AI. The user's agent writes `result.json`, and lens checks it.

- Pipeline: `collect.ts` (load the diff) → `units.ts` (split it into units) → `bundle.ts` (`prepare` writes `.lens/summary/<key>/`) → agent → `validate.ts` (`submit`) → `store.ts` (`summary.json`) → `view.ts` (`SummaryView` for the viewer) → `src/viewer/model/` and `components/SummaryPane/`.
- Invariant: every changed and removed line belongs to exactly one unit. `checkCoverage` enforces it, so keep it true when changing how units are found.
- `validate.ts` drops claims that don't point at real code and gives the agent a reason it can act on. A new kind of claim gets the same treatment.
- The agent instructions are generated in `bundle.ts` and are the source of truth. The skills in `skills/` are thin pointers to them, so put format and rule changes in `bundle.ts`, not in a skill.
- Changing the result's shape touches all of these: `RESULT_SCHEMA` and the instructions (`bundle.ts`), `validate.ts`, the types in `store.ts`, `view.ts`, the viewer (`src/viewer/model/`, `components/SummaryPane/`), and `test/summary.test.ts`. The stored format is `version: 1`, and `readStored` ignores files of any other version.
- Summaries are keyed by unit hash, so a code change marks a unit stale instead of showing an outdated summary.
- Tests build real diffs with `git diff --no-index` and real temp repos (see the helpers at the top of `test/summary.test.ts` and `test/git.test.ts`). Follow that pattern rather than hand-writing diff text.

## Ask mode (`src/cli-app/ask/`)

The Ask rail (`src/viewer/ask/`, `components/AskRail/`) asks the user's agent about the open change. As in summary mode, lens never answers anything itself.

- Flow: the viewer posts a question (`routes.ts`) → `session.ts` holds the chat in memory, one per server → `lens ask listen` (`command.ts`) long-polls `/api/ask/next` and prints the agent text → `lens ask reply` posts the answer → `cites.ts` keeps the `path:line` cites that resolve.
- The agent text, including the read-only rules, is generated in `context.ts` and is the source of truth. `skills/lens-ask` only points at it.
- Context is the open change (the Summary tab's unit, or the Code tab's file) plus the user's current selection, and for a unit its open concerns: the ones the reader hasn't dismissed. Dismissals live in the browser, so the viewer names the concerns (`askConcerns`) and `routes.ts` keeps those the unit really has. Nothing else from the summary goes along.
- A question stores its unit's hash (or the file's content hash). ↻ refresh marks it stale when that changes.
- The server writes `.lens/server.json` (port, pid) so `lens ask` can find it, and removes it on exit.

## Desktop app (`src/desktop/`)

An Electron shell around the CLI. **It holds no lens logic**: it picks arguments, starts the same `lens` command a terminal would, and shows that command's viewer in a tab. The CLI works without it, and must keep working without it.

In `src/desktop/`:

```
main/index.ts         lifecycle; where the CLI's sources are (the checkout, or the packed app's resources)
main/window.ts        the window: the tab strip's page, one WebContentsView per tab under it, the IPC handlers
main/tab.ts           one tab's logic (Start → picker → review), without Electron: it reports to a TabHost
main/tabs.ts          the tabs in order, and which is in front
main/session.ts       one review: start the CLI, wait for its ready line, stop it
main/cli.ts           how the CLI is run (the app's executable in Node mode), `lens info --json`
main/store.ts         what is kept between runs: recent folders, each repository's port, the window's place, the open tabs
main/bounds.ts        where the window opens: its saved place, while a display still shows it
main/setup.ts         Settings → Agent: install / uninstall the `lens` command and the skills
main/themes.ts        the code theme: the viewer's cookie, read and written
main/security.ts      what pages may do (see below)
main/smoke.ts         the scripted tour `npm run app:smoke` runs
preload.ts            window.lensApp for the app's own pages; the viewer gets no preload
shared/               choice.ts (a picked review → CLI arguments), api.ts (the IPC contract)
shell/                the tab strip: the window's own page, and its title bar
launcher/             Start, the picker, Settings: a React page shown in a tab until a review runs
menu/                 the strip's theme menu: a clear page in a view over the whole window, there while the menu is open
icons/                the app's icon: icon.png, and the .icns / .ico made from it
```

And at the root: `forge.config.ts` is the whole build, as Electron Forge hooks: `generateAssets` bundles `src/desktop/` into `dist/` before a start or a pack, `prePackage` lays out the packed app's copy of the CLI in `dist/lens`, and the packager settings say what goes in and which fuses are set. `npm run app` is `electron-forge start` and `npm run app:dist` is `electron-forge package`: there is no build script of our own, and a new build step goes in a hook. `scripts/smoke.ts` runs the tour and `scripts/icons.ts` makes the icon files.

- **The CLI and the app stay in sync by construction.** The app runs `src/cli-app/cli.ts` with Electron's Node (type stripping, as the `lens` command's Node does); the packed app carries `src/cli-app/` as it is, at the same path under its `resources/lens`, plus a viewer bundled ahead of time (`viewer-bundle.json`, which `bundleViewer` prefers when it exists). Nothing compiles the CLI. `CLI_PACKAGES` in `forge.config.ts` names the packages the CLI loads at run time: a new runtime dependency of `src/cli-app/` goes there too, or the packed app can't find it (`npm run app:smoke -- --packed` catches that).
- **`shared/choice.ts` is the only place that writes CLI arguments.** `test/app-choice.test.ts` runs every kind of choice through the real CLI. A new CLI mode or flag that changes what is reviewed gets its control in the picker in the same change, or a line in the README saying it stays CLI-only.
- **What the app knows about a repository comes from `lens info --json`.** Git logic belongs in `src/cli-app/` (under the node tests), not in `src/desktop/`. The app also reads two things the CLI writes: the ready line `lens viewer on http://127.0.0.1:<port>/` and the failure line `lens: <reason>` (both in `session.ts` / `cli.ts`, pinned by `test/app-session.test.ts`), and `.lens/server.json`.
- **The viewer page has no app-specific code**, and should get none: the tab strip carries the window controls, the theme button and Settings. The app does two things to a viewer, both by the ids the viewer gives its theme menu (`ui/ThemeMenu`): it switches its theme by clicking the menu's item, `#theme-<name>` (`themeChanged` in `window.ts`), and it hides the menu's button, `#theme-btn`, with one inserted CSS rule (`HIDE_VIEWER_THEME_BUTTON`), so the strip's button is the only one. Keep those ids.
- **Security (`security.ts`) is not optional.** The viewer shows code the reader didn't write: it is sandboxed, has no preload, keeps to its own origin (no navigation, windows, downloads or permissions but clipboard writes) and has its own session partition. The app's pages are served from `lens-app://app` under a CSP that allows only the app's files. Every IPC call checks who sent it (`isAppPage`) and what it carries: a repository is one the app listed or the folder dialog returned, a review is `parseChoice`'d and turned into arguments in the main process. What `state.json` says of the last run's tabs is data too: a stored root counts only once `lens info` has found a repository for it, a stored review goes through `parseChoice` and `choiceProblem` (`Tab.restore`), and no command line is ever stored. A page never sends a command line. The CLI is spawned with an argument list, never through a shell. A new page, call or view keeps all of this.
- **Logic is tested without Electron.** `tab.ts`, `tabs.ts`, `session.ts`, `store.ts`, `bounds.ts`, `setup.ts` and `shared/` import nothing from `electron`, and the `test/app-*.test.ts` files drive them against the real CLI and real temp folders. `window.ts`, `themes.ts`, `security.ts` and `menu.ts` are the Electron glue; keep logic out of them. The pages are tested as the viewer's is: `test/launcher-page.test.ts` runs the real bundles in happy-dom with `window.lensApp` stubbed. What only a real window shows (views, the title bar, the theme reaching a viewer) is checked by `npm run app:smoke`, which saves a picture of each step in `dist/smoke`: run it after changing the glue or the packing, and read the pictures. It starts the app twice on the same data: the second run checks that the window and its tab come back as the first left them. Not routinely: it opens the app's window on the user's screen, so run it once per such change, and say so first.
- **The app's pages follow the design system and the viewer's code rules**: the same tokens and primitives (`src/ui/`), Zustand for the state the main process sends, a stylesheet per component, Prettier. They import nothing from `src/viewer/`: what both need is a primitive in `src/ui/` (the status bar under the launcher's screens is `ui/StatusBar`, the picker's header `ui/TopBar`).
- **A page of the app arrives in the theme**, as the viewer's does: `lockDown` writes the theme's colors on the `<html>` it serves (`themeAttributes` in `shared/page.ts`, plain hex colors only), and a new view's background is the pages' own `--bg`, which the strip's page measures and reports (`chrome`). Without both, a new tab flashes the default dark theme.
- **The app reopens as it was left, and trusts none of it.** `store.ts` keeps the window's place and the tabs that had a repository (`TabList.session()`), written whenever they change, but not while the window closes: ending the reviews isn't leaving them. On the next start `AppWindow.reopen` makes a tab per stored one and `Tab.restore` reads its repository again: a repository that is gone gets no tab. Only the tab in front starts its review (`Tab.shown`); the others start when first selected. Until its review shows, the tab's page is a loading screen (`reopening` in `LauncherState`, `Reopening.tsx`), not Start or a picker with nothing to pick yet. A review that can't start, or is cancelled, leaves the tab on its picker with the CLI's reason, as any failed open does.
- **The picker follows the repository by polling**, with the pages' loop (`src/ui/poll.ts`, registered in `launcher/main.tsx`): the page calls `launcher.refresh()` every 5 s while it is in sight, and `Tab.poll` is quiet (the page hears only what changed, a failure once). The main process answers only the tab in front. Each read is a `lens info` run, about 0.4 s of CPU: don't shorten the interval without a cheaper read.
- A click in the strip doesn't take the focus (the strip's `onMouseDown`): it stays in the tab's page, and the focus ring is left to keys.
- The strip's theme button is the viewer's (`ThemeTrigger` and `ThemeList` of `ui/ThemeMenu`), but its menu isn't in the strip's page: a popover there would be cut off at the strip's 40px and open underneath the tab's view, which is a separate layer above the page. The list is `menu/`'s page, in a transparent view the main process adds over the whole window while the menu is open (`toggleMenu` / `closeMenu` in `window.ts`) and takes out after; the browser's own popover closes it on Esc or a click outside. A pick is a theme's name, checked against the themes the menu was given.
- Setup only ever removes what it installed: its command file carries the marker `lens-app-shim`, a skill folder it copied carries `.lens-app`. A link or an unmarked folder is someone else's.
- **Packing is Electron Forge's `package` step, with no makers**: the result is a folder to run the app from (`release/Lens-<platform>-<arch>`), not an installer. Don't add a maker or an installer unless asked. Forge packs for the system it runs on, so a Windows build is made and checked on Windows. `app/build/icon.icns` and `icon.ico` are checked in; `npm run app:icons` (macOS) makes them again from `icon.png`.
- Nothing signs the app, and nothing needs to for a build run where it was packed: Electron's executable comes signed ad hoc, and Forge's fuses plugin signs it again after changing it (Apple silicon won't run it otherwise). Leave the cookie-encryption fuse off: on macOS it asks the Keychain for a key, and an app without a certificate then prompts for the login password.

## Non-goals

lens never calls an AI, does no semantic analysis or type checking, never edits code, and has no terminal UI (`--json` is for debugging only). The desktop app adds none of these: it is another way to start the same review. Don't add features that cross these lines.

## Git

Commits use conventional prefixes (`feat:`, `fix:`, `refactor:`, `chore:`). Don't add a `Co-Authored-By` trailer or any other Claude attribution to commits. Work goes on `features/*` branches and is merged to `main` through PRs. Never push and never open PRs, and don't offer to: the user does all pushing and PRs.
