// Opening files: the editor tabs, and stepping through the tree.

import { commit, getState, type LensState, type Tab, update } from '../store.ts';
import { fileViewKey, isTestFile } from '../shared.ts';
import { activeFile } from '../model/plans.ts';
import { firstTreeFile, treeModel, visibleFile } from '../model/tree.ts';
import { narrowOut, stay, widenIn } from '../../ui/motion.ts';
import { measure } from './timings.ts';
import { revealInTree } from './tree.ts';

// The file gets a tab. A new file takes over the preview tab when one exists; otherwise it
// opens next to the active tab.
export function withTab(tabs: Tab[], active: number, fileIndex: number, pin?: boolean): Tab[] {
  const existing = tabs.find((tab) => tab.index === fileIndex);
  if (existing) {
    return pin && !existing.pinned ? tabs.map((tab) => (tab === existing ? { ...tab, pinned: true } : tab)) : tabs;
  }
  const preview = tabs.find((tab) => !tab.pinned);
  if (!pin && preview) return tabs.map((tab) => (tab === preview ? { ...tab, index: fileIndex } : tab));
  const activeAt = tabs.findIndex((tab) => tab.index === active);
  return [...tabs.slice(0, activeAt + 1), { index: fileIndex, pinned: !!pin }, ...tabs.slice(activeAt + 1)];
}

// A test file opened by name (a tab, a cite, a search hit) shows: "hide tests" goes off for
// this page instead of another file taking its place. The saved preference stays.
export function revealIfTest(state: LensState, fileIndex: number): Partial<LensState> {
  const file = state.data.files[fileIndex];
  return state.hideTests && file && isTestFile(file.file) ? { hideTests: false } : {};
}

/** With hide tests on, an open test file gives way to the first file the tree shows. */
export function visibleActive(state: LensState): Partial<LensState> {
  const open = activeFile(state);
  if (!state.hideTests || !open || !isTestFile(open.file)) return {};
  const first = firstTreeFile(state);
  return first >= 0 ? { active: first, tabs: withTab(state.tabs, state.active, first) } : {};
}

export function openFile(fileIndex: number, pin?: boolean): void {
  // opened again while its tab narrows out: the tab stays
  stay(tabElement(fileIndex));
  const state = getState();
  const file = state.data.files[fileIndex];
  if (fileIndex !== state.active && file) measure('open file', file.file + ', ' + file.lineCount + ' lines')();
  const tabs = withTab(state.tabs, state.active, fileIndex, pin);
  const patch = { ...revealIfTest(state, fileIndex), ...revealInTree(state, fileIndex), tabs, active: fileIndex };
  // a tab that joins the bar widens into its place; one that replaces the preview just shows
  if (tabs.length <= state.tabs.length) return update(patch);
  commit(patch);
  widenIn(tabElement(fileIndex));
}

const tabElement = (fileIndex: number) => document.querySelector(`#tabbar [data-part="tab"][data-file="${fileIndex}"]`);

function withoutTab(state: LensState, fileIndex: number): Partial<LensState> {
  const at = state.tabs.findIndex((tab) => tab.index === fileIndex);
  if (at === -1) return {};
  const tabs = state.tabs.filter((tab) => tab.index !== fileIndex);
  const next = tabs[Math.min(at, tabs.length - 1)];
  return { tabs, active: state.active === fileIndex ? (next ? next.index : -1) : state.active };
}

/** The file next to the tab shows at once; the tab narrows out of the bar, then leaves it. */
export function closeTab(fileIndex: number): void {
  closeTabs([fileIndex]);
}

/**
 * Several tabs close as one does: if the tab in front is among them, the nearest one left after it
 * (else before it) shows at once, and each narrows out, then leaves the bar.
 */
function closeTabs(fileIndexes: number[]): void {
  const closing = new Set(fileIndexes);
  const { tabs, active } = getState();
  if (closing.has(active)) {
    const at = tabs.findIndex((tab) => tab.index === active);
    const staying = (tab: Tab) => !closing.has(tab.index);
    const next = tabs.slice(at + 1).find(staying) ?? tabs.slice(0, at).findLast(staying);
    update({ active: next ? next.index : -1 });
  }
  for (const fileIndex of closing) {
    narrowOut(tabElement(fileIndex), () => update((state) => withoutTab(state, fileIndex)));
  }
}

const tabIndexes = (tabs: Tab[]) => tabs.map((tab) => tab.index);

export function closeAllTabs(): void {
  closeTabs(tabIndexes(getState().tabs));
}

export function closeOtherTabs(fileIndex: number): void {
  closeTabs(tabIndexes(getState().tabs.filter((tab) => tab.index !== fileIndex)));
}

export function closeTabsToTheRight(fileIndex: number): void {
  const { tabs } = getState();
  closeTabs(tabIndexes(tabs.slice(tabs.findIndex((tab) => tab.index === fileIndex) + 1)));
}

/** The tabs of files marked viewed. One viewed, then changed, counts as not viewed: it stays. */
export function closeViewedTabs(): void {
  const { tabs, data, viewedFiles } = getState();
  closeTabs(tabIndexes(tabs.filter((tab) => viewedFiles.has(fileViewKey(data.files[tab.index])))));
}

export function pinTab(fileIndex: number): void {
  update((state) => ({ tabs: state.tabs.map((tab) => (tab.index === fileIndex ? { ...tab, pinned: true } : tab)) }));
}

/** Start-up: one preview tab on the first file of the tree. */
export function openFirstTreeFile(): void {
  update((state) => {
    const first = firstTreeFile(state);
    return first < 0 ? {} : { tabs: [{ index: first, pinned: false }], active: first };
  });
}

export function stepFile(direction: number): void {
  const state = getState();
  // Walk the tree exactly as displayed (dirs-first, sorted, collapsed dirs
  // skipped); when the tree shows none, fall back to plain file order.
  const tree = treeModel(state);
  const order =
    tree.order.length > 0
      ? tree.order
      : state.data.files
          .map((file, fileIndex) => ({ fileIndex, path: file.file }))
          .filter(
            ({ path }) => visibleFile(state, path) && (tree.filter === '' || path.toLowerCase().includes(tree.filter)),
          )
          .map(({ fileIndex }) => fileIndex);
  if (order.length === 0) return;
  const position = order.indexOf(state.active);
  // stops at the first and the last file: no wrapping around
  const target = position === -1 ? (direction > 0 ? 0 : order.length - 1) : position + direction;
  if (target >= 0 && target < order.length && order[target] !== state.active) openFile(order[target]);
}
