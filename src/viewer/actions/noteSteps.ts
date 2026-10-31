// ⇧N: to the reader's next note in the open file or unit, and on into the next one that holds a
// note. A note inside a fold opens it, as a ruler click does (landOn).

import { flushSync } from 'react-dom';
import { getState } from '../store.ts';
import { activeFile } from '../model/plans.ts';
import { currentUnit, listModel } from '../model/summaryList.ts';
import { fileByPath, fileNotes, noteCounts, unitNoteCount } from '../model/notes.ts';
import { treeModel } from '../model/tree.ts';
import { landOn } from './views.ts';
import { openFile } from './tabs.ts';
import { openSummaryUnit } from './summary.ts';

/**
 * The open code: its rows' container, the path its folds and landing are kept under, and which
 * file or unit it is (two units can be of one file).
 */
function openCode(): { code: HTMLElement; path: string; id: string } | null {
  const state = getState();
  if (state.view === 'code') {
    const file = activeFile(state);
    const code = document.getElementById('code');
    return file && code ? { code, path: file.file, id: file.file } : null;
  }
  const unit = currentUnit(state);
  const code = document.querySelector<HTMLElement>('.unit-code .code');
  return unit && code ? { code, path: unit.displayFile, id: unit.id } : null;
}

/** A row's label for landOn: "N12" a line, "O5" a removed one; null for a row that is neither. */
function rowLabel(row: HTMLElement): string | null {
  if (row.dataset.line) return 'N' + row.dataset.line;
  if (row.dataset.old) return 'O' + row.dataset.old;
  return null;
}

/** Where the reader is among the rows: the row the last jump landed on, else the first row in sight. */
function readerAt(rows: HTMLElement[], path: string): number {
  const landed = getState().landed;
  if (landed && landed.path === path) {
    const at = rows.findIndex((row) => rowLabel(row) === landed.label);
    if (at !== -1) return at;
  }
  const scroller = rows[0]?.closest<HTMLElement>('.code-body, .summary-pane');
  if (!scroller) return -1;
  const top = scroller.getBoundingClientRect().top;
  // rows in a folded stretch aren't laid out (no offsetParent): they are not in sight
  const first = rows.findIndex((row) => row.offsetParent !== null && row.getBoundingClientRect().bottom > top);
  // the first row in sight isn't passed yet: a note on it is the next one
  return first > 0 ? first - 1 : -1;
}

/**
 * Lands on the reader's next (`direction` 1) or previous (-1) note. Past the last one it goes on to
 * the next file or unit that holds one, to its first note (its last, going back).
 */
export function stepNote(direction: 1 | -1): void {
  const open = openCode();
  if (open && landOnNote(open, direction, null)) return;
  const before = open?.id;
  flushSync(() => openNextWithNotes(direction));
  const next = openCode();
  if (next && next.id !== before) landOnNote(next, direction, direction > 0 ? 'first' : 'last');
}

/** Opens the next file (tree order) or unit (list order) after the open one that holds a note. */
function openNextWithNotes(direction: 1 | -1): void {
  const state = getState();
  const pick = <T>(order: T[], current: T | undefined, has: (entry: T) => boolean): T | undefined => {
    const at = current === undefined ? -1 : order.indexOf(current);
    const after = direction > 0 ? order.slice(at + 1) : order.slice(0, at === -1 ? order.length : at).reverse();
    return after.find(has);
  };
  if (state.view === 'code') {
    const counts = noteCounts(state.notes);
    const files = state.data.files;
    const target = pick(treeModel(state).order, state.active, (fileIndex) => counts.has(files[fileIndex].file));
    if (target !== undefined) openFile(target);
    return;
  }
  const list = listModel(state);
  const units = state.data.summary?.units ?? [];
  if (!list) return;
  const target = pick(list.order, list.activeId ?? undefined, (unitId) => {
    const unit = units.find((candidate) => candidate.id === unitId);
    return !!unit && unitNoteCount(state.notes, fileByPath(state.data, unit.displayFile), unit) > 0;
  });
  if (target !== undefined) openSummaryUnit(target);
}

/** The rows a note is under. */
function noteRows(rows: HTMLElement[], path: string): number[] {
  const file = fileByPath(getState().data, path);
  const labels = file ? fileNotes(getState().notes, file).byLabel : null;
  return labels ? rows.flatMap((row, at) => (labels.has(rowLabel(row) ?? '') ? [at] : [])) : [];
}

/** Lands on a note of the open code; false when there is none that way. */
function landOnNote(
  open: { code: HTMLElement; path: string },
  direction: 1 | -1,
  end: 'first' | 'last' | null,
): boolean {
  const rows = [...open.code.querySelectorAll<HTMLElement>('.row')];
  const found = noteRows(rows, open.path);
  if (found.length === 0) return false;
  let target: number | undefined;
  if (end === 'first') target = found[0];
  else if (end === 'last') target = found[found.length - 1];
  else {
    const at = readerAt(rows, open.path);
    target = direction > 0 ? found.find((stop) => stop > at) : found.findLast((stop) => stop < at);
  }
  if (target === undefined) return false;
  landOn(rows[target], open.path, rowLabel(rows[target])!);
  return true;
}
