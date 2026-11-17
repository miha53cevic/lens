// What the bar's buttons do. The model (model/status.ts) names an action; this is where it runs.

import type { NoticeActionId, StatusActionId } from '../../model/status.ts';
import { openSettings } from '../../actions/dialogs.ts';
import { refresh } from '../../actions/session.ts';
import { dismissNotice, retryServer } from '../../actions/status.ts';
import { showOverview } from '../../actions/summary.ts';
import { setView } from '../../actions/views.ts';
import { askSetOpen } from '../../ask/rail.ts';
import { openRuns } from '../../actions/agentRuns.ts';

interface StatusAction {
  label: string;
  /** The one thing left to do gets the accent */
  primary?: boolean;
  run: () => void;
}

export const STATUS_ACTIONS: Record<StatusActionId, StatusAction> = {
  retry: { label: 'Retry', primary: true, run: retryServer },
  dismiss: { label: 'Dismiss', run: dismissNotice },
  openAsk: { label: 'Open Ask', run: () => askSetOpen(true) },
  openRuns: { label: 'Show', run: openRuns },
};

export const NOTICE_ACTIONS: Record<NoticeActionId, () => void> = {
  // the overview says how many summaries are stale, and what to run
  openOverview: () => {
    setView('summary');
    showOverview();
  },
  // opening the tab loads the summary that waits
  openSummary: () => setView('summary'),
  // the code moved on: take it as it is now
  refresh: () => void refresh(),
  // Settings lists each problem, with the field and why
  openSettings: () => openSettings('config'),
  // the TypeScript switch, and the hint of what it runs
  openFlags: () => openSettings('flags'),
};
