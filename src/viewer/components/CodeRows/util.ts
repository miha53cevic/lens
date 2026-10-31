import type { MouseEvent } from 'react';
import { getState } from '../../store.ts';
import { openSearch } from '../../actions/dialogs.ts';

const IDENTIFIER_CHARACTER = /[A-Za-z0-9_$]/;

/**
 * Find usages: alt-click an identifier in either view's code, and search for it as a whole word. From
 * the Code view the tab being read is pinned, as the jump is a detour to come back from; the Summary
 * view is come back to with v.
 */
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
  openSearch(word, { word: true, matchCase: true, pinOrigin: getState().view === 'code' });
}
