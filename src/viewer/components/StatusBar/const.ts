// What the bar's buttons do. The model (model/status.ts) names an action; this is where it runs.

import type { NoticeActionId, StatusActionId } from '../../model/status.ts';
import type { BarStatus } from '../../../ui/StatusBar.tsx';
import { openSettings } from '../../actions/dialogs.ts';
import { refresh } from '../../actions/session.ts';
import { dismissNotice, retryServer } from '../../actions/status.ts';
import { showOverview } from '../../actions/summary.ts';
import { setView } from '../../actions/views.ts';
import { askSetOpen } from '../../ask/rail.ts';
import { openRuns } from '../../actions/agentRuns.ts';

/** Where the status leads (the item is the button), or what is done to it (an item after it, or ×) */
type StatusAction = Pick<BarStatus, 'run' | 'tip' | 'action' | 'dismiss'>;

export const STATUS_ACTIONS: Record<StatusActionId, StatusAction> = {
  retry: { action: { label: 'Retry', primary: true, run: retryServer } },
  dismiss: { dismiss: dismissNotice },
  openAsk: { run: () => askSetOpen(true), tip: 'Open Ask' },
  openRuns: { run: openRuns, tip: 'Show the runs' },
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
