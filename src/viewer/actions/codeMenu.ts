// The code's own right-click menu (components/CodeMenu.tsx): ask about the lines, note them, copy
// them. It opens on a line of code only; everywhere else, and with Shift held, the browser's stays.

import { getState } from '../store.ts';
import { askSelection } from '../model/askContext.ts';
import { askSelLabel, codeRowAt, keepRow, selectionHas } from '../ask/selection.ts';
import { openAt } from '../../ui/Menu.tsx';
import { noteDone, noteFailure } from './status.ts';

export const CODE_MENU = 'code-menu';

/** A right-click on a line: inside the kept selection the menu acts on it, outside it the line becomes the selection. */
export function onContextMenu(event: MouseEvent): void {
  if (event.shiftKey && event.button === 2) return; // Shift right-click: the browser's own menu
  const row = codeRowAt(event.target);
  if (!row) return;
  event.preventDefault();
  if (!selectionHas(row)) keepRow(row);
  openAt(document.getElementById(CODE_MENU), event);
}

export async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    noteDone('Copied ' + what);
  } catch (error) {
    noteFailure("Couldn't copy " + what, (error as Error).message);
  }
}

export function copySelectedLines(): Promise<void> {
  const selection = askSelection(getState());
  if (!selection) return Promise.resolve();
  return copy(selection.lines.map((line) => line.text).join('\n') + '\n', 'the lines');
}

/** "src/a.ts:43–44": where the lines are, to paste in a chat. */
export function copySelectedPlace(): Promise<void> {
  const selection = askSelection(getState());
  if (!selection) return Promise.resolve();
  const place = askSelLabel(selection);
  return copy(place, place);
}
