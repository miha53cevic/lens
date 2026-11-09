// What the reader sets: the sidebar and the view settings (the header's ⋯ menu), which the server keeps for
// the repository, the code's size and the UI's, in cookies, and the viewed marks, which the server keeps for the review.

import { commit, getState, toggled, update } from '../store.ts';
import { fileViewKey, INITIAL_DATA, type ViewFile } from '../shared.ts';
import { CODE_SIZE_COOKIE, CODE_SIZE_DEFAULT, steppedSize } from '../codeSize.ts';
import { steppedZoom, UI_ZOOM_COOKIE, UI_ZOOM_DEFAULT } from '../../cli-app/zoom.ts';
import { type Unit, unitViewKey } from '../model/signals.ts';
import { fileProgress, type Progress, unitProgress } from '../model/progress.ts';
import { toggledMark } from '../model/viewed.ts';
import { currentUnit } from '../model/summaryList.ts';
import { visibleActive } from './tabs.ts';
import { saveMark } from './marks.ts';
import { saveView } from './viewSettings.ts';
import { inboxMark } from './inbox.ts';
import { growClosed, growOpen, pop, slideIn, slideOut, stay } from '../../ui/motion.ts';

// The sidebar: collapsed or not, its width, the tree's closed folders.

/** Committed: a filter in the sidebar can take focus right after it shows (keys.ts). */
export function toggleNav(): void {
  const nav = document.getElementById('nav');
  // pressed again while it slides out: it stays
  if (stay(nav)) return;
  const flip = () => {
    const navCollapsed = !getState().navCollapsed;
    commit({ navCollapsed });
    void saveView({ navCollapsed });
  };
  if (!getState().navCollapsed) return slideOut(nav, 'left', flip);
  flip();
  slideIn(nav, 'left');
}

export function setNavWidth(width: number): void {
  update({ navWidth: width });
  void saveView({ navWidth: width });
}

export function toggleDir(path: string): void {
  const files = document.querySelector(`[data-dir-files="${CSS.escape(path)}"]`);
  // clicked again while it closes: it stays open
  if (stay(files)) return;
  const flip = () => commit((state) => ({ closedDirs: toggled(state.closedDirs, path) }));
  // a folder the reader closes shrinks shut; one the reader opens grows open (one opened by a filter, or shown again, just shows)
  if (files && !getState().closedDirs.has(path)) return growClosed(files, flip);
  flip();
  if (!getState().closedDirs.has(path)) growOpen(document.querySelector(`[data-dir-files="${CSS.escape(path)}"]`));
}

// The view settings: hunks only, full units, removed lines, word diff, side by side, hide tests, the fold level.

export function setHunksOnly(on: boolean): void {
  update({ hunksOnly: on, expandedGaps: new Set() }); // toggling starts fresh — no stale expansions
  void saveView({ hunksOnly: on });
}

export function setFullUnits(on: boolean): void {
  update({ fullUnits: on });
  void saveView({ fullUnits: on });
}

export function setHideTests(on: boolean): void {
  update((state) => ({
    hideTests: on,
    ...(state.view === 'code' ? visibleActive({ ...state, hideTests: on }) : {}),
  }));
  void saveView({ hideTests: on });
}

export function setShowRemoved(on: boolean): void {
  update({ showRemoved: on });
}

export function setWordDiff(on: boolean): void {
  update({ wordDiff: on });
  void saveView({ wordDiff: on });
}

export function setSideBySide(on: boolean): void {
  update({ sideBySide: on });
  void saveView({ sideBySide: on });
}

/**
 * Kept with the level it was picked over: a new one in .lens.json or --fold-level wins over it.
 * Back at that level, nothing is kept.
 */
export function setThreshold(threshold: number): void {
  const base = INITIAL_DATA.config.foldLevel;
  update({ threshold });
  void saveView({ foldLevel: threshold === base ? null : { level: threshold, base } });
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

// The whole page's zoom, kept the same way: the server reads the cookie, so the page arrives at it.

export function setUiZoom(zoom: number): void {
  const kept = zoom === UI_ZOOM_DEFAULT ? '; max-age=0' : '; max-age=31536000';
  document.cookie = UI_ZOOM_COOKIE + '=' + zoom + '; path=/' + kept + '; samesite=lax';
  update({ uiZoom: zoom });
}

export function stepUiZoom(delta: number): void {
  setUiZoom(steppedZoom(getState().uiZoom, delta));
}

// Viewed marks: keyed by content, so what changes after it was ticked comes back unticked (and
// says it changed since, model/viewed.ts). Kept per review by the server (actions/marks.ts).

export function toggleFileViewed(fileIndex: number): void {
  const state = getState();
  const file: ViewFile | undefined = state.data.files[fileIndex];
  if (!file) return;
  const key = fileViewKey(file);
  const viewedFiles = toggledMark(state.viewedFiles, key);
  void saveMark({ list: 'files', key, on: viewedFiles.has(key) });
  const before = fileProgress(state);
  commit({ viewedFiles });
  confirmMark(before, fileProgress(getState()), fileIndex === state.active);
}

export function toggleUnitViewed(unit: Unit | null): void {
  if (!unit) return;
  const state = getState();
  const key = unitViewKey(unit);
  const viewedUnits = toggledMark(state.viewedUnits, key);
  void saveMark({ list: 'units', key, on: viewedUnits.has(key) });
  const before = unitProgress(state);
  const inbox = inboxMark(state, unit, viewedUnits);
  commit({ viewedUnits, ...inbox?.patch });
  inbox?.done();
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
  if (after.done === after.total) pop(document.querySelector('#nav [data-part="progress"] svg'));
}
