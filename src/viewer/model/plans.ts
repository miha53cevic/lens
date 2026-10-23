// What the code shows: the folds' open state, and the row plans for a file and a unit.

import type { FoldRegion, RemovedBlock } from '../../cli-app/model.ts';
import type { ViewUnit } from '../../cli-app/summary/view.ts';
import type { LensState } from '../store.ts';
import { isDiffMode, memo, type ViewFile } from '../shared.ts';
import {
  type CodeItem,
  contextSpans,
  declaredIn,
  fileSpans,
  oldLineNumbers,
  pairRows,
  planCode,
  type RemovedLine,
  type SplitItem,
  type UnitContext,
  unitSpans,
} from '../rows.ts';
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
  return items.flatMap((item) =>
    item.kind === 'region' ? [item.region] : item.kind === 'context' ? planRegions(item.body) : [],
  );
}

/** The code shows old and new side by side: the reader's switch, for a diff (a set of paths has no old side). */
export function isSplit(state: Pick<LensState, 'sideBySide' | 'data'>): boolean {
  return state.sideBySide && isDiffMode(state.data);
}

/** The code shows removed lines: side by side always does, they're its left side. */
export function showsRemoved(state: Pick<LensState, 'showRemoved' | 'sideBySide' | 'data'>): boolean {
  return state.showRemoved || isSplit(state);
}

const oldLinesCache = new WeakMap<ViewFile, number[]>();

/**
 * A plan's side-by-side rows, paired by the changed lines it marks. Components memoize it with
 * the plan, so a fold toggle re-renders only the rows it changes.
 */
export function splitRows(items: CodeItem[], file: ViewFile | null, changedLines: ReadonlySet<number>): SplitItem[] {
  let oldLines: number[] = [];
  if (file) {
    oldLines = oldLinesCache.get(file) ?? oldLineNumbers(file);
    oldLinesCache.set(file, oldLines);
  }
  return pairRows(items, changedLines, oldLines);
}

export interface FilePlan {
  items: CodeItem[];
}

const buildFilePlan = memo(
  (file: ViewFile, hunksOnly: boolean, expanded: ReadonlySet<string>, showRemoved: boolean): FilePlan => {
    // Old-side lines the diff removed, keyed by the new-side line they follow.
    const removedAfter = removedByLine(showRemoved ? removedLines(file.removals || []) : []);
    const spans = fileSpans(file, hunksOnly, expanded);
    return { items: planCode(spans, file.regions, (afterLine) => removedAfter.get(afterLine) || []) };
  },
);

export function filePlan(state: LensState, file: ViewFile): FilePlan {
  return buildFilePlan(file, state.hunksOnly, state.expandedGaps, showsRemoved(state));
}

/** The open file, unless there's none. */
export function activeFile(state: LensState): ViewFile | null {
  return state.data.files[state.active] ?? null;
}

export interface UnitPlan {
  file: ViewFile | null;
  items: CodeItem[];
  gutter: number;
  /** Full units: the rest of the file is in the plan, above and below the unit (context items) */
  full: boolean;
}

/** A file's removed blocks, each line with its old line number. */
function removedLines(blocks: RemovedBlock[]): { afterLine: number; lines: RemovedLine[] }[] {
  return blocks.map((block) => ({
    afterLine: block.afterLine,
    lines: block.lines.map((text, offset) => ({ text, old: block.oldStart + offset })),
  }));
}

/** The removed lines blocks show after each line, keyed by the line they follow. */
function removedByLine(blocks: { afterLine: number; lines: RemovedLine[] }[]): Map<number, RemovedLine[]> {
  const removedAfter = new Map<number, RemovedLine[]>();
  for (const block of blocks)
    removedAfter.set(block.afterLine, (removedAfter.get(block.afterLine) || []).concat(block.lines));
  return removedAfter;
}

const buildUnitPlan = memo(
  (
    unit: ViewUnit,
    file: ViewFile | null,
    expanded: ReadonlySet<string>,
    showRemoved: boolean,
    fullUnits: boolean,
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
    // the Summary tab shows a unit whole: hunks only is the Code view's (unitSpans)
    const spans = file ? unitSpans(unit) : [];
    const items = planCode(spans, regions, removedAt);
    const around = fullUnits && file ? contextSpans(unit, file) : null;
    if (!file || !around) return { file, items, gutter, full: false };
    // around the unit, the file's other removed lines: the unit's own show with it. By old line, not by
    // block: units split one removed block between them (units.ts), so a unit may own only part of one
    const own = new Set(unit.removals.flatMap((block) => block.lines.map((_, offset) => block.oldStart + offset)));
    const others = (showRemoved ? removedLines(file.removals || []) : [])
      .map((block) => ({ ...block, lines: block.lines.filter((line) => !own.has(line.old)) }))
      .filter((block) => block.lines.length > 0);
    const removedOutside = removedByLine(others);
    const context = (side: 'above' | 'below', stretch: UnitContext): CodeItem[] => {
      if (stretch.start > stretch.end) return [];
      const inStretch = (line: number) => line >= stretch.start && line <= stretch.end;
      return [
        {
          kind: 'context',
          side,
          key: stretch.key,
          open: expanded.has(stretch.key),
          lineCount: stretch.end - stretch.start + 1,
          names: declaredIn(file, stretch.start, stretch.end),
          added: (file.changedLines || []).filter(inStretch).length,
          // a block shows after its line: the one after the line above the stretch is in it too
          removed: others
            .filter((block) => inStretch(block.afterLine) || block.afterLine === stretch.start - 1)
            .reduce((count, block) => count + block.lines.length, 0),
          body: planCode(stretch.spans, regions, (afterLine) => removedOutside.get(afterLine) || []),
        },
      ];
    };
    return {
      file,
      items: [...context('above', around.above), ...items, ...context('below', around.below)],
      gutter,
      full: true,
    };
  },
);

export function unitFile(state: LensState, unit: ViewUnit): ViewFile | null {
  return state.data.files.find((file) => file.file === unit.displayFile) ?? null;
}

export function unitPlan(state: LensState, unit: ViewUnit): UnitPlan {
  const file = unitFile(state, unit);
  return buildUnitPlan(unit, file, state.expandedGaps, showsRemoved(state), state.fullUnits);
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
