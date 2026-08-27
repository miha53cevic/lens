# Configuring lens

lens's folding rules are data, not code. The built-in rules live in
[lens.defaults.json](lens.defaults.json) — the "base game" — and a `.lens.json`
in your project is a mod on top of it. This document walks through every field
using the actual defaults as the example.

## How config is found and merged

1. lens starts from `lens.defaults.json` (shipped with lens).
2. It walks upward from your working directory to find the nearest `.lens.json`.
3. Your file merges over the base: **scalars override, maps merge, lists extend.**

The viewer's **↻ refresh** button re-reads `.lens.json` too, so config edits
apply without restarting the server, and the **⚙ settings** modal shows the
effective merged config and where it came from.

So this `.lens.json`:

```json
{
  "threshold": 0,
  "categories": { "logging": false },
  "callPatterns": [{ "category": "audit", "receivers": ["audit"] }]
}
```

...means: threshold becomes 0, `logging` is switched off, every other category
keeps its default setting, and the `audit` pattern is **added to** the two
built-in call patterns (not replacing them).

To replace the base entirely instead of extending it, set:

```json
{ "base": false }
```

Then your file is the whole rule set — `lens config init` writes exactly such a
standalone copy of the defaults for you to edit.

### CLI helpers

```bash
lens config          # print the effective merged config + where it came from
lens config init     # create a .lens.json here — a standalone copy of the defaults
lens config reset    # restore defaults (.lens.json moves to .lens.json.bak; rename back to undo)
```

## The fields, using the defaults as the example

### `threshold` — how aggressively to fold

```json
"threshold": 1
```

Regions fold when their score ≤ threshold. The viewer's slider changes this
live; `--threshold <n>` overrides it per run.

| level | what folds |
| ----- | ---------- |
| -1 (off) | nothing — the plain file |
| 0 | pure scaffolding: imports, comments, barrel files |
| 1 | **default** — also defensive ceremony: guards, logging, telemetry, log-and-rethrow catches, accessors, constant data blocks |
| 2–3 | nothing extra by default — headroom for categories you score 2–3 yourself |

### `theme` — viewer and terminal colors

```json
"theme": "vesper"
```

Any [Shiki theme name](https://shiki.style/themes). Drives the web viewer's
syntax highlighting and `--term`'s ANSI colors. `--theme <name>` overrides per run.

### `categories` — master on/off switch per category

```json
"categories": {
  "import": true,
  "comment": true,
  "guard": true,
  "logging": true,
  "telemetry": true,
  "error-boilerplate": true,
  "accessor": true,
  "barrel": true,
  "data": true
}
```

Set one to `false` and that category never folds, whatever its score.
Example: an ops-heavy service where log lines are part of the contract:

```json
{ "categories": { "logging": false } }
```

### `scores` — how important each category is (0–3)

```json
"scores": {
  "import": 0,
  "comment": 0,
  "guard": 1,
  "logging": 1,
  "telemetry": 1,
  "error-boilerplate": 1,
  "accessor": 1,
  "barrel": 0,
  "data": 1
}
```

- **0** — folds at every level (zero review signal)
- **1** — folds at the default threshold
- **2–3** — folds only when the reviewer raises the slider

Example — keep guards visible by default but foldable on demand:

```json
{ "scores": { "guard": 2 } }
```

Score **4** is reserved and not settable here: TODO/FIXME comments and
`lens:keep` regions always score 4, so they never fold at any threshold.

### `callPatterns` — which fire-and-forget calls are noise

```json
"callPatterns": [
  {
    "category": "logging",
    "receivers": ["console", "log", "logger", "*Logger"],
    "methods": ["log", "debug", "info", "warn", "error", "trace", "verbose", "fatal"]
  },
  {
    "category": "telemetry",
    "receivers": ["metrics", "telemetry", "analytics", "tracker", "stats"]
  }
]
```

Each entry folds expression statements of the form `<receiver>.<method>(...)`
whose result is unused. Field by field:

- **`category`** — a built-in name or a brand-new one. New names automatically
  get their own pill label and toggle chip in the viewer.
- **`receivers`** — matched against the call receiver's *trailing segment*, so
  `"logger"` matches both `logger.info(...)` and `this.logger.info(...)`.
  `*` is a wildcard: `"*Logger"` matches `requestLogger`, `auditLogger`, etc.
- **`methods`** — allowed method names. Omit it (like the telemetry entry does)
  to match *any* method on those receivers.
- **`score`** — optional; defaults to `scores[category]`, then 1.

Example — fold your team's audit and feature-flag calls under their own category:

```json
{
  "callPatterns": [
    { "category": "audit", "receivers": ["audit", "featureFlags"] }
  ]
}
```

Calls matched by any pattern also count as "noise" inside guard bodies and
catch blocks — so `if (!x) { logger.warn("no x"); return null; }` still folds
as a guard.

### `keepCommentMarkers` — comments that carry signal

```json
"keepCommentMarkers": [
  "TODO", "FIXME", "HACK", "XXX",
  "eslint-disable", "@ts-ignore", "@ts-expect-error", "@ts-nocheck", "biome-ignore"
]
```

A comment containing any of these never folds. Besides work markers, the
defaults include lint/type suppressions — a comment that silences an error is
review signal, not noise. Extend it with your own:

```json
{ "keepCommentMarkers": ["SECURITY", "PERF"] }
```

(Lists extend, so TODO/FIXME/... remain active alongside yours.)

### `testFilePatterns` — what the viewer's "hide tests" toggle matches

```json
"testFilePatterns": ["*.spec.*", "*.test.*", "__tests__/**"]
```

Glob-ish path patterns (`*` matches within a path segment, `**` across
segments, matched anywhere in the path). When any open file matches, the
viewer shows a **hide tests** checkbox that filters those files out of the
tree; the choice is remembered per browser. Test files are still analyzed —
this only hides them from view — and `--term`/`--json` are unaffected.

```json
{ "testFilePatterns": ["e2e/**", "*.stories.*"] }
```

### `exclude` — files never read or analyzed

```json
"exclude": ["package-lock.json", "yarn.lock", "pnpm-lock.yaml", "*.min.js", "*.min.css", "*.map"]
```

Same glob dialect as `testFilePatterns`. In diff mode, matching files are
skipped **before** reading and tokenizing — a changed lockfile would otherwise
cost seconds of syntax highlighting and tens of thousands of DOM rows — but
they still appear in the sidebar as a dimmed `⊘` row, so you can see *that*
they changed without paying for *what* changed. `--term` lists them too.
Directory walks (`lens src/`) skip them silently; a file you pass explicitly
on the command line is always analyzed.

```json
{ "exclude": ["generated/**", "*.snap"] }
```

### `keepDirective` — the per-site escape hatch

```json
"keepDirective": "lens:keep"
```

Put the directive string inside a region, or on the line directly above it,
and that region never folds — for the one guard lens keeps folding that you
actually care about:

```ts
// lens:keep — this guard was buggy last week, always show it
if (!input) {
  throw new Error("input required");
}
```
