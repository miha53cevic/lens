// Folds: one by one, by category (the fold chips), all at once.

import type { FoldRegion } from '../../cli-app/model.ts';
import { commit, type LensState, toggled, update } from '../store.ts';
import { activeFile, isRegionOpen, planRegions, regionKey, unitPlan } from '../model/plans.ts';
import { currentUnit } from '../model/summaryList.ts';

export function toggleRegion(path: string, region: FoldRegion): void {
  update((state) => {
    const foldOverrides = new Map(state.foldOverrides);
    foldOverrides.set(regionKey(path, region), !isRegionOpen(state, path, region));
    return { foldOverrides };
  });
}

/** A fold chip: every region of the category opens (or folds) again, one-by-one choices included. */
export function setCategoryOpen(category: string, open: boolean): void {
  update((state) => ({
    openCats: toggled(state.openCats, category, open),
    foldOverrides: new Map([...state.foldOverrides].filter(([key]) => !key.startsWith(category + '|'))),
  }));
}

/** The folds on screen: the code view's file, or the open unit's code. */
export function foldScope(state: LensState): { path: string; regions: FoldRegion[] } | null {
  if (state.view === 'code') {
    const file = activeFile(state);
    return file ? { path: file.file, regions: file.regions } : null;
  }
  const unit = currentUnit(state);
  return unit ? { path: unit.displayFile, regions: planRegions(unitPlan(state, unit).items) } : null;
}

// expand/collapse all keep the category chips in sync with the regions
export function expandAll(): void {
  update((state) => {
    const scope = foldScope(state);
    if (!scope) return {};
    const openCats = new Set(state.openCats);
    for (const region of scope.regions) openCats.add(region.category);
    const inScope = '|' + scope.path + ':';
    return { openCats, foldOverrides: new Map([...state.foldOverrides].filter(([key]) => !key.includes(inScope))) };
  });
}

export function collapseAll(): void {
  update({ openCats: new Set(), foldOverrides: new Map() });
}

/** The fold around a row on screen opens (a jump or a cite lands inside it). */
export function openFoldAround(row: HTMLElement, path: string) {
  // full units: the closed stretch of the file it's in opens first
  const context = row.closest<HTMLElement>('.context:not(.open)');
  if (context?.dataset.key) toggleContext(context.dataset.key);
  const fold = row.closest<HTMLElement>('.region');
  const startLine = Number(fold?.querySelector<HTMLElement>('.row[data-line]')?.dataset.line);
  if (!fold || !startLine || fold.classList.contains('open')) return;
  commit((state) => {
    const foldOverrides = new Map(state.foldOverrides);
    foldOverrides.set(fold.dataset.cat + '|' + path + ':' + startLine, true);
    return { foldOverrides };
  });
}

export function expandGap(gapKey: string): void {
  update((state) => ({ expandedGaps: toggled(state.expandedGaps, gapKey, true) }));
}

/** Full units: the stretch of the file above or below the unit opens, or closes (model/plans.ts). */
export function toggleContext(key: string): void {
  commit((state) => ({ expandedGaps: toggled(state.expandedGaps, key) }));
}
