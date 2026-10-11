import type { MouseEvent } from 'react';
import { openSearch } from '../../actions/dialogs.ts';
import { scrollStore } from '../../store.ts';

const IDENTIFIER_CHARACTER = /[A-Za-z0-9_$]/;

/** Find usages: alt-click an identifier in the code, and search for it as a whole word. */
export function findUsages(event: MouseEvent) {
  if (!event.altKey) return;
  if (event.target instanceof Element && event.target.closest('.pill-row, .row.gap, .num')) return;
  let node: Node | null = null;
  let offset = 0;
  if (document.caretPositionFromPoint) {
    const position = document.caretPositionFromPoint(event.clientX, event.clientY);
    if (position) {
      node = position.offsetNode;
      offset = position.offset;
    }
  } else if (document.caretRangeFromPoint) {
    const range = document.caretRangeFromPoint(event.clientX, event.clientY);
    if (range) {
      node = range.startContainer;
      offset = range.startOffset;
    }
  }
  if (!node || node.nodeType !== Node.TEXT_NODE) return;
  const text = node.textContent ?? '';
  let start = offset;
  let end = offset;
  while (start > 0 && IDENTIFIER_CHARACTER.test(text[start - 1])) start--;
  while (end < text.length && IDENTIFIER_CHARACTER.test(text[end])) end++;
  const word = text.slice(start, end);
  if (!word || /^\d+$/.test(word)) return;
  event.preventDefault();
  openSearch(word, { word: true, matchCase: true, pinOrigin: true });
}

/** The pane mounts per file (keyed by path): it comes back where the reader left that file. */
export function restoreFileScroll(pane: HTMLElement | null, path: string | null) {
  if (!pane || !path) return;
  const saved = scrollStore.getState().files[path];
  pane.scrollTop = saved ? saved.top : 0;
  pane.scrollLeft = saved ? saved.left : 0;
}

export function saveFileScroll(pane: HTMLElement, path: string | null) {
  if (!path) return;
  scrollStore.setState((positions) => ({
    files: { ...positions.files, [path]: { top: pane.scrollTop, left: pane.scrollLeft } },
  }));
}
