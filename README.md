![](src/desktop/icons/icon.ico)
# lens

**The code review tool for the agentic era.**

Agents write code faster than anyone can read it. lens makes reading it fast: it folds away the
noise, has your own coding agent brief you on each changed function, and lets you ask it
questions as you read. lens itself calls no AI (unless you pick an `agent` for it to run) and needs no API key.

![The Summary tab: an overview of the change, a sequence diagram, then each change with its concerns](docs/media/summary.gif)

## What it does

- **Code**: folds what carries no review signal (imports, comments, guards, logging,
  boilerplate) into one-line pills, so you see where the behavior lives.
- **Summary**: your agent walks you through the change one function at a time: what it does,
  what behaves differently, possible bugs, and callers it may break. lens checks every claim
  against the code.
- **Ask**: ask your agent about the code you're reading; answers cite the lines.
- **Plan**: your [Lavish](https://github.com/kunchenguid/lavish-axi) plans, inside lens.

![The Code view: a file's folds, one opened, then side by side](docs/media/code.gif)

## Install

**macOS**: download `Lens-darwin-arm64.zip` from the
[latest release](https://github.com/miha53cevic/lens/releases/latest), move `Lens.app` to
`/Applications`, and run this once (the app isn't notarized):

```bash
xattr -dr com.apple.quarantine /Applications/Lens.app
```

**From source** (needs [Bun](https://bun.com) 1.4+ and git): `bun install`, then `bun run app`.

Then in the app, **App** (the plug in the tab strip) installs the `lens` command and the agent skills (into
`~/.claude/skills` and the shared `~/.agents/skills`).

## Use it

Open the app, pick a repository and what to review (your changes, a branch, some commits, or a PR). Then ask
your agent for the summary:

```bash
/lens-review
```

Or pick an **Agent** (Settings → Feature flags): lens runs it itself (today Claude Code, `claude -p`) to write
the summary and answer your questions. The App page shows whether it's installed and logged in; **Agent running**
in the status bar lists its runs, each with a Stop.

Press `?` in lens for every key.

## Command line

| command | opens |
| --- | --- |
| `lens diff` | your uncommitted changes (`--staged`, or any `git diff` arguments) |
| `lens pr 123` | a GitHub PR (no API token needed) |
| `lens <path>` | files or folders, folded |
| `lens config` | the config in effect, and where each value comes from |
| `lens clear` | what lens has saved, and clearing it |
| `lens timings` | how long lens's steps took (send `~/.lens/timings.jsonl` when it's slow) |

Flags: `--port <n>`, `--no-open`, `--summary`, `--fold-level <n>`, `--theme <name>`, `--version`, and `--stop-with-stdin`
(what the app passes: lens stops when its stdin closes).

## Configuration

Add a `.lens.json` to your repository; it merges over [lens's defaults](lens.defaults.json)
(`"!x"` removes `x` from a list, `"base": false` replaces the defaults).

```json
{
  "foldLevel": 0,
  "folds": { "logging": false, "guard": 2 },
  "exclude": ["generated/**"]
}
```

| field | meaning |
| ----- | ------- |
| `foldLevel` | fold regions scored at or below this, `-1` for none (default `1`) |
| `folds` | per category (`import`, `comment`, `guard`, `logging`, `telemetry`, `error-boilerplate`, `accessor`, `barrel`, `data`): a score 0–3, or `false` to never fold |
| `callPatterns` | more calls to fold: `{ category, receivers, methods?, score? }` |
| `keepCommentMarkers` | comments containing these never fold (TODO and FIXME never do) |
| `keepDirective` | a region marked with it never folds (default `"lens:keep"`) |
| `testFilePatterns` | what counts as a test, for *hide tests* |
| `exclude` | files listed but never read |
| `theme` | the starting code theme, any [Shiki theme](https://shiki.style/themes) (default `"vesper"`) |
| `buildPreviews` | the summary includes UI previews and run-time diagrams (default `true`) |
| `selfChecks` | the summary includes questions to check yourself (default `false`) |
| `planTab` | show the Plan tab (default `true`) |
| `typescriptLsp` | TypeScript hover and go-to-definition, by the TypeScript 7 lens ships with (default `false`) |
| `timings` | record how long lens's steps take (default `true`) |
| `agent` | the agent lens runs itself for the summary and Ask: `"claude"` (Claude Code, installed and logged in), or `null` for your own through the skills (default `null`) |

The last six are also switches in Settings, which win over the file. Folding works on
TypeScript and JavaScript; other files get diff markers and syntax colors.

## Development

```bash
bun run test        # typechecks, format check, tests
bun run app         # the desktop app from this checkout
```

## Non-goals

lens never calls an AI unless you pick an `agent` (your own agent does the writing), never edits your code, and has no
terminal UI.
