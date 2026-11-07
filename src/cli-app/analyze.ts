import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { basename, join, resolve } from 'node:path';
import { analyzeSource } from './classify/index.ts';
import { findConfigPath, readConfig } from './config.ts';
import { changeFingerprint, type DiffTarget } from './git.ts';
import { dropParses, languageForFile, type ParseCache } from './parse/parser.ts';
import type { ViewerInput } from './render/web/server.ts';
import { compilePatterns, matchesAny } from './glob.ts';
import { relPath } from './paths.ts';
import type { FileFoldModel, LensConfig } from './model.ts';
import { loadDiff, collectUnits, type FileUnits, type LoadedDiff } from './summary/collect.ts';
import { reviewKey, summaryStamp } from './summary/store.ts';
import { buildSummaryView, type SummaryView } from './summary/view.ts';
import { buildPreviewsOn, planTabOn, selfChecksOn, timingsOn } from './summary/settings.ts';
import { record, timed } from './timings.ts';

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'out', 'coverage']);

export type AnalyzeCommand = 'paths' | 'diff' | 'pr';

/**
 * What an analysis made of each file, for the next analysis of the same review (a ↻ refresh): under
 * the same config, a file whose path and text are the same keeps its folds, and one whose diff is
 * the same too keeps its units, instead of being parsed again. Compared whole, not by a hash. Kept
 * by the analysis's files array, which the server keeps as the analysis's identity.
 */
interface Made {
  config: string;
  folds: Map<string, { source: string; model: FileFoldModel }>;
  units: FileUnits;
}
const madeBy = new WeakMap<ViewerInput['files'], Made>();

export interface AnalyzeOptions {
  /** Only the viewer needs summary units (--json skips the work); on by default */
  withSummary?: boolean;
  /** The last analysis of the same review: what it made of a file that didn't change is kept */
  previous?: ViewerInput;
}

/**
 * Everything the viewer shows for `lens <paths>` / `lens diff` / `lens pr`.
 * Re-runnable, so the viewer's refresh picks up new file contents, a fresh git
 * diff (PR mode re-fetches) and .lens.json edits without restarting.
 */
export async function analyze(
  command: AnalyzeCommand,
  args: string[],
  cwd: string,
  config: LensConfig,
  { withSummary = true, previous }: AnalyzeOptions = {},
): Promise<ViewerInput> {
  const configKey = JSON.stringify(config);
  const before = previous && madeBy.get(previous.files);
  const made: Made = { config: configKey, folds: new Map(), units: new Map() };
  // the summary's units parse the same new sides the folds do: each is parsed once
  const parses: ParseCache = new Map();
  try {
    const input = await analyzeWith(parses, command, args, cwd, config, {
      withSummary,
      before: before?.config === configKey ? before : undefined,
      made,
    });
    madeBy.set(input.files, made);
    return input;
  } finally {
    dropParses(parses);
  }
}

