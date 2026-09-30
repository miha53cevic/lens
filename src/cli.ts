#!/usr/bin/env node
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, resolve, relative, dirname, basename } from "node:path";
import { analyzeSource } from "./classify/index.ts";
import { loadConfig, findConfigPath } from "./config.ts";
import { readBlob, type DiffTarget } from "./git.ts";
import { parsePrRef } from "./pr.ts";
import { languageForFile } from "./parse/parser.ts";
import { isBundledTheme } from "./render/highlight.ts";
import { serveViewer, type ViewerInput } from "./render/web/server.ts";
import { compilePatterns, matchesAny } from "./glob.ts";
import type { FileFoldModel, LensConfig } from "./model.ts";
import { loadDiff, collectUnits, commitLog, readNewSource, type LoadedDiff } from "./summary/collect.ts";
import { prepareBundle } from "./summary/bundle.ts";
import { validateResult } from "./summary/validate.ts";
import { summaryKey, readStored, writeStored, summaryStamp, type Bundle } from "./summary/store.ts";
import { buildSummaryView, type SummaryView } from "./summary/view.ts";

const HELP = `lens — a reading lens for AI-generated code (static analysis, no AI)

usage:
  lens <path...>              analyze files or directories
  lens diff [git-diff-args]   analyze files changed in git diff (e.g. lens diff --staged)
  lens pr <url|N>             analyze a GitHub PR (URL, or a number on origin)
                              — run inside a clone; refresh picks up new pushes
  lens config                 print the effective config and where it comes from

summary mode (written by your own coding agent — see skills/lens-review):
  lens summary prepare [diff-args | pr <url|N>]
                              write a task bundle for the agent (.lens/summary/<key>/)
  lens summary submit <bundle-dir | result.json>
                              validate the agent's result.json and store it for the viewer

output (default: local web viewer):
  --json            print the fold model as JSON (for debugging)
  --port <n>        web viewer port (default 5326)
  --no-open         don't open the browser
  --summary         open the browser on the Summary tab (diff/PR mode)
  --threshold <n>   fold regions with score <= n (default 1; from .lens.json)
  --theme <name>    any Shiki theme for the viewer (default vesper; from .lens.json)
`;

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", "out", "coverage"]);

interface CliOptions {
  json: boolean;
  open: boolean;
  openSummary: boolean;
  port: number;
  threshold: number | null;
  theme: string | null;
}

type Command = "paths" | "diff" | "pr" | "config" | "summary";

