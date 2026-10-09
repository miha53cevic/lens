// The Summary tab: the open unit, the list's filters, the reader's verdicts.

import type { Concern } from '../../../../summary/store.ts';
import {
  CONCERN_PREF,
  type ConcernMark,
  getState,
  type LensState,
  type SignalFilter,
  toggled,
  update,
  VIEWED_CAP,
} from '../store.ts';
import { flashRow, writePref } from '../shared.ts';
import { concernKey, type Unit } from '../model/signals.ts';
import { currentUnit, listModel } from '../model/summaryList.ts';
import { openFoldAround } from './folds.ts';
import { jumpToLine } from './views.ts';

export function openSummaryUnit(unitId: string): void {
  update({ summaryOverview: false, summaryActive: unitId, summaryBrowsing: true });
}

export function showOverview(): void {
  update({ summaryOverview: true, summaryBrowsing: true });
}

export function stepSummary(direction: number): void {
  const state = getState();
  const list = listModel(state);
  if (!list || list.order.length === 0) return;
  // from the overview, j starts at the top of the list and k at the bottom
  const position = state.summaryOverview ? -1 : list.order.indexOf(list.activeId!);
  openSummaryUnit(
    position === -1
      ? list.order[direction > 0 ? 0 : list.order.length - 1]
      : list.order[(position + direction + list.order.length) % list.order.length],
  );
}

export function openUnitInCode(unit: Unit | null): void {
  if (!unit) return;
  const fileIndex = getState().data.files.findIndex((file) => file.file === unit.displayFile);
  if (fileIndex < 0 || unit.ranges.length === 0) return;
  jumpToLine(fileIndex, unit.changedLines[0] ?? unit.ranges[0].start);
}

export function setSignalFilter(signal: SignalFilter): void {
  update((state) => ({ sumSignal: listModel(state)?.signal === signal ? null : signal }));
}

export function toggleFlow(title: string, open: boolean): void {
  update((state) => ({ flowOpen: new Map(state.flowOpen).set(title, open) }));
}

export function setOverviewTab(tab: 'flows' | 'map'): void {
  writePref('lens.overviewTab', tab);
  update({ overviewTab: tab });
}

export async function copyCommand(command: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(command);
    update({ commandCopy: 'copied' });
  } catch {
    update({ commandCopy: 'select + copy' });
  }
}

// The agent's concerns are suspicions; the reader decides: "real" or "dismissed", per browser.
export function setConcernMark(unit: Unit, concern: Concern, mark: ConcernMark): void {
  const key = concernKey(unit, concern);
  const marks = new Map(getState().concernMarks);
  if (marks.get(key) === mark) marks.delete(key);
  else {
    marks.delete(key);
    marks.set(key, mark); // re-insert: the oldest marks drop first
  }
  writePref(CONCERN_PREF, JSON.stringify(Object.fromEntries([...marks].slice(-VIEWED_CAP))));
  update({ concernMarks: marks });
}

/** The unit page's state for this unit: another unit's is left behind. */
function unitPageOf(state: LensState, unit: Unit): LensState['unitPage'] {
  return state.unitPage.unitId === unit.id
    ? state.unitPage
    : { unitId: unit.id, hoveredCite: null, openBreaks: new Set() };
}

/** Hovering a When / Before / Now row points at the line it cites. */
export function hoverCite(unit: Unit, label: string | null): void {
  update((state) => ({ unitPage: { ...unitPageOf(state, unit), hoveredCite: label } }));
}

/** A break's callers, or a caller's peek, open or close: "b<break>" / "p<break>-<caller>". */
export function toggleBreak(unit: Unit, key: string): void {
  update((state) => {
    const page = unitPageOf(state, unit);
    return { unitPage: { ...page, openBreaks: toggled(page.openBreaks, key) } };
  });
}

/** The row a label ("N31" / "O16") points at, in the open unit's code. */
export function citedRow(label: string): HTMLElement | null {
  const selector = label.startsWith('O')
    ? '.row[data-old="' + label.slice(1) + '"]'
    : '.row[data-line="' + label.slice(1) + '"]';
  return document.querySelector<HTMLElement>('.summary-pane .unit-code ' + selector);
}

/** A cite: the line in the unit's code, its fold opened, scrolled to and flashed. */
export function flashCited(label: string): boolean {
  const row = citedRow(label);
  const unit = currentUnit(getState());
  if (!row || !unit) return false;
  openFoldAround(row, unit.displayFile);
  flashRow(row, true);
  return true;
}
