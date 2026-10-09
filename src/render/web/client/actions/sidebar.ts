// The sidebar: collapsed or not, its width, the tree's closed folders.

import { toggled, update } from '../store.ts';
import { writePref } from '../shared.ts';

export function toggleNav(): void {
  update((state) => {
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
