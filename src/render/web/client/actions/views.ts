// The Code view and the Summary tab: switching between them, jumping to a line.

import type { SummaryView } from '../../../../summary/view.ts';
import { commit, getState, type LensState, toggled, update, type View } from '../store.ts';
import { flashRow } from '../shared.ts';
import { fileSpans } from '../rows.ts';
import { revealIfTest, visibleActive, withTab } from './tabs.ts';
import { openFoldAround } from './folds.ts';
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
    else checkSummaryStamp(); // a submit while the window kept its focus
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

// A submit from the agent lands in summary.json; notice it when the reader comes back
// to the window, or opens the Summary tab.
export async function checkSummaryStamp(): Promise<void> {
  const summary = getState().data.summary;
  if (!summary) return;
  try {
    // not a slow action: only whether the server is there goes to the status bar
    const response = await reach('/api/summary/stamp');
    const { stamp } = await response.json();
    if (stamp !== null && stamp !== summary.stamp) {
      if (getState().view === 'summary') await loadSummary();
      else update({ summaryDot: true });
    }
  } catch {
    /* server gone — nothing to do */
  } finally {
    if (getState().summaryChecking) update({ summaryChecking: false });
  }
}

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
