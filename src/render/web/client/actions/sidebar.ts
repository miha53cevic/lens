// The sidebar: collapsed or not, its width, the tree's closed folders.

import { commit, toggled, update } from '../store.ts';
import { writePref } from '../shared.ts';

/** Committed: a filter in the sidebar can take focus right after it shows (keys.ts). */
export function toggleNav(): void {
  commit((state) => {
    writePref('lens.navCollapsed', !state.navCollapsed ? '1' : '0');
    return { navCollapsed: !state.navCollapsed };
  });
}

export function setNavWidth(width: number): void {
  writePref('lens.navWidth', width);
  update({ navWidth: width });
}

export function toggleDir(path: string): void {
  update((state) => ({ closedDirs: toggled(state.closedDirs, path) }));
}
