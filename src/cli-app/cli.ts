#!/usr/bin/env bun
import { problemLine, readConfig, type LoadedConfig } from './config.ts';
import { runConfig } from './configCommand.ts';
import { isBundledTheme } from './render/highlight.ts';
import { serveViewer } from './render/web/server.ts';
import { warmHighlighter } from './render/highlightPool.ts';
import { analyze } from './analyze.ts';
import { runSummary } from './summary/command.ts';
import { runAsk } from './ask/command.ts';
import { runInfo } from './info.ts';
import { runClear } from './clear.ts';
import { runTimings, timed } from './timings.ts';
import { timingsOn } from './summary/settings.ts';
import { gitRoot } from './git.ts';
import { pickPort } from './port.ts';
import manifest from '../../package.json' with { type: 'json' };

const HELP = `lens — a reading lens for AI-generated code (static analysis, no AI)

usage:
  lens <path...>              analyze files or directories
  lens diff [git-diff-args]   analyze files changed in git diff (e.g. lens diff --staged)
  lens pr <url|N>             analyze a GitHub PR (URL, or a number on origin)
                              — run inside a clone; refresh picks up new pushes
  lens config [--json]        the config in effect, where each value comes from, and its problems
  lens info [--json]          what could be reviewed here: the repository, its branches and
                              changes (--base <ref> to compare against, --themes for the themes' colors)

summary mode (written by your own coding agent — see skills/lens-review):
  lens summary prepare [diff-args | pr <url|N>]
                              write a task bundle for the agent (.lens/summary/<key>/)
  lens summary submit <bundle-dir | result.json>
                              validate the agent's result.json and store it for the viewer

timings (turn them on in the viewer's Settings, or "timings": true in .lens.json):
  lens timings [--repo <name>] [--json]
                              how long each step took, in every repository (~/.lens/timings.jsonl)

saved data (also the viewer's ⋯ → Clear saved data…):
  lens clear                  list what lens keeps in .lens/, by kind
  lens clear <kind> --all     clear all of a kind (e.g. lens clear summaries --all)
  lens clear summaries <key>  clear one review's summary (the folder name lens clear lists)

ask mode (the viewer's Ask rail, answered by your own agent — see skills/lens-ask):
  lens ask listen             wait for the next question asked in the viewer and print it
  lens ask reply <id> <answer.md | ->
                              post the answer to that question

output (default: local web viewer):
  --json            print the fold model as JSON (for debugging)
  --port <n>        web viewer port (default: the repository's own, from 5400 up)
  --no-open         don't open the browser
  --stop-with-stdin stop when stdin closes (what the desktop app passes: lens ends with it)
  --summary         open the browser on the Summary tab (diff/PR mode)
  --fold-level <n>  fold regions with score <= n, -1 for none (default 1; from .lens.json)
  --theme <name>    any Shiki theme for the viewer (default vesper; from .lens.json)
  --version         print lens's version
`;

interface CliOptions {
  json: boolean;
  open: boolean;
  stopWithStdin: boolean;
  openSummary: boolean;
  port: number;
  portSet: boolean;
  foldLevel: number | null;
  theme: string | null;
}

type Command = 'paths' | 'diff' | 'pr' | 'config' | 'info' | 'summary' | 'ask' | 'clear' | 'timings';
const COMMANDS: string[] = ['diff', 'pr', 'config', 'info', 'summary', 'ask', 'clear', 'timings'] satisfies Command[];

function parseCli(argv: string[]): { command: Command; rest: string[]; opts: CliOptions } {
  const opts: CliOptions = {
    json: false,
    open: true,
    stopWithStdin: false,
    openSummary: false,
    port: 0,
    portSet: false,
    foldLevel: null,
    theme: null,
  };
  const rest: string[] = [];
  let command: Command = 'paths';
  const args = [...argv];
  while (args.length > 0) {
    const arg = args.shift()!;
    if (arg === '--json') opts.json = true;
    else if (arg === '--no-open') opts.open = false;
    else if (arg === '--stop-with-stdin') opts.stopWithStdin = true;
    else if (arg === '--summary') opts.openSummary = true;
    else if (arg === '--port') {
      opts.port = Number(args.shift());
      opts.portSet = true;
    } else if (arg === '--fold-level') opts.foldLevel = Number(args.shift());
    else if (arg === '--theme') opts.theme = args.shift() ?? null;
    else if (arg === '--help' || arg === '-h') {
      console.log(HELP);
      process.exit(0);
    } else if (arg === '--version' || arg === '-v') {
      console.log(`lens ${manifest.version}`);
      process.exit(0);
    }
    // the command is the first word that isn't a lens flag (`lens --no-open diff` works too)
    else if (command === 'paths' && rest.length === 0 && COMMANDS.includes(arg)) command = arg as Command;
    else rest.push(arg); // in diff mode these pass through to git diff
  }
  return { command, rest, opts };
}

