import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { gitDiffTargets, gitRoot, readBlob, runGit, type DiffTarget, type RenamedFile } from "../git.ts";
import { resolvePr } from "../pr.ts";
import { compilePatterns, matchesAny } from "../glob.ts";
import { extractUnits, checkCoverage, type Unit, type UnitFileInput } from "./units.ts";
import type { LensConfig } from "../model.ts";

export interface LoadedDiff {
  root: string;
  /** Arguments actually passed to git diff (PR mode: [mergeBase, head]) */
  diffArgs: string[];
  /** PR mode: "owner/repo#N" */
  label: string | null;
  /** Changed files, excluded ones already dropped */
  targets: DiffTarget[];
  /** Repo-relative paths of changed files skipped via exclude patterns */
  excluded: string[];
  /** Absolute paths of deleted files */
  deleted: string[];
  /** Absolute path → old blob SHA, for deleted files */
  deletedBlobs: Map<string, string>;
  renamed: RenamedFile[];
}

/**
 * Runs the diff for `lens diff <args>` / `lens pr <ref>`. PR mode fetches, so
 * re-running picks up new pushes. Excluded files are dropped before anything
 * reads them, but listed.
 */
export async function loadDiff(command: "diff" | "pr", args: string[], cwd: string, config: LensConfig): Promise<LoadedDiff> {
  let diffArgs = args;
  let label: string | null = null;
  if (command === "pr") {
    const pr = await resolvePr(args[0], cwd);
    diffArgs = pr.diffArgs;
    label = pr.label;
  }
  const root = gitRoot(cwd);
  const result = gitDiffTargets(diffArgs, cwd);
  const excludeRegexes = compilePatterns(config.exclude);
  const excluded: string[] = [];
  const targets = result.targets.filter((t) => {
    const display = relative(cwd, t.file) || t.file;
    if (matchesAny(display, excludeRegexes)) { excluded.push(display); return false; }
    return true;
  });
  return {
    root, diffArgs, label, targets, excluded,
    deleted: result.deleted,
    deletedBlobs: result.deletedBlobs,
    renamed: result.renamed,
  };
}

/** New-side content of a changed file: from git for ref diffs, from disk for the working tree. */
export function readNewSource(target: Pick<DiffTarget, "file" | "newBlob">, cwd: string): string {
  return target.newBlob !== undefined ? readBlob(target.newBlob, cwd) : readFileSync(target.file, "utf8");
}

/**
 * Units for every changed file of the diff, with repo-relative ids. Throws if
 * the one-unit-per-line invariant breaks — that's a lens bug, never silent.
 */
export async function collectUnits(
  diff: LoadedDiff,
  config: LensConfig,
  cwd: string,
  sources?: Map<string, string>,
): Promise<Unit[]> {
  const excludeRegexes = compilePatterns(config.exclude);
  const testRegexes = compilePatterns(config.testFilePatterns);
  const inputs: UnitFileInput[] = [];
  // Patterns match the path as lens shows it (relative to where it runs),
  // like loadDiff's exclude check and the viewer's "hide tests".
  const shown = (abs: string) => relative(cwd, abs) || abs;
  for (const t of diff.targets) {
    const file = relative(diff.root, t.file);
    inputs.push({
      file,
      newSource: sources?.get(t.file) ?? readNewSource(t, cwd),
      oldSource: t.oldBlob ? readBlob(t.oldBlob, cwd) : null,
      changedLines: t.changedLines,
      removals: t.removals,
      isTest: matchesAny(shown(t.file), testRegexes),
    });
  }
  for (const abs of diff.deleted) {
    const file = relative(diff.root, abs);
    if (matchesAny(shown(abs), excludeRegexes)) continue;
    const blob = diff.deletedBlobs.get(abs);
    inputs.push({
      file,
      newSource: null,
      oldSource: blob ? readBlob(blob, cwd) : null,
      changedLines: [],
      removals: [],
      isTest: matchesAny(shown(abs), testRegexes),
    });
  }
  const units: Unit[] = [];
  for (const input of inputs) {
    const fileUnits = await extractUnits(input);
    const problems = checkCoverage(input, fileUnits);
    if (problems.length > 0) throw new Error(`summary units are inconsistent (a lens bug): ${problems[0]}`);
    units.push(...fileUnits);
  }
  return units;
}

/** Commit subjects + bodies in the diffed range, when the args name one. */
export function commitLog(diffArgs: string[], cwd: string): string {
  const end = diffArgs.indexOf("--");
  const revs = (end === -1 ? diffArgs : diffArgs.slice(0, end)).filter((a) => !a.startsWith("-"));
  let range: string | null = null;
  if (revs.length === 2) range = `${revs[0]}..${revs[1]}`;
  else if (revs.length === 1 && revs[0].includes("..")) range = revs[0].replace("...", "..");
  else if (revs.length === 1) range = `${revs[0]}..HEAD`;
  if (!range) return "";
  try {
    return runGit(["log", "--no-merges", "--format=- %s%n%b", "--max-count=50", range], cwd).replace(/\n{3,}/g, "\n\n").trim();
  } catch {
    return "";
  }
}
