import type { RepoInfo } from '../../../shared/api.ts';
import type { ReviewChoice } from '../../../shared/choice.ts';

export type Mode = 'changes' | 'pr';
export type Range = 'worktree' | 'staged' | 'branch' | 'custom';

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
  return baseOptions(repo).length > 0 ? 'branch' : 'custom';
}

/**
 * Why a range has nothing in it, by the repository's counts, or null when it may have something. The
 * CLI would refuse it anyway ("no changed supported files"): this says so before a review is opened.
 * A branch's count is only known against the base it was asked for.
 */
export function emptyRange(repo: RepoInfo, range: Range, base: string): string | null {
  if (range === 'worktree' && repo.changed === 0) return 'Nothing unstaged to review';
  if (range === 'staged' && repo.staged === 0) return 'Nothing staged to review';
  if (range === 'branch' && repo.base === base && repo.ahead === 0) return `This branch has no commits ${base} doesn't`;
  return null;
}
