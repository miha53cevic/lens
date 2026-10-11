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
  return 'worktree';
}
