// The dialogs (each <dialog> keeps its own open state) and the search palette.

import { commit, getState, type LensState, update } from '../store.ts';
import { jumpToLine, setView } from './views.ts';
import { openFile } from './tabs.ts';

export function dialog(id: string): HTMLDialogElement | null {
  return document.getElementById(id) as HTMLDialogElement | null;
}

export function openDialog(id: 'settings-modal' | 'keys-modal' | 'clear-modal'): void {
  const element = dialog(id);
  if (element && !element.open) element.showModal();
}

/**
 * The search palette, put in front of the reader with the query selected. Find usages
 * (alt-click) passes the word and pins the tab being read — that search is a detour the
 * reader returns from. Plain ⌘P search keeps the preview behavior, and the mode it was left in;
 * `files` (⌘⇧P) opens it on the file paths and keeps the word and case options.
 */
export function openSearch(
  query?: string,
  options?: { word?: boolean; matchCase?: boolean; pinOrigin?: boolean; files?: boolean },
): void {
  commit((state) => ({
    search: {
      query: query ?? state.search.query,
      word: options && !options.files ? !!options.word : state.search.word,
      matchCase: options && !options.files ? !!options.matchCase : state.search.matchCase,
      files: options ? !!options.files : state.search.files,
      pinOrigin: !!options?.pinOrigin,
      selected: 0,
    },
  }));
  const element = dialog('search-modal');
  if (element && !element.open) element.showModal();
  const input = document.getElementById('search-input') as HTMLInputElement | null;
  input?.focus();
  input?.select();
}

/** A new query or option: the selection goes back to the first hit. */
export function setSearch(patch: Partial<Pick<LensState['search'], 'query' | 'word' | 'matchCase' | 'files'>>): void {
  update((state) => ({ search: { ...state.search, ...patch, selected: 0 } }));
}

/** ↑ / ↓ in the palette: the selection moves, and stays in sight. */
export function moveSearchSelection(delta: number, hitCount: number): void {
  if (hitCount === 0) return;
  commit((state) => ({
    search: { ...state.search, selected: (state.search.selected + delta + hitCount) % hitCount },
  }));
  document.querySelector('[data-part="search-hit"].selected')?.scrollIntoView({ block: 'nearest' });
}

/** A file found by its path: the palette closes and the code view opens it. */
export function openFoundFile(fileIndex: number): void {
  dialog('search-modal')?.close();
  if (getState().view !== 'code') setView('code');
  openFile(fileIndex);
}

/** A search hit: the palette closes and the code view jumps to it. */
export function jumpToHit(fileIndex: number, line: number): void {
  dialog('search-modal')?.close();
  jumpToLine(fileIndex, line, getState().search.pinOrigin);
}
