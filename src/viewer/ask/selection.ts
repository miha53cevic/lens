// The selection a question is about: whole lines of the open change's code.

import type { AskSelection } from '../../cli-app/ask/session.ts';
import { getState, type KeptSelection, type LensState } from '../store.ts';
import { askContext } from '../model/askContext.ts';
import { ASK_MAX_LINES, setAsk } from './rail.ts';

/** "src/a.ts:43–44" — the same wording as the agent's text (src/cli-app/ask/context.ts). */
export function askSelLabel(selection: AskSelection): string {
  const numbers = (side: 'new' | 'old') =>
    selection.lines.filter((line) => line.side === side && line.n !== null).map((line) => line.n!);
  const span = (lineNumbers: number[]) =>
    lineNumbers[0] === lineNumbers[lineNumbers.length - 1]
      ? String(lineNumbers[0])
      : lineNumbers[0] + '–' + lineNumbers[lineNumbers.length - 1];
  const newLines = numbers('new');
  const oldLines = numbers('old');
  if (newLines.length > 0) return selection.file + ':' + span(newLines);
  if (oldLines.length > 0) return selection.file + ' (removed lines ' + span(oldLines) + ')';
  return selection.file + ' (removed lines)';
}

function askSetSelection(selection: KeptSelection | null) {
  if (selection === null && getState().ask.selection === null) return;
  setAsk({ selection });
}

/** The code the selection can come from in the current view. */
function askCodeRoot(state: LensState): Element | null {
  return state.view === 'summary'
    ? document.querySelector('.summary-pane .unit-code')
    : document.getElementById('code');
}

const rowOf = (node: Node) => (node instanceof Element ? node : node.parentElement)?.closest<HTMLElement>('.row');

/**
 * The rows a selection takes: those it holds at least one character of. Where its ends sit says
 * less: a double-click past a line's end, or a triple-click, selects a line break, which ends at
 * the start of the next row without holding any of it. Such a selection takes the row it starts on.
 */
function selectedRows(rows: HTMLElement[], selected: Range): HTMLElement[] {
  const range = selected.cloneRange();
  const startPill = rowOf(range.startContainer)?.closest('.pill-row');
  const endPill = rowOf(range.endContainer)?.closest('.pill-row');
  // inside one fold's pill: a slipped click on a control, not a selection of code
  if (endPill && endPill === startPill) return [];
  // a drag that ends on a fold's pill takes in the fold: its lines come after the pill
  const region = endPill?.closest('.region');
  if (region) range.setEndAfter(region);
  const code = document.createRange();
  const held = rows.filter((row) => {
    code.selectNodeContents(row.lastElementChild!);
    // the selection starts before the row's code ends, and ends after it starts
    return (
      range.compareBoundaryPoints(Range.END_TO_START, code) < 0 &&
      range.compareBoundaryPoints(Range.START_TO_END, code) > 0
    );
  });
  if (held.length > 0) return held;
  const startRow = rowOf(range.startContainer);
  return startRow && rows.includes(startRow) ? [startRow] : [];
}

// A selection that ends in the code is taken whole-line; one that moves elsewhere
// (the textarea taking focus) leaves the kept selection alone.
export function onSelectionChange(): void {
  const state = getState();
  const selection = document.getSelection();
  const root = askCodeRoot(state);
  const context = askContext(state);
  if (!selection || selection.rangeCount === 0 || !root || !context) return;
  if (!root.contains(selection.anchorNode) || !root.contains(selection.focusNode)) return;
  if (selection.isCollapsed) {
    askSetSelection(null);
    return;
  }
  // side by side, a selection takes the code of the side it started on (holdSelectionSide keeps the other unselectable)
  const startRow = selection.anchorNode ? rowOf(selection.anchorNode) : null;
  const otherSide = startRow?.classList.contains('left')
    ? '.right'
    : startRow?.classList.contains('right')
      ? '.left'
      : null;
  const rows = [...root.querySelectorAll<HTMLElement>('.row')].filter(
    (row) => !row.matches('.pill-row, .gap, .unit-gap, .half.none') && !(otherSide && row.matches('.half' + otherSide)),
  );
  const taken = selectedRows(rows, selection.getRangeAt(0));
  if (taken.length === 0) {
    askSetSelection(null); // nothing but ⋯ rows, a pill's text or blank space
    return;
  }
  const lines = taken.slice(0, ASK_MAX_LINES).map((row) => {
    const lineNumber = row.dataset.line ?? row.dataset.old;
    const text = row.lastElementChild ? (row.lastElementChild.textContent ?? '') : '';
    return {
      n: lineNumber ? Number(lineNumber) : null,
      side: row.classList.contains('removed') ? ('old' as const) : ('new' as const),
      text: text === ' ' ? '' : text,
    };
  });
  askSetSelection({ key: context.key, file: context.file, lines });
}

/** A selection from another change goes once the reader opens a different one. */
export function dropForeignSelection(state: LensState): void {
  const context = askContext(state);
  if (state.ask.selection && (!context || state.ask.selection.key !== context.key)) setAsk({ selection: null });
}

/** The labels ("N12" / "O5") of the selection's rows, for the rows to tint. */
export function askSelLabels(selection: AskSelection | null): string[] {
  return (selection ? selection.lines : [])
    .filter((line) => line.n !== null)
    .map((line) => (line.side === 'old' ? 'O' : 'N') + line.n);
}
