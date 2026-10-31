// The code's own right-click menu (components/CodeMenu.tsx): ask about the lines, note them, copy
// them. It opens on a line of code only; everywhere else, and with Shift held, the browser's stays.

import { getState } from '../store.ts';
import { askSelection } from '../model/askContext.ts';
import { askSelLabel, codeRowAt, keepRow, selectionHas } from '../ask/selection.ts';
import { placeAt } from '../../ui/Menu.tsx';
import { noteDone, noteFailure } from './status.ts';

export const CODE_MENU = 'code-menu';

function showMenu(x: number, y: number) {
  const menu = document.getElementById(CODE_MENU);
  if (!menu) return;
  menu.showPopover?.(); // happy-dom has no popovers: the page tests click its items as they are
  placeAt(menu, x, y); // once it's open: it has a size to keep inside the window
}

/** A right-click on a line: inside the kept selection the menu acts on it, outside it the line becomes the selection. */
export function onContextMenu(event: MouseEvent): void {
  if (event.shiftKey && event.button === 2) return; // Shift right-click: the browser's own menu
  const row = codeRowAt(event.target);
  if (!row) return;
  event.preventDefault();
  if (!selectionHas(row)) keepRow(row);
  const { clientX, clientY } = event;
  if (!event.buttons) {
    showMenu(clientX, clientY);
    return;
  }
  // macOS fires contextmenu on the press, not the release: opened now, the popover's light dismiss
  // would close it again on the pointerup that follows. So it opens once that has gone by.
  const settle = (up: Event) => {
    window.removeEventListener('pointerup', settle, true);
    window.removeEventListener('pointercancel', settle, true);
    if (up.type === 'pointerup') setTimeout(() => showMenu(clientX, clientY));
  };
  window.addEventListener('pointerup', settle, true);
  window.addEventListener('pointercancel', settle, true);
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
