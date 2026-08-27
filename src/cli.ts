#!/usr/bin/env node
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, resolve, relative } from "node:path";
import { analyzeSource } from "./classify/index.ts";
import { loadConfig, findConfigPath, initConfig, resetConfig } from "./config.ts";
import { gitDiffTargets } from "./git.ts";
import { languageForFile } from "./parse/parser.ts";
import { renderTerm, colorEnabled } from "./render/term.ts";
import { highlightSource, isBundledTheme, shikiLangForFile } from "./render/highlight.ts";
import { serveViewer, type ViewerInput } from "./render/web/server.ts";
import { compilePatterns, matchesAny } from "./glob.ts";
import type { FileFoldModel, FoldModel, LensConfig, RemovedBlock } from "./model.ts";

const HELP = `lens — a reading lens for AI-generated code (static analysis, no AI)

usage:
  lens <path...>              analyze files or directories
  lens diff [git-diff-args]   analyze files changed in git diff (e.g. lens diff --staged)
  lens config [show]          print the effective config and where it comes from
  lens config init            create a .lens.json here, seeded from the built-in defaults
  lens config reset           restore default behavior (.lens.json moves to .lens.json.bak)

output (default: local web viewer):
  --term            print folded files to the terminal
  --json            print the fold model as JSON
  --port <n>        web viewer port (default 5326)
  --no-open         don't open the browser
  --threshold <n>   fold regions with score <= n (default 1; from .lens.json)
  --theme <name>    any Shiki theme for the viewer (default vesper; from .lens.json)
  --hunks           with --term in diff mode: only changed hunks (±3 context), PR-style
`;

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", "out", "coverage"]);

interface CliOptions {
  json: boolean;
  term: boolean;
  open: boolean;
  port: number;
  threshold: number | null;
  theme: string | null;
  hunks: boolean;
}

function parseCli(argv: string[]): { command: "paths" | "diff" | "config"; rest: string[]; opts: CliOptions } {
  const opts: CliOptions = { json: false, term: false, open: true, port: 5326, threshold: null, theme: null, hunks: false };
  const rest: string[] = [];
  let command: "paths" | "diff" | "config" = "paths";
  const args = [...argv];
  if (args[0] === "diff") { command = "diff"; args.shift(); }
  else if (args[0] === "config") { command = "config"; args.shift(); }
  while (args.length > 0) {
    const arg = args.shift()!;
    if (arg === "--json") opts.json = true;
    else if (arg === "--term") opts.term = true;
    else if (arg === "--no-open") opts.open = false;
    else if (arg === "--hunks") opts.hunks = true;
    else if (arg === "--port") opts.port = Number(args.shift());
    else if (arg === "--threshold") opts.threshold = Number(args.shift());
    else if (arg === "--theme") opts.theme = args.shift() ?? null;
    else if (arg === "--help" || arg === "-h") { console.log(HELP); process.exit(0); }
    else rest.push(arg); // in diff mode these pass through to git diff
  }
  return { command, rest, opts };
}

function collectFiles(paths: string[]): string[] {
  const files: string[] = [];
  const visit = (p: string) => {
    const stats = statSync(p);
    if (stats.isDirectory()) {
      const name = p.split("/").pop() ?? "";
      if (SKIP_DIRS.has(name) || (name.startsWith(".") && name !== "." && name !== "..")) return;
      for (const entry of readdirSync(p).sort()) visit(join(p, entry));
    } else if (languageForFile(p)) {
      files.push(p);
    }
  };
  for (const p of paths) {
    const abs = resolve(p);
    if (!existsSync(abs)) {
      console.error(`lens: no such file or directory: ${p}`);
      process.exit(1);
    }
    const stats = statSync(abs);
    if (stats.isFile()) {
      if (!languageForFile(abs)) console.error(`lens: skipping unsupported file ${p}`);
      else files.push(abs);
    } else {
      visit(abs);
    }
  }
  return files;
}

