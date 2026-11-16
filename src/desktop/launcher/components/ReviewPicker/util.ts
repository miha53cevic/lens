import type { RepoInfo } from '../../../shared/api.ts';
import { emptyTree, type ReviewChoice } from '../../../shared/choice.ts';

export type Mode = 'changes' | 'pr';
export type Range = 'worktree' | 'staged' | 'branch' | 'commits' | 'custom';

/**
 * The picked run of commits, by SHA so a new commit (the list is polled) doesn't move it: where it
 * was started, and where it reaches. The same SHA for one commit.
 */
export interface Run {
  anchor: string;
  end: string;
}

/** The run's rows in `repo.commits`, newest first; null when either end has left the list. */
export function runRows(repo: RepoInfo, run: Run | null): { newest: number; oldest: number } | null {
  if (!run) return null;
  const anchor = repo.commits.findIndex((commit) => commit.sha === run.anchor);
  const end = repo.commits.findIndex((commit) => commit.sha === run.end);
  if (anchor === -1 || end === -1) return null;
  return { newest: Math.min(anchor, end), oldest: Math.max(anchor, end) };
}

/** The commits choice for a run: empty SHAs (choiceProblem's "Pick a commit") while there is none. */
export function runChoice(repo: RepoInfo, run: Run | null): ReviewChoice {
  const rows = runRows(repo, run);
  if (!rows) return { kind: 'diff', range: 'commits', from: '', to: '', count: 0 };
  const oldest = repo.commits[rows.oldest];
  return {
    kind: 'diff',
    range: 'commits',
    from: oldest.parent ?? emptyTree(oldest.sha),
    to: repo.commits[rows.newest].sha,
    count: rows.oldest - rows.newest + 1,
  };
}

/** The run behind a commits review, when its commits are still in the list. */
export function startingRun(repo: RepoInfo, current: ReviewChoice | null): Run | null {
  if (current?.kind !== 'diff' || current.range !== 'commits') return null;
  const newest = repo.commits.findIndex((commit) => commit.sha === current.to);
  if (newest === -1) return null;
  const oldest = repo.commits.findIndex(
    (commit, index) => index >= newest && (commit.parent ?? emptyTree(commit.sha)) === current.from,
  );
  return oldest === -1 ? null : { anchor: repo.commits[oldest].sha, end: current.to };
}

/** The branches "this branch vs" can compare against: every other one, and the default base. */
export function baseOptions(repo: RepoInfo): string[] {
  const others = repo.branches.filter((branch) => branch !== repo.branch);
  return repo.base && !others.includes(repo.base) && repo.base !== repo.branch ? [repo.base, ...others] : others;
}

/** Where the picker starts: on the review behind it, else on the first choice with something in it. */
export function startingRange(repo: RepoInfo, current: ReviewChoice | null): Range {
  if (current?.kind === 'diff') return current.range;
  if (repo.changed > 0) return 'worktree';
  if (repo.staged > 0) return 'staged';
  if ((repo.ahead ?? 0) > 0 && baseOptions(repo).length > 0) return 'branch';
  // a clean branch: what there is to do is plan, from the working tree
  if (repo.planTab) return 'worktree';
  return baseOptions(repo).length > 0 ? 'branch' : 'custom';
}

/**
 * Why a range has nothing in it, by the repository's counts, or null when it may have something. The
 * CLI would refuse it anyway ("no changed supported files"): this says so before a review is opened.
 * With the Plan tab on, the CLI opens an empty working tree on that tab.
 * A branch's count is only known against the base it was asked for.
 */
export function emptyRange(repo: RepoInfo, range: Range, base: string): string | null {
  if (range === 'worktree' && repo.changed === 0 && !repo.planTab) return 'Nothing unstaged to review';
  if (range === 'staged' && repo.staged === 0) return 'Nothing staged to review';
  if (range === 'branch' && repo.base === base && repo.ahead === 0) return `This branch has no commits ${base} doesn't`;
  return null;
}
