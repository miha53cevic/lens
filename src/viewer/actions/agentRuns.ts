// The agent's runs (the Running dialog): each can be stopped, with whatever it started.

import { stampWatcher } from './views.ts';
import { check } from '../../ui/poll.ts';
import { askWatcher } from '../ask/rail.ts';
import { openDialog } from './dialogs.ts';
import { api, tracked } from './status.ts';

export function openRuns(): void {
  openDialog('runs-modal');
}

/** Stops a run; the stamp poll takes it off the list, and the rail hears its question's "Stopped." */
export function stopAgentRun(id: string): Promise<boolean> {
  return tracked({ id: 'stop-run-' + id, label: 'Stopping…', failed: "Couldn't stop the run" }, async () => {
    await api('POST /api/agent/runs/:id/stop', { id });
    void check(stampWatcher.id);
    void check(askWatcher.id);
  });
}
