import { readFileSync } from 'node:fs';
import { gitDiffTargets, readBlobs, runGit, type BinaryFile, type DiffTarget, type RenamedFile } from '../git.ts';
import { resolvePr } from '../pr.ts';
import { compilePatterns, matchesAny } from '../glob.ts';
import { relPath } from '../paths.ts';
import { extractUnits, checkCoverage, type Unit, type UnitFileInput } from './units.ts';
import type { LensConfig } from '../model.ts';
import type { ParseCache } from '../parse/parser.ts';

export interface LoadedDiff {
  root: string;
  /** Arguments actually passed to git diff (PR mode: [mergeBase, head]) */
  diffArgs: string[];
  /** PR mode: "owner/repo#N" */
  label: string | null;
  /** PR mode: the default branch it was diffed against, when the PR's own base is unknown (ResolvedPr) */
  guessedBase: string | null;
  /** Changed files, excluded ones already dropped */
  targets: DiffTarget[];
  /** Absolute path → new-side content, for each target */
  sources: Map<string, string>;
  /** Repo-relative paths of changed files skipped via exclude patterns */
  excluded: string[];
  /** Absolute paths of deleted files */
  deleted: string[];
  /** Absolute path → old blob SHA, for deleted files */
  deletedBlobs: Map<string, string>;
  /** Old blob SHA → text: the targets' old sides, and the deleted files' that aren't excluded */
  oldTexts: Map<string, string>;
  renamed: RenamedFile[];
  /** Changed binary files (absolute paths), the excluded ones already dropped: listed, never read */
  binary: BinaryFile[];
}

/**
 * Runs the diff for `lens diff <args>` / `lens pr <ref>`. PR mode fetches, so
 * re-running picks up new pushes. Excluded files are dropped before anything
 * reads them, but listed.
 */
export async function loadDiff(
  command: 'diff' | 'pr',
  args: string[],
  cwd: string,
  config: LensConfig,
): Promise<LoadedDiff> {
  let diffArgs = args;
  let label: string | null = null;
  let guessedBase: string | null = null;
  if (command === 'pr') {
    const pr = await resolvePr(args[0], cwd);
    diffArgs = pr.diffArgs;
    label = pr.label;
    guessedBase = pr.guessedBase;
  }
  const result = gitDiffTargets(diffArgs, cwd);
  const { root } = result;
  const excludeRegexes = compilePatterns(config.exclude);
  const excluded: string[] = [];
  const targets = result.targets.filter((t) => {
    const display = relPath(cwd, t.file);
    if (matchesAny(display, excludeRegexes)) {
      excluded.push(display);
      return false;
    }
    return true;
  });
  const binary = result.binary.filter((b) => {
    const display = relPath(cwd, b.file);
    if (matchesAny(display, excludeRegexes)) {
      excluded.push(display);
      return false;
    }
    return true;
  });
  const deletedShown = result.deleted.filter((abs) => !matchesAny(relPath(cwd, abs), excludeRegexes));
  // Every blob in one read, a git process or two however many files: the new side (from git for ref
  // diffs, from disk for the working tree), and the old side the summary's units are cut from.
  const blobs = readBlobs(
    [
      ...targets.flatMap((t) => (t.newBlob !== undefined ? [t.newBlob] : [])),
      ...targets.flatMap((t) => (t.oldBlob ? [t.oldBlob] : [])),
      ...deletedShown.flatMap((abs) => result.deletedBlobs.get(abs) ?? []),
    ],
    cwd,
  );
  const oldTexts = new Map<string, string>();
  for (const sha of [
    ...targets.flatMap((t) => (t.oldBlob ? [t.oldBlob] : [])),
    ...deletedShown.flatMap((abs) => result.deletedBlobs.get(abs) ?? []),
  ]) {
    oldTexts.set(sha, blobs.get(sha)!);
  }
  return {
    root,
    diffArgs,
    label,
    guessedBase,
    targets,
    excluded,
    sources: new Map(
      targets.map((t) => [t.file, t.newBlob !== undefined ? blobs.get(t.newBlob)! : readFileSync(t.file, 'utf8')]),
    ),
    deleted: result.deleted,
    deletedBlobs: result.deletedBlobs,
    oldTexts,
    renamed: result.renamed,
    binary,
  };
}

