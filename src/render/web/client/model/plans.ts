// What the code shows: the folds' open state, and the row plans for a file and a unit.

import type { FoldRegion } from '../../../../model.ts';
import type { ViewUnit } from '../../../../summary/view.ts';
import type { LensState } from '../store.ts';
import { memo, type ViewFile } from '../shared.ts';
import { type CodeItem, fileSpans, planCode, type RemovedLine, unitSpans } from '../rows.ts';
import { currentUnit, summaryPage } from './summaryList.ts';

/** "category|path:startLine" — a fold chip resets its category's one-by-one folds by the prefix. */
export function regionKey(path: string, region: FoldRegion): string {
  return region.category + '|' + path + ':' + region.startLine;
}

export function isRegionOpen(
  state: Pick<LensState, 'foldOverrides' | 'openCats'>,
  path: string,
  region: FoldRegion,
): boolean {
  return state.foldOverrides.get(regionKey(path, region)) ?? state.openCats.has(region.category);
}

/** The regions a plan shows as folds. */
export function planRegions(items: CodeItem[]): FoldRegion[] {
  return items.flatMap((item) => (item.kind === 'region' ? [item.region] : []));
}

export interface FilePlan {
  items: CodeItem[];
}

const buildFilePlan = memo(
  (file: ViewFile, hunksOnly: boolean, expanded: ReadonlySet<string>, showRemoved: boolean): FilePlan => {
    // Old-side lines the diff removed, keyed by the new-side line they follow.
    const removedAfter = new Map<number, RemovedLine[]>();
    if (showRemoved) {
      for (const block of file.removals || []) {
        const existing = removedAfter.get(block.afterLine) || [];
        const lines = block.lines.map((text, offset) => ({ text, old: block.oldStart + offset }));
        removedAfter.set(block.afterLine, existing.concat(lines));
      }
    }
    const spans = fileSpans(file, hunksOnly, expanded);
    return { items: planCode(spans, file.regions, (afterLine) => removedAfter.get(afterLine) || []) };
  },
);

export function filePlan(state: LensState, file: ViewFile): FilePlan {
  return buildFilePlan(file, state.hunksOnly, state.expandedGaps, state.showRemoved);
}

/** The open file, unless there's none. */
export function activeFile(state: LensState): ViewFile | null {
  return state.data.files[state.active] ?? null;
}

export interface UnitPlan {
  file: ViewFile | null;
  items: CodeItem[];
  gutter: number;
}

const buildUnitPlan = memo(
  (
    unit: ViewUnit,
    file: ViewFile | null,
    hunksOnly: boolean,
    expanded: ReadonlySet<string>,
    showRemoved: boolean,
  ): UnitPlan => {
    const lastOldLines = unit.removals.map((block) => block.oldStart + block.lines.length);
    const gutter = String(Math.max(file ? file.lineCount : 0, ...lastOldLines)).length;
    // a deleted unit is nothing but removed lines: they show even with removed lines hidden
    const show = showRemoved || !file || unit.ranges.length === 0;
    // each removed block carries its display anchor (computed by the server)
    const removedAt = (afterLine: number) =>
      !show
        ? []
        : unit.removals
            .filter((block) => block.anchor === afterLine)
            .flatMap((block) => block.lines.map((text, offset) => ({ text, old: block.oldStart + offset })));
    const regions = file ? file.regions : [];
    const spans = file ? unitSpans(unit, regions, hunksOnly, expanded) : [];
    return { file, items: planCode(spans, regions, removedAt), gutter };
  },
);

export function unitFile(state: LensState, unit: ViewUnit): ViewFile | null {
  return state.data.files.find((file) => file.file === unit.displayFile) ?? null;
}

export function unitPlan(state: LensState, unit: ViewUnit): UnitPlan {
  return buildUnitPlan(unit, unitFile(state, unit), state.hunksOnly, state.expandedGaps, state.showRemoved);
}

// memoized, one per source: a selector gets the same array back while the code stays the same
const fileCategories = memo((regions: FoldRegion[]) => [...new Set(regions.map((region) => region.category))]);
const unitCategories = memo((items: CodeItem[]) => [...new Set(planRegions(items).map((region) => region.category))]);

/** The categories that fold in the code on screen (the fold chips): the open file's, or the open unit's code's. */
export function foldCategories(state: LensState): string[] {
  if (state.view === 'code') {
    const file = activeFile(state);
    return file ? fileCategories(file.regions) : [];
  }
  const unit = summaryPage(state) === 'unit' ? currentUnit(state) : null;
  return unit ? unitCategories(unitPlan(state, unit).items) : [];
}
