// The Code view and the Summary tab: switching between them, jumping to a line.

import type { StampResponse } from '../../cli-app/render/web/server.ts';
import type { SummaryView } from '../../cli-app/summary/view.ts';
import { commit, getState, type LensState, toggled, update, type View } from '../store.ts';
import { flashRow } from '../shared.ts';
import { fileSpans } from '../rows.ts';
import { revealIfTest, visibleActive, withTab } from './tabs.ts';
import { openFoldAround } from './folds.ts';
import { isBusy } from '../model/status.ts';
import type { Watcher } from '../poll.ts';
import { noteDone, reach, request, tracked } from './status.ts';

function viewChange(state: LensState, view: View): Partial<LensState> {
  if (view === state.view) return {};
  return view === 'code' ? { view, ...visibleActive({ ...state, view }) } : { view };
}

export function setView(view: View): void {
  const state = getState();
  if (view === 'summary' && !state.data.summary) return;
  update({ ...viewChange(state, view), ...(view === 'summary' && { summaryChecking: true }) });
  if (view === 'summary') {
    if (state.summaryDot) loadSummary().finally(() => update({ summaryChecking: false }));
    else void checkStamp(); // a submit since the last poll
  }
}

async function loadSummary(): Promise<void> {
  await tracked(
    { id: 'summary', label: 'Loading the new summary…', failed: "Couldn't load the new summary" },
    async () => {
      const response = await request('/api/summary');
      const summary: SummaryView | null = await response.json();
      // only once it's loaded: a failed load is tried again
      update((state) => ({ summaryDot: false, data: summary ? { ...state.data, summary } : state.data }));
      noteDone('New summary loaded');
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
    const response = await reach('/api/stamp');
    if (!response.ok) return;
    const stamp: StampResponse = await response.json();
    const { data, changedOnDisk, summaryDot, view } = getState();
    // only what both sides know: a review without a fingerprint (a PR) claims nothing
    const changed = stamp.change !== null && data.changeStamp !== null && stamp.change !== data.changeStamp;
    if (changed !== changedOnDisk) update({ changedOnDisk: changed });
    if (data.summary && stamp.summary !== null && stamp.summary !== data.summary.stamp) {
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

/** The stamp is polled while the page is in sight (the loop is poll.ts), and not during a refresh, which takes it all anyway. */
export const stampWatcher: Watcher = {
  id: 'stamp',
  every: STAMP_POLL_MS,
  when: () => {
    const state = getState();
    const watched = state.data.summary !== null || state.data.changeStamp !== null;
    return watched && !state.serverGone && !isBusy(state, 'refresh');
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
