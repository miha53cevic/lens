// The code's own right-click menu (components/CodeMenu.tsx): ask about the lines, note them, copy
// them. It opens on a line of code only; everywhere else, and with Shift held, the browser's stays.

import { getState } from '../store.ts';
import { askSelection } from '../model/askContext.ts';
import { askSelLabel, askSelLabels, codeRowAt, keepRow, selectionHas } from '../ask/selection.ts';
import { placeAt } from '../../ui/Menu.tsx';
import { noteDone, noteFailure } from './status.ts';

export const CODE_MENU = 'code-menu';

function showMenu(x: number, y: number, focusFirst: boolean) {
  const menu = document.getElementById(CODE_MENU);
  if (!menu) return;
  menu.showPopover?.(); // happy-dom has no popovers: the page tests click its items as they are
  placeAt(menu, x, y); // once it's open: it has a size to keep inside the window
  // from the keyboard, the keys go on in the menu
  if (focusFirst) menu.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
}

/**
 * A right-click on a line: inside the kept selection the menu acts on it, outside it the line becomes
 * the selection. From the keyboard (Shift F10, the Menu key: no right button), it opens on the selection.
 */
export function onContextMenu(event: MouseEvent): void {
  if (event.shiftKey && event.button === 2) return; // Shift right-click: the browser's own menu
  const row = codeRowAt(event.target);
  if (!row) {
    if (event.button !== 2 && openCodeMenuAtSelection()) event.preventDefault();
    return;
  }
  event.preventDefault();
  if (!selectionHas(row)) keepRow(row);
  showMenu(event.clientX, event.clientY, false);
}

/** The menu under the kept selection's last line. Whether there was one to open it on. */
function openCodeMenuAtSelection(): boolean {
  const labels = askSelLabels(askSelection(getState()));
  const label = labels[labels.length - 1];
  if (!label) return false;
  const selector = label.startsWith('O')
    ? '.row[data-old="' + label.slice(1) + '"]'
    : '.row[data-line="' + label.slice(1) + '"]';
  const row = document.querySelector<HTMLElement>('#code ' + selector + ', .summary-pane .unit-code ' + selector);
  if (!row) return false;
  const rect = row.getBoundingClientRect();
  showMenu(rect.left + 48, rect.bottom, true);
  return true;
}

async function copy(text: string, what: string) {
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
