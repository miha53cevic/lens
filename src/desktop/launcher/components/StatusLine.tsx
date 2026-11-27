// The launcher's status bar: ui/StatusBar, for the app's own screens. On the left, the one status:
// what the tab is doing or what went wrong. On the right, the notices, the app's update among them:
// it is the app's, not the tab's, so it never takes the status.

import type { LauncherState } from '../../shared/api.ts';
import { Spinner } from '../../../ui/Spinner.tsx';
import { StatusBar, type BarNotice, type BarStatus } from '../../../ui/StatusBar.tsx';
import { useApp } from '../store.ts';

/** The one status, strongest first: the tab's own, then git missing, which stands in the way of any review. */
function shown(state: LauncherState): BarStatus {
  const { launcher } = window.lensApp;
  const { status } = state;
  if (status.kind === 'working') {
    const cancel = status.cancellable ? { label: 'Cancel', run: () => launcher.cancel() } : undefined;
    return { kind: 'working', label: status.label, action: cancel };
  }
  if (status.kind === 'failed') {
    return { kind: 'failed', label: status.label, detail: status.detail, dismiss: () => launcher.dismiss() };
  }
  if (status.kind === 'done') return { kind: 'done', label: status.label };
  if (state.git === null) {
    const again = { label: 'Look again', run: () => launcher.recheck() };
    return {
      kind: 'failed',
      label: "git wasn't found",
      detail: 'lens reads changes and PRs through git',
      action: again,
    };
  }
  return { kind: 'idle', label: 'Ready' };
}

/** The update, on every screen but the App page (whose row says it): each leads there. */
function updateNotice(state: LauncherState): BarNotice | null {
  const { update } = state;
  const run = () => window.lensApp.launcher.setup();
  if (update.kind === 'applying') {
    const done = update.progress === null ? '…' : ' · ' + Math.round(update.progress * 100) + '%';
    const text = 'Updating to lens ' + update.version + done;
    return {
      id: 'update',
      text,
      tone: 'accent',
      icon: <Spinner className='flex-none text-accent' />,
      run,
      tip: 'lens restarts once it is in',
    };
  }
  if (update.kind === 'available') {
    return { id: 'update', text: `lens ${update.version} available`, tone: 'accent', run, tip: "See what's new" };
  }
  if (update.kind === 'failed') return { id: 'update', text: update.label, tone: 'warn', run, tip: update.detail };
  if (state.justUpdated && state.whatsNew) {
    const text = `Updated to lens ${state.whatsNew.version} · What's new`;
    return { id: 'update', text, tone: 'accent', run };
  }
  return null;
}

export function StatusLine() {
  const state = useApp((whole) => whole);
  const notices: BarNotice[] = [];
  // lasting while the picker shows it, so a notice, not the status
  if (state.screen === 'picker' && state.running) {
    notices.push({
      id: 'running',
      text: `lens already open on port ${state.running.port}`,
      tone: 'accent',
      run: () => window.lensApp.launcher.showRunning(),
      tip: "Show that one here: your agent's answers go to whichever started last",
    });
  }
  const update = state.screen === 'setup' ? null : updateNotice(state);
  if (update) notices.push(update);
  // what Setup needs is the strip's dot alone, never a notice here
  // Setup has a row for git, its version with it
  if (state.git && state.screen !== 'setup') notices.push({ id: 'git', text: 'git ' + state.git, tone: 'plain' });
  return <StatusBar status={shown(state)} notices={notices} />;
}