async function analyzeWith(
  parses: ParseCache,
  command: AnalyzeCommand,
  args: string[],
  cwd: string,
  config: LensConfig,
  { withSummary, before, made }: { withSummary: boolean; before: Made | undefined; made: Made },
): Promise<ViewerInput> {
  const shown = (abs: string) => relPath(cwd, abs);
  // Path mode carries only `file`; diff mode fills in the rest.
  let targets: (Partial<DiffTarget> & { file: string })[];
  let diff: LoadedDiff | null = null;
  // Taken before the diff is read: an edit that lands while this analysis runs then shows as a
  // change, instead of being missed. A PR has none: it moves only when it is fetched.
  const latestChange = command === 'diff' ? changeFingerprint(args, cwd) : null;
  // a diff git can't run fails below, with git's own reason
  const changeStamp = latestChange ? await timed('cli', 'fingerprint', () => latestChange().catch(() => null)) : null;
  if (command === 'paths') {
    // Directory walks skip excluded files silently; a file passed explicitly
    // on the command line is always analyzed.
    const excludeRegexes = compilePatterns(config.exclude);
    targets = collectFiles(args)
      .filter((file) => args.some((a) => resolve(a) === file) || !matchesAny(shown(file), excludeRegexes))
      .map((file) => ({ file }));
  } else {
    // Excluded files are dropped BEFORE reading/tokenizing (lockfiles cost
    // seconds of Shiki time and thousands of DOM rows) but still listed.
    diff = await timed('cli', 'diff', () => loadDiff(command, args, cwd, config));
    targets = diff.targets;
  }

  const files: ViewerInput['files'] = [];
  const foldsStart = performance.now();
  let foldsMade = 0;
  for (const target of targets) {
    const source = diff ? diff.sources.get(target.file)! : readFileSync(target.file, 'utf8');
    const display = shown(target.file);
    const kept = before?.folds.get(display);
    const analyzed =
      kept?.source === source ? kept.model : (foldsMade++, await analyzeSource(display, source, config, parses));
    if (analyzed) made.folds.set(display, { source, model: analyzed });
    // Unsupported file types (diff mode only) are shown without folding.
    const fileModel: FileFoldModel = (analyzed && { ...analyzed }) ?? {
      file: display,
      language: null,
      lineCount: source.split('\n').length,
      regions: [],
    };
    if (target.changedLines) fileModel.changedLines = target.changedLines;
    if (target.status) fileModel.status = target.status;
    if (target.removals?.length) fileModel.removals = target.removals;
    files.push({ ...fileModel, source, ...(target.newBlob ? { blob: target.newBlob } : {}) });
  }
  record(
    'cli',
    'folds',
    performance.now() - foldsStart,
    `${foldsMade} of ${targets.length} files analyzed (the rest kept)`,
  );
  // A deleted file opens too: no lines of its own, and the whole of its old text one removed block.
  // Not one the config excludes (its text isn't wanted), nor a binary one (it has none to show).
  const openedDeleted = new Set<string>();
  if (diff) {
    const excludeRegexes = compilePatterns(config.exclude);
    const binaries = new Set(diff.binary.map((b) => b.file));
    const wanted = diff.deleted.filter(
      (abs) => diff.deletedBlobs.has(abs) && !binaries.has(abs) && !matchesAny(shown(abs), excludeRegexes),
    );
    for (const abs of wanted) {
      const text = diff.oldTexts.get(diff.deletedBlobs.get(abs)!)!;
      if (text.includes('\0')) continue; // a binary git didn't call one
      const display = shown(abs);
      const lines = text.replace(/\r?\n$/, '').split(/\r?\n/);
      // classified as an empty file: the language for the colors, no folds
      const fileModel: FileFoldModel = (await analyzeSource(display, '', config)) ?? {
        file: display,
        language: null,
        lineCount: 0,
        regions: [],
      };
      files.push({
        ...fileModel,
        regions: [],
        lineCount: 0,
        source: '',
        status: 'deleted',
        changedLines: [],
        removals: [{ afterLine: 0, oldStart: 1, lines }],
      });
      openedDeleted.add(display);
    }
  }

  let summary: SummaryView | null = null;
  let latestSummary: (() => SummaryView) | null = null;
  if (diff && withSummary && command !== 'paths') {
    try {
      const units = await timed('cli', 'units', () =>
        collectUnits(diff!, config, cwd, { parses, previous: before?.units, made: made.units }),
      );
      const { root } = diff;
      const build = () => buildSummaryView({ root, cwd, command, args, units });
      let view = timed('cli', 'summary view', build);
      // rebuilt only after a submit (summary.json's mtime), or on another branch: a diff's key names
      // the branch, and what must be checked out first is measured from HEAD (checkoutFirst)
      latestSummary = () => {
        const key = reviewKey(root, command, args);
        return key === view.key && summaryStamp(root, key) === view.stamp ? view : (view = build());
      };
      summary = view;
    } catch (err) {
      console.error(`lens: summary mode unavailable: ${(err as Error).message}`);
    }
  }

  const root = diff ? diff.root : cwd;
  return {
    root,
    cwd,
    review: reviewKey(root, command, args),
    files,
    deleted: diff ? diff.deleted.map(shown).filter((path) => !openedDeleted.has(path)) : [],
    excluded: diff ? diff.excluded : [],
    renamed: diff ? diff.renamed.map((r) => ({ from: shown(r.from), to: shown(r.to) })) : [],
    binary: diff ? diff.binary.map((b) => ({ file: shown(b.file), status: b.status })) : [],
    config,
    configSource: findConfigPath(cwd),
    // read again from the file: the analysis may run on a config that isn't it (a flag over it, a test's)
    configProblems: readConfig(cwd).problems,
    buildPreviews: buildPreviewsOn(root, config),
    selfChecks: selfChecksOn(root, config),
    planTab: planTabOn(root, config),
    timings: timingsOn(root, config),
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
      if (!named && (SKIP_DIRS.has(name) || name.startsWith('.'))) return;
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
