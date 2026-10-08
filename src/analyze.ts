import { readdirSync, statSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { analyzeSource } from "./classify/index.ts";
import { findConfigPath } from "./config.ts";
import type { DiffTarget } from "./git.ts";
import { languageForFile } from "./parse/parser.ts";
import type { ViewerInput } from "./render/web/server.ts";
import { compilePatterns, matchesAny } from "./glob.ts";
import { relPath } from "./paths.ts";
import type { FileFoldModel, LensConfig } from "./model.ts";
import { loadDiff, collectUnits, readNewSource, type LoadedDiff } from "./summary/collect.ts";
import { summaryKey, summaryStamp } from "./summary/store.ts";
import { buildSummaryView, type SummaryView } from "./summary/view.ts";

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", "out", "coverage"]);

export type AnalyzeCommand = "paths" | "diff" | "pr";

/**
 * Everything the viewer shows for `lens <paths>` / `lens diff` / `lens pr`.
 * Re-runnable, so the viewer's refresh picks up new file contents, a fresh git
 * diff (PR mode re-fetches) and .lens.json edits without restarting.
 * withSummary: only the viewer needs summary units (--json skips the work).
 */
export async function analyze(
  command: AnalyzeCommand,
  args: string[],
  cwd: string,
  config: LensConfig,
  withSummary = true,
): Promise<ViewerInput> {
  const shown = (abs: string) => relPath(cwd, abs);
  // Path mode carries only `file`; diff mode fills in the rest.
  let targets: (Partial<DiffTarget> & { file: string })[];
  let diff: LoadedDiff | null = null;
  if (command === "paths") {
    // Directory walks skip excluded files silently; a file passed explicitly
    // on the command line is always analyzed.
    const excludeRegexes = compilePatterns(config.exclude);
    targets = collectFiles(args)
      .filter((file) => args.some((a) => resolve(a) === file) || !matchesAny(shown(file), excludeRegexes))
      .map((file) => ({ file }));
  } else {
    // Excluded files are dropped BEFORE reading/tokenizing (lockfiles cost
    // seconds of Shiki time and thousands of DOM rows) but still listed.
    diff = await loadDiff(command, args, cwd, config);
    targets = diff.targets;
  }

  const sourcesByPath = new Map<string, string>();
  const files: ViewerInput["files"] = [];
  for (const target of targets) {
    const source = readNewSource(target, cwd);
    sourcesByPath.set(target.file, source);
    const display = shown(target.file);
    // Unsupported file types (diff mode only) are shown without folding.
    const fileModel: FileFoldModel | null = languageForFile(target.file)
      ? await analyzeSource(display, source, config)
      : { file: display, language: null, lineCount: source.split("\n").length, regions: [] };
    if (!fileModel) continue;
    if (target.changedLines) fileModel.changedLines = target.changedLines;
    if (target.status) fileModel.status = target.status;
    if (target.removals?.length) fileModel.removals = target.removals;
    files.push({ ...fileModel, source });
  }

  let summary: SummaryView | null = null;
  let reloadSummary: (() => SummaryView | null) | null = null;
  let stamp: (() => number | null) | null = null;
  if (diff && withSummary && command !== "paths") {
    try {
      const units = await collectUnits(diff, config, cwd, sourcesByPath);
      const { root } = diff;
      const key = summaryKey(command, args);
      reloadSummary = () => buildSummaryView({ root, cwd, command, args, units });
      stamp = () => summaryStamp(root, key);
      summary = reloadSummary();
    } catch (err) {
      console.error(`lens: summary mode unavailable: ${(err as Error).message}`);
    }
  }

  return {
    threshold: config.threshold,
    files,
    deleted: diff ? diff.deleted.map(shown) : [],
    excluded: diff ? diff.excluded : [],
    renamed: diff ? diff.renamed.map((r) => ({ from: shown(r.from), to: shown(r.to) })) : [],
    testFilePatterns: config.testFilePatterns,
    config,
    configSource: findConfigPath(cwd),
    label: diff ? diff.label : null,
    summary,
    reloadSummary,
    summaryStamp: stamp,
  };
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
    if (!existsSync(abs)) throw new Error(`no such file or directory: ${p}`);
    if (statSync(abs).isFile()) {
      if (!languageForFile(abs)) console.error(`lens: skipping unsupported file ${p}`);
      else files.push(abs);
    } else {
      visit(abs);
    }
  }
  return files;
}
