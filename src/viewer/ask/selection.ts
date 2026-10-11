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
  const rowOf = (node: Node) => (node instanceof Element ? node : node.parentElement)?.closest('.row');
  const rows = [...root.querySelectorAll<HTMLElement>('.row')].filter(
    (row) => !row.matches('.pill-row, .gap, .unit-gap'),
  );
  // [first, last] row index an end of the selection covers: an end on a fold's pill takes in its
  // region; one off the rows (a ⋯ row, blank space under the code) counts as the gap between the
  // rows around it — the first row after it when it starts the range, the last before when it ends it
  const span = (node: Node, offset: number): [number, number] => {
    const row = rowOf(node);
    const rowIndex = rows.indexOf(row as HTMLElement);
    if (rowIndex >= 0) return [rowIndex, rowIndex];
    const inRegion = [...(row?.closest('.region')?.querySelectorAll<HTMLElement>('.row') ?? [])]
      .map((regionRow) => rows.indexOf(regionRow))
      .filter((index) => index >= 0);
    if (inRegion.length > 0) return [Math.min(...inRegion), Math.max(...inRegion)];
    const point = document.createRange();
    point.setStart(node, offset);
    const rowsBefore = rows.filter((candidate) => point.comparePoint(candidate, 0) < 0).length;
    return [rowsBefore, rowsBefore - 1];
  };
  const anchorSpan = span(selection.anchorNode!, selection.anchorOffset);
  const focusSpan = span(selection.focusNode!, selection.focusOffset);
  const from = Math.min(anchorSpan[0], focusSpan[0]);
  const to = Math.max(anchorSpan[1], focusSpan[1]);
  if (from > to) {
    askSetSelection(null); // nothing but ⋯ rows and blank space
    return;
  }
  const lines = rows
    .slice(from, to + 1)
    .slice(0, ASK_MAX_LINES)
    .map((row) => {
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
