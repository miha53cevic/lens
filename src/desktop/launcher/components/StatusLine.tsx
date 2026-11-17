// The launcher's status bar: ui/StatusBar, for the app's own screens. On the left, the one status:
// what the tab is doing or what went wrong. On the right, the notices.

import type { LauncherState } from '../../shared/api.ts';
import { StatusBar, type BarNotice, type BarStatus } from '../../../ui/StatusBar.tsx';
import { useApp } from '../store.ts';

/** The one status, strongest first: the tab's own, then what stands in the way of a review. */
function shown(state: LauncherState): BarStatus {
  const { launcher } = window.lensApp;
  const { status } = state;
  if (status.kind === 'working') {
    const cancel = status.cancellable ? { label: 'Cancel', run: () => launcher.cancel() } : undefined;
    return { kind: 'working', label: status.label, action: cancel };
  }
  if (status.kind === 'failed') {
    const dismiss = { label: 'Dismiss', run: () => launcher.dismiss() };
    return { kind: 'failed', label: status.label, detail: status.detail, action: dismiss };
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
  if (state.screen === 'picker' && state.running) {
    return {
      kind: 'waiting',
      label: `lens is already open on port ${state.running.port}`,
      detail: "your agent's answers go to whichever started last",
      action: { label: 'Show that one here', run: () => launcher.showRunning() },
    };
  }
  return { kind: 'idle', label: 'Ready' };
}

export function StatusLine() {
  const state = useApp((whole) => whole);
  const notices: BarNotice[] = [];
  // what Setup needs is the strip's dot alone, never a notice here
  // Setup has a row for git, its version with it
  if (state.git && state.screen !== 'setup') notices.push({ id: 'git', text: 'git ' + state.git, tone: 'plain' });
  return <StatusBar status={shown(state)} notices={notices} />;
}