/** Each file's units by its repo-relative path, with the input they were cut from */
export type FileUnits = Map<string, { input: UnitFileInput; units: Unit[] }>;

export interface CollectOptions {
  parses?: ParseCache;
  /** The last analysis's units: a file whose input is the very same keeps its own */
  previous?: FileUnits;
  /** Filled with this analysis's units, for the next one */
  made?: FileUnits;
}

/** extractUnits reads nothing but its input: the same input, compared whole, makes the same units. */
function sameUnitInput(a: UnitFileInput, b: UnitFileInput): boolean {
  return (
    a.file === b.file &&
    a.newSource === b.newSource &&
    a.oldSource === b.oldSource &&
    a.isTest === b.isTest &&
    JSON.stringify([a.changedLines, a.removals]) === JSON.stringify([b.changedLines, b.removals])
  );
}

/**
 * Units for every changed file of the diff, with repo-relative ids. Throws if
 * the one-unit-per-line invariant breaks — that's a lens bug, never silent.
 */
export async function collectUnits(
  diff: LoadedDiff,
  config: LensConfig,
  cwd: string,
  { parses, previous, made }: CollectOptions = {},
): Promise<Unit[]> {
  const excludeRegexes = compilePatterns(config.exclude);
  const testRegexes = compilePatterns(config.testFilePatterns);
  const inputs: UnitFileInput[] = [];
  // Patterns match the path as lens shows it (relative to where it runs),
  // like loadDiff's exclude check and the viewer's "hide tests".
  const shown = (abs: string) => relPath(cwd, abs);
  const deleted = diff.deleted.filter((abs) => !matchesAny(shown(abs), excludeRegexes));
  const oldBlobs = diff.oldTexts;
  for (const t of diff.targets) {
    const file = relPath(diff.root, t.file);
    inputs.push({
      file,
      newSource: diff.sources.get(t.file)!,
      oldSource: t.oldBlob ? oldBlobs.get(t.oldBlob)! : null,
      changedLines: t.changedLines,
      removals: t.removals,
      isTest: matchesAny(shown(t.file), testRegexes),
    });
  }
  for (const abs of deleted) {
    const file = relPath(diff.root, abs);
    const blob = diff.deletedBlobs.get(abs);
    inputs.push({
      file,
      newSource: null,
      oldSource: blob ? oldBlobs.get(blob)! : null,
      changedLines: [],
      removals: [],
      isTest: matchesAny(shown(abs), testRegexes),
    });
  }
  const units: Unit[] = [];
  for (const input of inputs) {
    const kept = previous?.get(input.file);
    const fileUnits = kept && sameUnitInput(kept.input, input) ? kept.units : await extractUnits(input, parses);
    made?.set(input.file, { input, units: fileUnits });
    const problems = checkCoverage(input, fileUnits);
    if (problems.length > 0) throw new Error(`summary units are inconsistent (a lens bug): ${problems[0]}`);
    units.push(...fileUnits);
  }
  return units;
}

/** Commit subjects + bodies in the diffed range, when the args name one. */
export function commitLog(diffArgs: string[], cwd: string): string {
  const end = diffArgs.indexOf('--');
  const revs = (end === -1 ? diffArgs : diffArgs.slice(0, end)).filter((a) => !a.startsWith('-'));
  let range: string | null = null;
  if (revs.length === 2) range = `${revs[0]}..${revs[1]}`;
  else if (revs.length === 1 && revs[0].includes('..')) range = revs[0].replace('...', '..');
  else if (revs.length === 1) range = `${revs[0]}..HEAD`;
  if (!range) return '';
  try {
    return runGit(['log', '--no-merges', '--format=- %s%n%b', '--max-count=50', range], cwd)
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  } catch {
    return '';
  }
}
