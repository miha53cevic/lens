// The Summary tab: the open unit, the list's filters, the reader's verdicts.

import { type ConcernMark, getState, type SignalFilter, update } from '../store.ts';
import type { Unit } from '../model/signals.ts';
import { currentUnit, listModel } from '../model/summaryList.ts';
import { jumpToLine, landOn } from './views.ts';
import { saveMark } from './marks.ts';

export function openSummaryUnit(unitId: string): void {
  update({ summaryUnit: unitId });
}

export function showOverview(): void {
  update({ summaryUnit: null });
}

export function stepSummary(direction: number): void {
  const state = getState();
  const list = listModel(state);
  if (!list || list.order.length === 0) return;
  // from the overview, j starts at the top of the list and k at the bottom
  const position = state.summaryUnit === null ? -1 : list.order.indexOf(list.activeId ?? '');
  // stops at the first and the last change: no wrapping around
  const target = position === -1 ? (direction > 0 ? 0 : list.order.length - 1) : position + direction;
  const unitId = list.order[target];
  if (unitId) openSummaryUnit(unitId);
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

// The agent's findings are suspicions; the reader decides: "real" or "dismissed", kept for the
// review by the server. The same mark again takes it back. `key` is the finding's (`findings` in
// model/signals.ts).
export function setMark(key: string, mark: ConcernMark): void {
  const marks = new Map(getState().concernMarks);
  const taken = marks.get(key) === mark;
  marks.delete(key);
  if (!taken) marks.set(key, mark); // re-insert: the oldest marks drop first
  update({ concernMarks: marks });
  void saveMark({ list: 'concerns', key, mark: taken ? null : mark });
}

/** The row a label ("N31" / "O16") points at, in the open unit's code. */
function citedRow(label: string): HTMLElement | null {
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
  landOn(row, unit.displayFile, label, true);
  return true;
}
