// The launcher's status bar: the viewer's (components/StatusBar), for the app's own screens. On
// the left, the one status: what the tab is doing or what went wrong. On the right, the notices.

import clsx from 'clsx';
import { Check, CircleAlert, LoaderCircle, MessageSquare } from 'lucide-react';
import type { LauncherState } from '../../shared/api.ts';
import { Button } from '../../../src/render/web/client/ui/Button.tsx';
import '../../../src/render/web/client/components/StatusBar/style.css';
import { useApp } from '../store.ts';

type Kind = 'idle' | 'working' | 'failed' | 'done' | 'waiting';

interface Shown {
  kind: Kind;
  label: string;
  detail?: string;
  action?: { label: string; run: () => void };
}

/** The one status, strongest first: the tab's own, then what stands in the way of a review. */
function shown(state: LauncherState): Shown {
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

function StatusIcon({ kind }: { kind: Kind }) {
  switch (kind) {
    case 'failed':
      return <CircleAlert size={13} className='status-icon' />;
    case 'working':
      return <LoaderCircle size={13} className='status-icon spin' />;
    case 'waiting':
      return <MessageSquare size={13} className='status-icon' />;
    case 'done':
      return <Check size={13} className='status-icon' />;
    case 'idle':
      return <span className='status-dot' />;
  }
}

export function StatusLine() {
  const state = useApp((whole) => whole);
  const status = shown(state);
  // true when it shows: only where it helps (not on Settings, which is where it leads)
  const commandMissing = state.screen !== 'settings' && state.setup.cli.state === 'missing';
  return (
    <footer className='status-bar' id='status-bar'>
      <div className={clsx('status', 'status-' + status.kind)} id='status' role='status' aria-live='polite'>
        <StatusIcon kind={status.kind} />
        <span className='status-label'>{status.label}</span>
        {/* a long reason is cut: the whole of it is in the title */}
        {status.detail && (
          <span className='status-detail' title={status.detail}>
            {status.detail}
          </span>
        )}
      </div>
      {status.action && (
        <Button id='status-action' size='sm' onClick={status.action.run}>
          {status.action.label}
        </Button>
      )}
      <div className='status-notices'>
        {commandMissing && (
          <Button
            id='setup-notice'
            size='sm'
            className='status-notice warn'
            onClick={() => window.lensApp.launcher.settings()}
          >
            <span className='notice-dot' />
            The lens command isn't installed · Set up
          </Button>
        )}
        {state.git && <span className='status-fact'>git {state.git}</span>}
      </div>
    </footer>
  );
}
