// What the reader sets and the browser remembers: the sidebar, the view settings (the
// header's ⋯ menu), the code's size and the viewed marks.

import { commit, getState, toggled, update, VIEWED_CAP, VIEWED_PREF } from '../store.ts';
import { fileViewKey, type ViewFile, writePref } from '../shared.ts';
import { CODE_SIZE_COOKIE, CODE_SIZE_DEFAULT, steppedSize } from '../codeSize.ts';
import { type Unit, unitViewKey } from '../model/signals.ts';
import { visibleActive } from './tabs.ts';

// The sidebar: collapsed or not, its width, the tree's closed folders.

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

// The view settings: hunks only, removed lines, word diff, hide tests, the fold level.

export function setHunksOnly(on: boolean): void {
  writePref('lens.hunksOnly', on ? '1' : '0');
  update({ hunksOnly: on, expandedGaps: new Set() }); // toggling starts fresh — no stale expansions
}

export function setHideTests(on: boolean): void {
  writePref('lens.hideTests', on ? '1' : '0');
  update((state) => ({
    hideTests: on,
    ...(state.view === 'code' ? visibleActive({ ...state, hideTests: on }) : {}),
  }));
}

export function setShowRemoved(on: boolean): void {
  update({ showRemoved: on });
}

export function setWordDiff(on: boolean): void {
  writePref('lens.wordDiff', on ? '1' : '0');
  update({ wordDiff: on });
}

export function setThreshold(threshold: number): void {
  update({ threshold });
}

export function stepThreshold(delta: number): void {
  setThreshold(Math.max(-1, Math.min(3, getState().threshold + delta)));
}

// The code's size, in both views. Kept in a cookie, so every repository's viewer opens at it.

export function setCodeSize(size: number): void {
  // the default keeps no cookie: a reader who never chose follows the default if it changes
  const kept = size === CODE_SIZE_DEFAULT ? '; max-age=0' : '; max-age=31536000';
  document.cookie = CODE_SIZE_COOKIE + '=' + size + '; path=/' + kept + '; samesite=lax';
  update({ codeSize: size });
}

export function stepCodeSize(delta: number): void {
  setCodeSize(steppedSize(getState().codeSize, delta));
}

// Viewed marks: keyed by content, so what changes after it was ticked comes back unticked.

function saveViewed(prefKey: string, viewed: ReadonlySet<string>) {
  // Sets keep insertion order: the oldest marks drop first
  writePref(prefKey, JSON.stringify([...viewed].slice(-VIEWED_CAP)));
}

export function toggleFileViewed(fileIndex: number): void {
  const state = getState();
  const file: ViewFile | undefined = state.data.files[fileIndex];
  if (!file) return;
  const viewedFiles = toggled(state.viewedFiles, fileViewKey(file));
  saveViewed(VIEWED_PREF.files, viewedFiles);
  update({ viewedFiles });
}

export function toggleUnitViewed(unit: Unit | null): void {
  if (!unit) return;
  const viewedUnits = toggled(getState().viewedUnits, unitViewKey(unit));
  saveViewed(VIEWED_PREF.units, viewedUnits);
  update({ viewedUnits });
}
