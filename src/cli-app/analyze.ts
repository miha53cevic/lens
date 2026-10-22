import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { analyzeSource } from "./classify/index.ts";
import { findConfigPath } from "./config.ts";
import { changeFingerprint, type DiffTarget } from "./git.ts";
import { languageForFile } from "./parse/parser.ts";
import type { ViewerInput } from "./render/web/server.ts";
import { compilePatterns, matchesAny } from "./glob.ts";
import { relPath } from "./paths.ts";
import type { FileFoldModel, LensConfig } from "./model.ts";
import { loadDiff, collectUnits, type LoadedDiff } from "./summary/collect.ts";
import { summaryStamp } from "./summary/store.ts";
import { buildSummaryView, type SummaryView } from "./summary/view.ts";
import { buildPreviewsOn } from "./summary/settings.ts";

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
  // Taken before the diff is read: an edit that lands while this analysis runs then shows as a
  // change, instead of being missed. A PR has none: it moves only when it is fetched.
  const latestChange = command === "diff" ? changeFingerprint(args, cwd) : null;
  // a diff git can't run fails below, with git's own reason
  const changeStamp = latestChange ? await latestChange().catch(() => null) : null;
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

  const files: ViewerInput["files"] = [];
  for (const target of targets) {
    const source = diff ? diff.sources.get(target.file)! : readFileSync(target.file, "utf8");
    const display = shown(target.file);
    // Unsupported file types (diff mode only) are shown without folding.
    const fileModel: FileFoldModel = await analyzeSource(display, source, config)
      ?? { file: display, language: null, lineCount: source.split("\n").length, regions: [] };
    if (target.changedLines) fileModel.changedLines = target.changedLines;
    if (target.status) fileModel.status = target.status;
    if (target.removals?.length) fileModel.removals = target.removals;
    files.push({ ...fileModel, source, ...(target.newBlob ? { blob: target.newBlob } : {}) });
  }

  let summary: SummaryView | null = null;
  let latestSummary: (() => SummaryView) | null = null;
  if (diff && withSummary && command !== "paths") {
    try {
      const units = await collectUnits(diff, config, cwd);
      const { root } = diff;
      const build = () => buildSummaryView({ root, cwd, command, args, units });
      let view = build();
      // summary.json's mtime is cheap to check; rebuild only after a submit
      latestSummary = () => (summaryStamp(root, view.key) === view.stamp ? view : (view = build()));
      summary = view;
    } catch (err) {
      console.error(`lens: summary mode unavailable: ${(err as Error).message}`);
    }
  }

  return {
    root: diff ? diff.root : cwd,
    cwd,
    threshold: config.threshold,
    files,
    deleted: diff ? diff.deleted.map(shown) : [],
    excluded: diff ? diff.excluded : [],
    renamed: diff ? diff.renamed.map((r) => ({ from: shown(r.from), to: shown(r.to) })) : [],
    binary: diff ? diff.binary.map((b) => ({ file: shown(b.file), status: b.status })) : [],
    config,
    configSource: findConfigPath(cwd),
    buildPreviews: buildPreviewsOn(diff ? diff.root : cwd, config),
    label: diff ? diff.label : null,
    guessedBase: diff ? diff.guessedBase : null,
    summary,
    latestSummary,
    changeStamp,
    latestChange,
  };
}

function collectFiles(paths: string[]): string[] {
  const files: string[] = [];
  // a directory passed by name is walked even if it's one the walk would skip
  const visit = (p: string, named: boolean) => {
    const stats = statSync(p, { throwIfNoEntry: false });
    if (!stats) return; // a link to nothing
    if (stats.isDirectory()) {
      const name = basename(p);
      if (!named && (SKIP_DIRS.has(name) || name.startsWith("."))) return;
      for (const entry of readdirSync(p).sort()) visit(join(p, entry), false);
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
      visit(abs, true);
    }
  }
  // once each: `lens src/a.ts src` names a.ts twice
  return [...new Set(files)];
}
