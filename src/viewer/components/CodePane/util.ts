import { scrollStore } from '../../store.ts';

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
