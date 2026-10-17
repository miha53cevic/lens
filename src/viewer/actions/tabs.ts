// Opening files: the editor tabs, and stepping through the tree.

import { commit, getState, type LensState, type Tab, update } from '../store.ts';
import { isTestFile } from '../shared.ts';
import { activeFile } from '../model/plans.ts';
import { firstTreeFile, treeModel, visibleFile } from '../model/tree.ts';
import { widenIn } from '../../ui/motion.ts';

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
  const state = getState();
  const tabs = withTab(state.tabs, state.active, fileIndex, pin);
  const patch = { ...revealIfTest(state, fileIndex), tabs, active: fileIndex };
  // a tab that joins the bar widens into its place; one that replaces the preview just shows
  if (tabs.length <= state.tabs.length) return update(patch);
  commit(patch);
  widenIn(document.querySelector(`#tabbar .tab[data-file="${fileIndex}"]`));
}

export function closeTab(fileIndex: number): void {
  update((state) => {
    const at = state.tabs.findIndex((tab) => tab.index === fileIndex);
    if (at === -1) return {};
    const tabs = state.tabs.filter((tab) => tab.index !== fileIndex);
    const next = tabs[Math.min(at, tabs.length - 1)];
    return { tabs, active: state.active === fileIndex ? (next ? next.index : -1) : state.active };
  });
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