function parseCli(argv: string[]): { command: Command; rest: string[]; opts: CliOptions } {
  const opts: CliOptions = { json: false, open: true, openSummary: false, port: 5326, threshold: null, theme: null };
  const rest: string[] = [];
  let command: Command = "paths";
  const args = [...argv];
  if (args[0] === "diff") { command = "diff"; args.shift(); }
  else if (args[0] === "pr") { command = "pr"; args.shift(); }
  else if (args[0] === "config") { command = "config"; args.shift(); }
  else if (args[0] === "summary") { command = "summary"; args.shift(); }
  while (args.length > 0) {
    const arg = args.shift()!;
    if (arg === "--json") opts.json = true;
    else if (arg === "--no-open") opts.open = false;
    else if (arg === "--summary") opts.openSummary = true;
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
    const path = findConfigPath(cwd);
    console.error(path
      ? `# effective config: built-in lens.defaults.json + ${path}`
      : "# effective config: built-in lens.defaults.json (no .lens.json found)");
    console.log(JSON.stringify(loadConfig(cwd), null, 2));
    return;
  }

  if (command === "summary") {
    await runSummary(rest, cwd);
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
    files: FileFoldModel[];
    sources: Map<string, string>;
    deleted: string[];
    excluded: string[];
    renamed: { from: string; to: string }[];
    config: LensConfig;
    /** PR mode: "owner/repo#N — title", shown in the viewer header */
    label: string | null;
    /** Diff/PR mode: the Summary tab's data (null when units couldn't be computed) */
    summary: SummaryView | null;
    reloadSummary: (() => SummaryView | null) | null;
    summaryStamp: (() => number | null) | null;
  }

  // Re-runnable so the viewer's refresh button can pick up new file contents
  // (and, in diff mode, a fresh git diff) without restarting the server.
  // withSummary: only the viewer needs summary units (--json skips the work)
  const runAnalysis = async (withSummary = true): Promise<Analysis> => {
    const config = resolveConfig();
    // Path mode carries only `file`; diff mode fills in the rest.
    let targets: (Partial<DiffTarget> & { file: string })[];
    let deleted: string[] = [];
    let renamed: { from: string; to: string }[] = [];
    const excluded: string[] = [];
    let label: string | null = null;
    let diff: LoadedDiff | null = null;
    const excludeRegexes = compilePatterns(config.exclude);
    if (command === "diff" || command === "pr") {
      // PR mode re-resolves (and re-fetches) on every run, so the viewer's
      // refresh picks up commits pushed to the PR since. Excluded files are
      // dropped BEFORE reading/tokenizing (lockfiles cost seconds of Shiki
      // time and thousands of DOM rows) but still listed.
      diff = await loadDiff(command, rest, cwd, config);
      label = diff.label;
      targets = diff.targets;
      excluded.push(...diff.excluded);
      deleted = diff.deleted.map((p) => relative(cwd, p) || p);
      renamed = diff.renamed.map((r) => ({
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
    const sourcesByPath = new Map<string, string>();
    const files: FileFoldModel[] = [];
    for (const target of targets) {
      const source = target.newBlob !== undefined ? readBlob(target.newBlob, cwd) : readFileSync(target.file, "utf8");
      sourcesByPath.set(target.file, source);
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
      files.push(fileModel);
    }

    let summary: SummaryView | null = null;
    let reloadSummary: (() => SummaryView | null) | null = null;
    let stamp: (() => number | null) | null = null;
    if (diff && withSummary) {
      try {
        const units = await collectUnits(diff, config, cwd, sourcesByPath);
        const root = diff.root;
        const view = { root, cwd, key: keyFor(command as "diff" | "pr", rest), args: hintArgs(command as "diff" | "pr", rest), units };
        reloadSummary = () => buildSummaryView(view);
        stamp = () => summaryStamp(root, view.key);
        summary = reloadSummary();
      } catch (err) {
        console.error(`lens: summary mode unavailable: ${(err as Error).message}`);
      }
    }
    return { files, sources, deleted, excluded, renamed, config, label, summary, reloadSummary, summaryStamp: stamp };
  };

  if (command === "pr" && rest.length !== 1) {
    console.error("lens: pr takes exactly one argument — a PR URL or a PR number");
    process.exit(1);
  }
  if (command !== "diff" && command !== "pr" && rest.length === 0) { console.log(HELP); process.exit(1); }
  const initial = await runAnalysis(!opts.json);
  const { files, deleted, excluded, renamed } = initial;
  if (files.length === 0 && deleted.length === 0 && excluded.length === 0 && renamed.length === 0) {
    console.error(
      command === "diff" ? "lens: no changed supported files in this diff"
      : command === "pr" ? "lens: no changed supported files in this PR"
      : "lens: no supported files found (ts, tsx, js, jsx, mjs, cjs)",
    );
    process.exit(1);
  }

  if (opts.json) {
    const model = {
      threshold: initial.config.threshold,
      files,
      ...(deleted.length > 0 ? { deleted } : {}),
      ...(excluded.length > 0 ? { excluded } : {}),
      ...(renamed.length > 0 ? { renamed } : {}),
    };
    console.log(JSON.stringify(model, null, 2));
    return;
  }
  const toViewerInput = (a: Analysis): ViewerInput => ({
    threshold: a.config.threshold,
    files: a.files.map((f) => ({ ...f, source: a.sources.get(f.file) ?? "" })),
    deleted: a.deleted,
    excluded: a.excluded,
    renamed: a.renamed,
    testFilePatterns: a.config.testFilePatterns,
    config: a.config,
    configSource: findConfigPath(cwd),
    label: a.label,
    summary: a.summary,
    reloadSummary: a.reloadSummary,
    summaryStamp: a.summaryStamp,
  });
  await serveViewer(
    toViewerInput(initial),
    { port: opts.port, open: opts.open, openSummary: opts.openSummary, theme: initial.config.theme, themePinned: opts.theme !== null },
    async () => toViewerInput(await runAnalysis()),
  );
}

/** PR keys use the number, so a URL and a bare number share one summary. */
function keyFor(command: "diff" | "pr", args: string[]): string {
  if (command === "pr") {
    const ref = parsePrRef(args[0] ?? "");
    return summaryKey("pr", [ref ? String(ref.number) : (args[0] ?? "")]);
  }
  return summaryKey("diff", args);
}

/** Arguments as the user passes them to /lens-review or `lens summary prepare`. */
function hintArgs(command: "diff" | "pr", args: string[]): string {
  return (command === "pr" ? ["pr", ...args] : args).join(" ");
}

async function runSummary(rest: string[], cwd: string): Promise<void> {
  const [sub, ...args] = rest;
  if (sub === "prepare") {
    let command: "diff" | "pr" = "diff";
    if (args[0] === "pr") { command = "pr"; args.shift(); }
    else if (args[0] === "diff") args.shift();
    if (command === "pr" && args.length !== 1) throw new Error("summary prepare pr takes one argument — a PR URL or number");
    const config = loadConfig(cwd);
    const diff = await loadDiff(command, args, cwd, config);
    const sourcesByPath = new Map(diff.targets.map((t) => [t.file, readNewSource(t, cwd)]));
    const units = await collectUnits(diff, config, cwd, sourcesByPath);
    if (units.length === 0) {
      console.log("lens: nothing to summarize — this diff has no changed text files");
      return;
    }
    const result = prepareBundle({
      root: diff.root,
      cwd,
      key: keyFor(command, args),
      command,
      args,
      label: diff.label,
      commits: commitLog(diff.diffArgs, cwd),
      units,
      sources: new Map([...sourcesByPath].map(([abs, src]) => [relative(diff.root, abs), src])),
    });
    console.log(result.instructions);
    return;
  }
  if (sub === "submit") {
    const target = args[0];
    if (!target) throw new Error("summary submit needs the bundle folder (or its result.json)");
    const abs = resolve(cwd, target);
    const dir = abs.endsWith(".json") ? dirname(abs) : abs;
    const resultFile = abs.endsWith(".json") ? abs : join(dir, "result.json");
    const bundlePath = join(dir, "bundle.json");
    if (!existsSync(bundlePath)) throw new Error(`no bundle.json in ${relative(cwd, dir) || dir} — run \`lens summary prepare\` first`);
    if (!existsSync(resultFile)) throw new Error(`no ${relative(cwd, resultFile)} — write the result there first`);
    const bundle = JSON.parse(readFileSync(bundlePath, "utf8")) as Bundle;
    let result: unknown;
    try {
      result = JSON.parse(readFileSync(resultFile, "utf8"));
    } catch (err) {
      throw new Error(`${relative(cwd, resultFile)} is not valid JSON: ${(err as Error).message}`);
    }
    // <root>/.lens/summary/<key>
    const root = resolve(dir, "..", "..", "..");
    const outcome = validateResult(bundle, result, root, readStored(root, bundle.key));
    writeStored(root, bundle.key, outcome.stored);
    const missing = bundle.units.filter((u) => !outcome.stored.units[u.id] || outcome.stored.units[u.id].hash !== u.hash);
    console.log(`lens: accepted ${outcome.accepted.length} unit${outcome.accepted.length === 1 ? "" : "s"}` +
      (outcome.acceptedFlows ? `, ${outcome.acceptedFlows} flow${outcome.acceptedFlows === 1 ? "" : "s"}` : ""));
    if (outcome.dropped.length > 0) {
      console.log(`\nrejected ${outcome.dropped.length} — fix these entries in ${basename(resultFile)} and submit again:`);
      for (const d of outcome.dropped) console.log(`  - ${d}`);
    }
    if (missing.length > 0) {
      console.log(`\n${missing.length} unit${missing.length === 1 ? " has" : "s have"} no summary yet:`);
      for (const u of missing.slice(0, 20)) console.log(`  - ${u.id}`);
      if (missing.length > 20) console.log(`  - … and ${missing.length - 20} more`);
    }
    console.log(`\nsummary saved — refresh the lens viewer (↻) and open the Summary tab`);
    const submitted = typeof result === "object" && result !== null && typeof (result as { units?: unknown }).units === "object"
      ? Object.keys((result as { units: object }).units).length : 0;
    if (outcome.accepted.length === 0 && (submitted > 0 || outcome.dropped.length > 0)) process.exitCode = 1;
    return;
  }
  throw new Error(`unknown summary subcommand "${sub ?? ""}" — use prepare or submit`);
}

main().catch((err) => {
  console.error(`lens: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
