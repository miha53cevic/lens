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

/**
 * A folder of the open file's path (the code card's breadcrumb), open and in sight in the tree. Its
 * row may be a compact chain that runs past it (`src/viewer/` drawn in `src/viewer/components/`):
 * the shortest row that starts with it is the one.
 */
export function revealFolder(dir: string): void {
  commit((state) => {
    const closedDirs = new Set([...state.closedDirs].filter((closed) => !dir.startsWith(closed)));
    return closedDirs.size === state.closedDirs.size ? {} : { closedDirs };
  });
  const row = [...document.querySelectorAll<HTMLElement>('#tree [data-part="dir"][data-dir]')]
    .filter((candidate) => candidate.dataset.dir!.startsWith(dir))
    .reduce<HTMLElement | undefined>(
      (shortest, candidate) =>
        shortest && shortest.dataset.dir!.length <= candidate.dataset.dir!.length ? shortest : candidate,
      undefined,
    );
  if (!row) return;
  if (getState().closedDirs.has(row.dataset.dir!)) toggleDir(row.dataset.dir!);
  row.scrollIntoView?.({ block: 'nearest' });
}

/** The open file's row, brought into sight in the sidebar. */
export function scrollToActiveRow(): void {
  document.querySelector('#tree [data-part="file"][data-active]')?.scrollIntoView({ block: 'nearest' });
}
