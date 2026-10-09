// How far the review got: the files viewed (Code tab) and the changes reviewed (Summary tab),
// and which one is next. The progress rings and the review pill show it.

import type { LensState } from '../store.ts';
import { fileViewKey, isTestFile, memo } from '../shared.ts';
import { unitViewKey } from './signals.ts';
import { listModel } from './summaryList.ts';
import { treeModel } from './tree.ts';

export interface Progress {
  done: number;
  total: number;
  /** The open file or change is viewed */
  currentDone: boolean;
  /** The next one not viewed after the open one (wrapping around), or null when all are */
  next: number | string | null;
}

/** The first not-yet-viewed entry after `current` in `order`, wrapping around; null when there's none. */
function nextNotDone<T>(order: T[], current: T | null, isDone: (entry: T) => boolean): T | null {
  const at = current === null ? -1 : order.indexOf(current);
  for (let step = 1; step <= order.length; step++) {
    const entry = order[(at + step) % order.length];
    if (entry !== current && !isDone(entry)) return entry;
  }
  return null;
}

const buildFileProgress = memo(
  (
    files: LensState['data']['files'],
    hideTests: boolean,
    treeOrder: number[],
    viewedFiles: ReadonlySet<string>,
    active: number,
  ): Progress => {
    const isViewed = (fileIndex: number) => viewedFiles.has(fileViewKey(files[fileIndex]));
    const counted = files
      .map((_, fileIndex) => fileIndex)
      .filter((fileIndex) => !(hideTests && isTestFile(files[fileIndex].file)));
    // the tree's order first; files in closed folders after it
    const order = [...treeOrder, ...counted.filter((fileIndex) => !treeOrder.includes(fileIndex))];
    return {
      done: counted.filter(isViewed).length,
      total: counted.length,
      currentDone: active >= 0 && isViewed(active),
      next: nextNotDone(order, active >= 0 ? active : null, isViewed),
    };
  },
);

/** The Code tab: the files viewed, of those the tree lists (hide tests applies). */
export function fileProgress(state: LensState): Progress {
  return buildFileProgress(state.data.files, state.hideTests, treeModel(state).order, state.viewedFiles, state.active);
}

const buildUnitProgress = memo(
  (list: NonNullable<ReturnType<typeof listModel>>, viewedUnits: ReadonlySet<string>, current: string | null) => {
    const byId = new Map(list.units.map((unit) => [unit.id, unit]));
    const isViewed = (unitId: string) => {
      const unit = byId.get(unitId);
      return !!unit && viewedUnits.has(unitViewKey(unit));
    };
    const progress: Progress = {
      done: list.units.filter((unit) => viewedUnits.has(unitViewKey(unit))).length,
      total: list.units.length,
      currentDone: current !== null && isViewed(current),
      next: nextNotDone(list.order, current, isViewed),
    };
    return progress;
  },
);

/** The Summary tab: the changes reviewed (marked viewed), of those the list shows. */
export function unitProgress(state: LensState): Progress | null {
  const list = listModel(state);
  if (!list) return null;
  return buildUnitProgress(list, state.viewedUnits, state.summaryOverview ? null : list.activeId);
}