async function main(): Promise<void> {
  const { command, rest, opts } = parseCli(process.argv.slice(2));
  const cwd = process.cwd();

  if (command === "config") {
    const sub = rest[0] ?? "show";
    if (sub === "show") {
      const config = loadConfig(cwd);
      const path = findConfigPath(cwd);
      console.error(path
        ? `# effective config: built-in lens.defaults.json + ${path}`
        : "# effective config: built-in lens.defaults.json (no .lens.json found)");
      console.log(JSON.stringify(config, null, 2));
    } else if (sub === "init") {
      const target = initConfig(cwd);
      console.log(`created ${target} (a copy of the built-in defaults — edit away)`);
    } else if (sub === "reset") {
      const result = resetConfig(cwd);
      if (result) {
        console.log(`reset: moved ${result.reset} to ${result.backup}`);
        console.log(`defaults apply again; rename the .bak back to undo`);
      } else {
        console.log("nothing to reset — no .lens.json found, defaults already apply");
      }
    } else {
      console.error(`lens: unknown config subcommand "${sub}" (use show, init, or reset)`);
      process.exit(1);
    }
    return;
  }

  if (!Number.isInteger(opts.port) || opts.port < 1 || opts.port > 65535) {
    console.error(`lens: --port needs a number between 1 and 65535`);
    process.exit(1);
  }
  if (opts.threshold !== null && Number.isNaN(opts.threshold)) {
    console.error("lens: --threshold needs a number (-1 to 3)");
    process.exit(1);
  }

  // Re-resolved on every analysis so the viewer's refresh picks up .lens.json
  // edits; CLI flags stay applied on top.
  const resolveConfig = (): LensConfig => {
    const resolved = loadConfig(cwd);
    if (opts.threshold !== null) resolved.threshold = opts.threshold;
    if (opts.theme !== null) resolved.theme = opts.theme;
    return resolved;
  };
  const startupTheme = resolveConfig().theme;
  if (!isBundledTheme(startupTheme)) {
    console.error(`lens: unknown theme "${startupTheme}" — pick a Shiki theme name (https://shiki.style/themes)`);
    process.exit(1);
  }

  interface Analysis {
    model: FoldModel;
    sources: Map<string, string>;
    deleted: string[];
    excluded: string[];
    renamed: { from: string; to: string }[];
    config: LensConfig;
  }

  // Re-runnable so the viewer's refresh button can pick up new file contents
  // (and, in diff mode, a fresh git diff) without restarting the server.
  const runAnalysis = async (): Promise<Analysis> => {
    const config = resolveConfig();
    let targets: {
      file: string;
      changedLines?: number[];
      status?: "added" | "modified";
      removals?: RemovedBlock[];
    }[];
    let deleted: string[] = [];
    let renamed: { from: string; to: string }[] = [];
    const excluded: string[] = [];
    const excludeRegexes = compilePatterns(config.exclude);
    if (command === "diff") {
      const result = gitDiffTargets(rest, cwd);
      // Excluded files are dropped BEFORE reading/tokenizing (that's the whole
      // point: lockfiles cost seconds of Shiki time and thousands of DOM rows)
      // but still listed so the reviewer sees that they changed.
      targets = result.targets.filter((t) => {
        const display = relative(cwd, t.file) || t.file;
        if (matchesAny(display, excludeRegexes)) { excluded.push(display); return false; }
        return true;
      });
      deleted = result.deleted.map((p) => relative(cwd, p) || p);
      renamed = result.renamed.map((r) => ({
        from: relative(cwd, r.from) || r.from,
        to: relative(cwd, r.to) || r.to,
      }));
    } else {
      // Directory walks skip excluded files silently; a file passed explicitly
      // on the command line is always analyzed.
      targets = collectFiles(rest)
        .filter((file) => rest.some((r) => resolve(r) === file) ||
          !matchesAny(relative(cwd, file) || file, excludeRegexes))
        .map((file) => ({ file }));
    }

    const sources = new Map<string, string>();
    const model: FoldModel = { version: 1, threshold: config.threshold, files: [] };
    for (const target of targets) {
      const source = readFileSync(target.file, "utf8");
      const display = relative(cwd, target.file) || target.file;
      // Unsupported file types (diff mode only) are shown without folding.
      const fileModel: FileFoldModel | null = languageForFile(target.file)
        ? await analyzeSource(display, source, config)
        : { file: display, language: null, lineCount: source.split("\n").length, regions: [] };
      if (!fileModel) continue;
      if (target.changedLines) fileModel.changedLines = target.changedLines;
      if (target.status) fileModel.status = target.status;
      if (target.removals?.length) fileModel.removals = target.removals;
      sources.set(display, source);
      model.files.push(fileModel);
    }
    if (deleted.length > 0) model.deleted = deleted;
    if (excluded.length > 0) model.excluded = excluded;
    if (renamed.length > 0) model.renamed = renamed;
    return { model, sources, deleted, excluded, renamed, config };
  };

  if (command !== "diff" && rest.length === 0) { console.log(HELP); process.exit(1); }
  const initial = await runAnalysis();
  const { model, sources, deleted, excluded, renamed } = initial;
  if (model.files.length === 0 && deleted.length === 0 && excluded.length === 0 && renamed.length === 0) {
    console.error(
      command === "diff"
        ? "lens: no changed supported files in this diff"
        : "lens: no supported files found (ts, tsx, js, jsx, mjs, cjs)",
    );
    process.exit(1);
  }

  if (opts.json) {
    console.log(JSON.stringify(model, null, 2));
    return;
  }
  if (opts.term) {
    for (const file of model.files) {
      const source = sources.get(file.file) ?? "";
      // Same Shiki theme as the web viewer, as 24-bit ANSI. Skipped when piped.
      const tokens = colorEnabled
        ? (await highlightSource(source, file.language ?? shikiLangForFile(file.file), initial.config.theme)).tokens
        : undefined;
      console.log(renderTerm(file, source, model.threshold, tokens, opts.hunks));
      console.log();
    }
    for (const path of deleted) {
      console.log(colorEnabled ? `\x1b[31m✗ ${path} (deleted)\x1b[0m` : `✗ ${path} (deleted)`);
    }
    for (const path of excluded) {
      console.log(colorEnabled ? `\x1b[2m⊘ ${path} (excluded)\x1b[0m` : `⊘ ${path} (excluded)`);
    }
    for (const r of renamed) {
      console.log(colorEnabled ? `\x1b[2m↷ ${r.from} → ${r.to} (renamed)\x1b[0m` : `↷ ${r.from} → ${r.to} (renamed)`);
    }
    return;
  }
  const toViewerInput = (a: Analysis): ViewerInput => ({
    threshold: a.model.threshold,
    files: a.model.files.map((f) => ({ ...f, source: a.sources.get(f.file) ?? "" })),
    deleted: a.deleted,
    excluded: a.excluded,
    renamed: a.renamed,
    testFilePatterns: a.config.testFilePatterns,
    config: a.config,
    configSource: findConfigPath(cwd),
  });
  await serveViewer(
    toViewerInput(initial),
    { port: opts.port, open: opts.open, theme: initial.config.theme, themePinned: opts.theme !== null },
    async () => toViewerInput(await runAnalysis()),
  );
}

main().catch((err) => {
  console.error(`lens: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
