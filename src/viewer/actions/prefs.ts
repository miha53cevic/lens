// What the reader sets and the browser remembers: the sidebar, the view settings (the
// header's ⋯ menu), the code's size and the viewed marks.

import { commit, getState, toggled, update, VIEWED_CAP, VIEWED_PREF } from '../store.ts';
import { fileViewKey, type ViewFile, writePref } from '../shared.ts';
import { CODE_SIZE_COOKIE, CODE_SIZE_DEFAULT, steppedSize } from '../codeSize.ts';
import { type Unit, unitViewKey } from '../model/signals.ts';
import { fileProgress, type Progress, unitProgress } from '../model/progress.ts';
import { currentUnit } from '../model/summaryList.ts';
import { visibleActive } from './tabs.ts';
import { growOpen, pop, slideIn } from '../../ui/motion.ts';

// The sidebar: collapsed or not, its width, the tree's closed folders.

/** Committed: a filter in the sidebar can take focus right after it shows (keys.ts). */
export function toggleNav(): void {
  commit((state) => {
    writePref('lens.navCollapsed', !state.navCollapsed ? '1' : '0');
    return { navCollapsed: !state.navCollapsed };
  });
  if (!getState().navCollapsed) slideIn(document.getElementById('nav'), 'left');
}

export function setNavWidth(width: number): void {
  writePref('lens.navWidth', width);
  update({ navWidth: width });
}

export function toggleDir(path: string): void {
  commit((state) => ({ closedDirs: toggled(state.closedDirs, path) }));
  // a folder the reader opens grows open; one opened by a filter, or shown again, just shows
  if (!getState().closedDirs.has(path)) growOpen(document.querySelector(`[data-dir-files="${CSS.escape(path)}"]`));
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
  const before = fileProgress(state);
  commit({ viewedFiles });
  confirmMark(before, fileProgress(getState()), fileIndex === state.active);
}

export function toggleUnitViewed(unit: Unit | null): void {
  if (!unit) return;
  const state = getState();
  const viewedUnits = toggled(state.viewedUnits, unitViewKey(unit));
  saveViewed(VIEWED_PREF.units, viewedUnits);
  const before = unitProgress(state);
  commit({ viewedUnits });
  const open = currentUnit(state);
  confirmMark(before, unitProgress(getState()), !!open && unitViewKey(open) === unitViewKey(unit));
}

/**
 * A mark the reader just made: the review pill swells when it's the open file's or change's, and
 * the ring when it was the last one. Unmarking says nothing.
 */
function confirmMark(before: Progress | null, after: Progress | null, open: boolean) {
  if (!before || !after || after.done <= before.done) return;
  if (open) pop(document.getElementById('review-pill'));
  if (after.done === after.total) pop(document.querySelector('#nav .progress svg'));
}
