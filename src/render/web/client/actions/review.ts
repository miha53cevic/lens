// The review pill: mark the open file or change viewed and move on to the next one.

import { getState } from '../store.ts';
import { fileProgress, unitProgress } from '../model/progress.ts';
import { currentUnit, listModel } from '../model/summaryList.ts';
import { openFile, stepFile } from './tabs.ts';
import { openSummaryUnit, stepSummary } from './summary.ts';
import { toggleFileViewed, toggleUnitViewed } from './viewed.ts';

/** "Viewed · next file": the open file is marked viewed, and the next one not viewed yet opens (the last one stays). */
export function viewedNextFile(): void {
  const state = getState();
  if (!fileProgress(state).currentDone) toggleFileViewed(state.active);
  const next = fileProgress(getState()).next;
  if (typeof next === 'number') openFile(next);
}

/** The next file not viewed yet, or simply the next file when none after it is (stopping at the last). */
export function nextFile(): void {
  const next = fileProgress(getState()).next;
  if (typeof next === 'number') openFile(next);
  else stepFile(1);
}

/** "Reviewed · next change": the open change is marked viewed, and the next one not viewed yet opens (the last one stays). */
export function reviewedNextUnit(): void {
  if (!unitProgress(getState())?.currentDone) toggleUnitViewed(currentUnit(getState()));
  const next = unitProgress(getState())?.next;
  if (typeof next === 'string') openSummaryUnit(next);
}

/** The next change not reviewed yet (from the overview: the first), or simply the next one (stopping at the last). */
export function nextUnit(): void {
  const next = unitProgress(getState())?.next;
  if (typeof next === 'string') openSummaryUnit(next);
  else stepSummary(1);
}

/** From the overview: the first change not reviewed yet, or the first change. */
export function startReview(): void {
  const state = getState();
  const progress = unitProgress(state);
  const first = typeof progress?.next === 'string' ? progress.next : listModel(state)?.order[0];
  if (first) openSummaryUnit(first);
}
