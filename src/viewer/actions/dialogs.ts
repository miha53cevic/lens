// The dialogs (each <dialog> keeps its own open state) and the search palette.

import { commit, getState, type LensState, type SettingsPage, update } from '../store.ts';
import { jumpToLine, setView } from './views.ts';
import { openFile } from './tabs.ts';

export function dialog(id: string): HTMLDialogElement | null {
  return document.getElementById(id) as HTMLDialogElement | null;
}

/**
 * Opens a modal holding its own focus, not its first control's: showModal() would focus the ✕, and
 * opened by a key (?, ,) Chromium draws the keyboard's ring on it. Tab still walks in from there.
 * The dialog takes focus only with tabIndex={-1}.
 */
export function showDialog(element: HTMLDialogElement | null): void {
  if (!element || element.open) return;
  element.showModal();
  element.focus({ focusVisible: false });
}

export function openDialog(id: 'settings-modal' | 'keys-modal' | 'clear-modal'): void {
  showDialog(dialog(id));
}

/** The ? help, with its filter taking the keys: what's typed next finds a shortcut. */
export function openKeys(): void {
  openDialog('keys-modal');
  document.getElementById('keys-filter')?.focus();
}

/** Settings, on the page it was left on, or on `page` (the config notice opens it on Config). */
export function openSettings(page?: SettingsPage): void {
  if (page) update({ settingsPage: page });
  openDialog('settings-modal');
}

/** A page picked in Settings' rail. */
export function showSettingsPage(page: SettingsPage): void {
  update({ settingsPage: page });
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
  document.querySelector('[data-part="search-hit"][data-selected]')?.scrollIntoView({ block: 'nearest' });
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
