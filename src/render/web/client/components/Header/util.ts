import type { LensState } from '../../store.ts';
import { memo } from '../../shared.ts';

const lowestScores = memo((files: LensState['data']['files']) => {
  const lowest = new Map<string, number>();
  for (const file of files) {
    for (const region of file.regions) {
      lowest.set(region.category, Math.min(lowest.get(region.category) ?? 99, region.score));
    }
  }
  return lowest;
});

/** What the fold level folds in this run: "Level 1 folds import, guard, logging." */
export function foldLevelHint(state: LensState): string {
  if (state.threshold < 0) return 'Nothing folds: the plain file.';
  const folded = [...lowestScores(state.data.files)]
    .filter(([, score]) => score <= state.threshold)
    .map(([category]) => category);
  return folded.length > 0
    ? 'Level ' + state.threshold + ' folds ' + folded.join(', ') + '.'
    : 'Nothing folds at level ' + state.threshold + ' in this run.';
}

/** A view setting is away from its default: the ⋯ button shows a dot. */
export function viewSettingsChanged(state: LensState): boolean {
  return state.threshold !== state.data.config.threshold || !state.hunksOnly || !state.showRemoved || !state.hideTests;
}