/** Where .lens/ is: the repository's root, as summary mode writes it, or here outside a repository. */
function repoRootOr(cwd: string): string {
  try {
    return gitRoot(cwd);
  } catch {
    return cwd;
  }
}

async function main(): Promise<void> {
  const { command, rest, opts } = parseCli(process.argv.slice(2));
  const cwd = process.cwd();

  if (command === 'config') return runConfig(cwd, opts.json);
  if (command === 'info') return runInfo(rest, cwd, opts.json, opts.theme);
  if (command === 'summary') return runSummary(rest, cwd);
  if (command === 'ask') return runAsk(rest, cwd, opts.portSet ? opts.port : null);
  if (command === 'clear') return runClear(rest, repoRootOr(cwd));
  if (command === 'timings') {
    return runTimings(rest, opts.json, timingsOn(readConfig(cwd).config));
  }

  if (opts.portSet && (!Number.isInteger(opts.port) || opts.port < 1 || opts.port > 65535)) {
    throw new Error('--port needs a number between 1 and 65535');
  }
  if (opts.foldLevel !== null && !(Number.isInteger(opts.foldLevel) && opts.foldLevel >= -1 && opts.foldLevel <= 3)) {
    throw new Error('--fold-level needs a whole number from -1 to 3');
  }
  if (command === 'pr' && rest.length !== 1) throw new Error('pr takes exactly one argument — a PR URL or a PR number');
  if (command === 'paths' && rest.length === 0) {
    console.log(HELP);
    process.exit(1);
  }

  // Re-resolved on every analysis so the viewer's refresh picks up .lens.json
  // edits; CLI flags stay applied on top.
  const resolveConfig = (): LoadedConfig => {
    const loaded = readConfig(cwd);
    if (opts.foldLevel !== null) loaded.config.foldLevel = opts.foldLevel;
    if (opts.theme !== null) loaded.config.theme = opts.theme;
    return loaded;
  };
  const loaded = resolveConfig();
  const config = loaded.config;
  // once here; the viewer shows them too, and again after each refresh
  for (const problem of loaded.problems) console.error('lens: ' + problemLine(problem));
  if (!isBundledTheme(config.theme)) {
    throw new Error(`unknown theme "${config.theme}" — pick a Shiki theme name (https://shiki.style/themes)`);
  }

  // the viewer's tokens are made on threads that warm up while the analysis runs
  if (!opts.json) warmHighlighter();
  const initial = await timed('cli', 'analyze', () => analyze(command, rest, cwd, config, { withSummary: !opts.json }));
  const { files, deleted, excluded, renamed, binary } = initial;
  // with the Plan tab, a diff with nothing in it yet still opens: a feature starts there, on a clean
  // branch, and the code it builds comes in with a refresh
  const planFirst = command === 'diff' && initial.planTab && !opts.json;
  if (
    !planFirst &&
    files.length === 0 &&
    deleted.length === 0 &&
    excluded.length === 0 &&
    renamed.length === 0 &&
    binary.length === 0
  ) {
    throw new Error(
      command === 'diff'
        ? 'no changed supported files in this diff'
        : command === 'pr'
          ? 'no changed supported files in this PR'
          : 'no supported files found (ts, tsx, js, jsx, mjs, cjs)',
    );
  }

  if (opts.json) {
    const model = {
      foldLevel: config.foldLevel,
      files: files.map(({ source: _, ...f }) => f),
      ...(deleted.length > 0 ? { deleted } : {}),
      ...(excluded.length > 0 ? { excluded } : {}),
      ...(renamed.length > 0 ? { renamed } : {}),
      ...(binary.length > 0 ? { binary } : {}),
    };
    console.log(JSON.stringify(model, null, 2));
    return;
  }
  // without --port, the repository's own: two reviews run side by side, each on the same port every time
  const port = opts.portSet ? opts.port : await pickPort(initial.root);
  await serveViewer(
    initial,
    {
      port,
      open: opts.open,
      stopWithStdin: opts.stopWithStdin,
      openSummary: opts.openSummary,
      theme: config.theme,
      themePinned: opts.theme !== null,
    },
    (previous) => analyze(command, rest, cwd, resolveConfig().config, { previous }),
  );
}

main().catch((err) => {
  console.error(`lens: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
