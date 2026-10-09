// lens viewer: keyboard shortcuts (listed in the ? help, components/KeysDialog/const.ts).

import { commit, getState } from './store.ts';
import { activeFile } from './model/plans.ts';
import { currentUnit } from './model/summaryList.ts';
import { treeModel } from './model/tree.ts';
import { closeTab, pinTab, stepFile } from './actions/tabs.ts';
import { collapseAll, expandAll } from './actions/folds.ts';
import { openDialog, openSearch } from './actions/dialogs.ts';
import { openUnitInCode, showOverview, stepSummary } from './actions/summary.ts';
import { refresh } from './actions/session.ts';
import { setHideTests, setHunksOnly, setShowRemoved, stepThreshold } from './actions/toolbar.ts';
import { setView } from './actions/views.ts';
import { toggleFileViewed, toggleUnitViewed } from './actions/viewed.ts';
import { toggleNav } from './actions/sidebar.ts';
import { askOpenAndFocus, askSetOpen } from './ask/rail.ts';
import { isDiffMode } from './shared.ts';

/** The keys that also work on the Summary tab: the toolbar's act on the open unit's code. */
const SUMMARY_KEYS = ['?', 'x', 's', 'r', 'e', 'c', '[', ']', 'h', 't', 'a', '\\'];

/** Shows the nav (if it's collapsed) and focuses one of its filters. */
function focusFilter(selector: string) {
  if (getState().navCollapsed) commit((state) => ({ navCollapsed: !state.navCollapsed }));
  document.querySelector<HTMLInputElement>(selector)?.focus();
}

export function onKeyDown(event: KeyboardEvent): void {
  // ⌘P / Ctrl+P opens the search palette from anywhere (and suppresses print)
  if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'p') {
    event.preventDefault();
    openSearch();
    return;
  }
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  // keys go to text fields and selects; a clicked checkbox (viewed, a fold chip) keeps focus but takes no letters
  const target = event.target;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return;
  if (target instanceof HTMLInputElement && target.type !== 'checkbox') return;
  if (document.querySelector('dialog[open]')) return; // Esc closes natively

  const state = getState();
  if (event.key === 'v' && state.data.summary) {
    setView(state.view === 'summary' ? 'code' : 'summary');
    return;
  }
  if (state.view === 'summary') {
    switch (event.key) {
      case 'j':
        return stepSummary(1);
      case 'k':
        return stepSummary(-1);
      case 'o':
        return openUnitInCode(currentUnit(state));
      case 'm':
        return toggleUnitViewed(currentUnit(state));
      case 'g':
        return showOverview();
      case '/':
        focusFilter('#sum-filter input');
        event.preventDefault();
        return;
    }
    if (!SUMMARY_KEYS.includes(event.key)) return;
  }
  // the file tree's keys only when there's a tree (the Summary tab always has its list)
  const hasNav = state.view === 'summary' || treeModel(state).hasTree;
  const diffMode = isDiffMode(state.data);
  switch (event.key) {
    case '?':
      openDialog('keys-modal');
      event.preventDefault();
      break;
    case 'j':
      stepFile(1);
      break;
    case 'k':
      stepFile(-1);
      break;
    case 'w':
      if (state.active >= 0) closeTab(state.active);
      break;
    case 'm':
      toggleFileViewed(state.active);
      break;
    case 'o':
      if (activeFile(state)) pinTab(state.active);
      break;
    case '/':
      if (hasNav) {
        focusFilter('#file-filter');
        event.preventDefault();
      }
      break;
    case 's':
      if (hasNav) toggleNav();
      break;
    case 'e':
      expandAll();
      break;
    case 'c':
      collapseAll();
      break;
    case '[':
      stepThreshold(-1);
      break;
    case ']':
      stepThreshold(1);
      break;
    case 'h':
      if (diffMode) setHunksOnly(!state.hunksOnly);
      break;
    case 'x':
      if (diffMode) setShowRemoved(!state.showRemoved);
      break;
    case 't':
      if (treeModel(state).testsPresent) setHideTests(!state.hideTests);
      break;
    case 'r':
      if (state.data.canRefresh && !state.refreshing) refresh();
      break;
    case 'a':
      askOpenAndFocus();
      event.preventDefault(); // the "a" mustn't land in the textarea
      break;
    case '\\':
      askSetOpen(!state.ask.open);
      break;
  }
}
