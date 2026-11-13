// The file tree's folders: open and close one, collapse them all, and open the ones around a file.

import { commit, getState, type LensState, toggled } from '../store.ts';
import { allDirPaths } from '../model/tree.ts';
import { growClosed, growOpen, stay } from '../../ui/motion.ts';

const dirFiles = (path: string) => document.querySelector(`[data-dir-files="${CSS.escape(path)}"]`);

export function toggleDir(path: string): void {
  const files = dirFiles(path);
  // clicked again while it closes: it stays open
  if (stay(files)) return;
  const flip = () => commit((state) => ({ closedDirs: toggled(state.closedDirs, path) }));
  // a folder the reader closes shrinks shut; one the reader opens grows open (one opened by a filter, or shown again, just shows)
  if (files && !getState().closedDirs.has(path)) return growClosed(files, flip);
  flip();
  if (!getState().closedDirs.has(path)) growOpen(dirFiles(path));
}

/** Every folder closes at once, without the grow: there may be many. */
export function collapseFolders(): void {
  commit((state) => ({ closedDirs: new Set(allDirPaths(state)) }));
}

/**
 * The folders a file opened from elsewhere (a tab, a cite, search) sits in open, so its row shows in
 * the tree. A closed folder's path is a prefix of every path under it, compact chains included.
 */
export function revealInTree(state: LensState, fileIndex: number): Partial<LensState> {
  const path = state.data.files[fileIndex]?.file;
  if (path === undefined) return {};
  const around = [...state.closedDirs].filter((dir) => path.startsWith(dir));
  if (around.length === 0) return {};
  const closedDirs = new Set(state.closedDirs);
  for (const dir of around) closedDirs.delete(dir);
  return { closedDirs };
}

/** The open file's row, brought into sight in the sidebar. */
export function scrollToActiveRow(): void {
  document.querySelector('#tree [data-part="file"][data-active]')?.scrollIntoView({ block: 'nearest' });
}
