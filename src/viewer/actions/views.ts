// The Code view, the Summary tab and the Plan tab: switching between them, jumping to a line.

import type { StampResponse } from '../../cli-app/api/contract.ts';
import { commit, getState, type LensState, toggled, update, type View } from '../store.ts';
import { flashRow } from '../shared.ts';
import { fileSpans } from '../rows.ts';
import { revealIfTest, visibleActive, withTab } from './tabs.ts';
import { openFoldAround } from './folds.ts';
import { revealInTree } from './tree.ts';
import { isBusy } from '../model/status.ts';
import type { Watcher } from '../../ui/poll.ts';
import { api, noteDone, reach, tracked } from './status.ts';
import { loadPlans } from './planTab.ts';
import { measure } from './timings.ts';

function viewChange(state: LensState, view: View): Partial<LensState> {
  if (view === state.view) return {};
  return view === 'code' ? { view, ...visibleActive({ ...state, view }) } : { view };
}

export function setView(view: View): void {
  const state = getState();
  if (view === 'summary' && !state.data.summary) return;
  if (view === 'plan' && !state.data.planTab) return;
  if (view !== state.view) measure('view ' + view)();
  update({ ...viewChange(state, view), ...(view === 'summary' && { summaryChecking: true }) });
  if (view === 'summary') {
    if (state.summaryDot) loadSummary().finally(() => update({ summaryChecking: false }));
    else void checkStamp(); // a submit since the last poll
  }
  // the list as it is now: a plan written while the tab was away shows at once
  if (view === 'plan' && state.view !== 'plan') void loadPlans(state.plan.list !== null);
}

/** `branch`: another branch was checked out, and the summary is read under its key now */
async function loadSummary(branch = false): Promise<void> {
  await tracked(
    { id: 'summary', label: 'Loading the new summary…', failed: "Couldn't load the new summary" },
    async () => {
      const summary = await api('GET /api/summary');
      // only once it's loaded: a failed load is tried again
      update((state) => ({ summaryDot: false, data: summary ? { ...state.data, summary } : state.data }));
      if (branch) noteDone('Another branch is checked out: the summary is read for it');
      else noteDone(summary && summary.stamp === null ? 'The summary was cleared' : 'New summary loaded');
    },
  );
}

/**
 * What moved since this page's analysis, asked in one request: a summary the agent submitted
 * (it lands in summary.json), and the code itself (an edit, a `git add`, a new file).
 * The reader is told; nothing on screen changes until they open the Summary tab or refresh.
 */
export async function checkStamp(): Promise<void> {
  try {
    // not a slow action: only whether the server is there goes to the status bar
    // the Plan tab's list only while it's shown: reading it asks Lavish
    const response = await reach(getState().view === 'plan' ? '/api/stamp?plans' : '/api/stamp');
    if (!response.ok) return;
    const stamp: StampResponse = await response.json();
    const { data, changedOnDisk, summaryBuild, summaryDot, view, plan } = getState();
    if (view === 'plan' && stamp.plans !== null && plan.list && stamp.plans !== plan.list.stamp) void loadPlans(true);
    // only what both sides know: a review without a fingerprint (a PR) claims nothing
    const changed = stamp.change !== null && data.changeStamp !== null && stamp.change !== data.changeStamp;
    if (changed !== changedOnDisk) update({ changedOnDisk: changed });
    const lsp = stamp.lsp ?? null;
    if (JSON.stringify(lsp) !== JSON.stringify(getState().lspStatus)) update({ lspStatus: lsp });
    const building = stamp.building ?? null;
    if (JSON.stringify(building) !== JSON.stringify(summaryBuild)) update({ summaryBuild: building });
    // another branch checked out: its summary, and whether to check one out first, in either view
    // (nothing new is waiting, so no dot)
    if (data.summary && stamp.key && stamp.key !== data.summary.key) {
      await loadSummary(true);
      return;
    }
    // null too: the summary was cleared, here or from another viewer of the same repository
    if (data.summary && stamp.summary !== data.summary.stamp) {
      if (view === 'summary') await loadSummary();
      else if (!summaryDot) update({ summaryDot: true });
    }
  } catch {
    /* server gone — nothing to do */
  } finally {
    if (getState().summaryChecking) update({ summaryChecking: false });
  }
}

/** How often the page asks what moved. */
const STAMP_POLL_MS = 5000;

/**
 * The stamp is polled while the page is in sight (the loop is poll.ts), and not during a refresh, which takes it all anyway.
 * On the Plan tab it carries the plans too: an agent's new plan or reply shows without a refresh.
 * It goes on while the server is gone: it's the cheapest request there is, and the one that notices the server is back.
 */
export const stampWatcher: Watcher = {
  id: 'stamp',
  every: STAMP_POLL_MS,
  when: () => {
    const state = getState();
    // TypeScript's server: the status bar's notice is only as true as the last poll
    const watched =
      state.data.summary !== null ||
      state.data.changeStamp !== null ||
      state.view === 'plan' ||
      state.data.typescriptLsp;
    return watched && !isBusy(state, 'refresh');
  },
  run: checkStamp,
};

/**
 * Show the target line in the code view: expand a hidden stretch or a fold covering it,
 * scroll it centered, and flash it.
 */
export function jumpToLine(fileIndex: number, line: number, pinOrigin?: boolean): void {
  commit((state) => {
    // Pin the preview tab being read before a find-usages jump replaces it,
    // so the target opens beside it and the reader can come back.
    const tabs =
      pinOrigin && fileIndex !== state.active
        ? state.tabs.map((tab) => (tab.index === state.active ? { ...tab, pinned: true } : tab))
        : state.tabs;
    const file = state.data.files[fileIndex];
    const gap = fileSpans(file, state.hunksOnly, state.expandedGaps).find(
      (span) => span.gap !== undefined && line >= span.start && line <= span.end,
    );
    return {
      ...viewChange(state, 'code'),
      ...revealIfTest(state, fileIndex),
      ...revealInTree(state, fileIndex),
      tabs: withTab(tabs, state.active, fileIndex),
      active: fileIndex,
      expandedGaps: gap ? toggled(state.expandedGaps, gap.gap!, true) : state.expandedGaps,
    };
  });
  const row = document.querySelector<HTMLElement>('#code .row[data-line="' + line + '"]');
  if (row) landOn(row, getState().data.files[fileIndex].file, 'N' + line);
}

/**
 * A jump lands on a row ("N12" a line, "O5" a removed one): its fold opens, it scrolls into the
 * middle and flashes, and it stays marked (`landed`) so the eye can find it after the flash.
 */
export function landOn(row: HTMLElement, path: string, label: string, smooth?: boolean): void {
  openFoldAround(row, path);
  commit({ landed: { path, label } });
  flashRow(row, smooth);
}
