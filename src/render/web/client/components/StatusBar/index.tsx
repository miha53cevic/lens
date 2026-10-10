// The status bar, along the bottom: on the left, what lens is doing or what went wrong (always
// one status); on the right, the standing notices. What it says is decided in model/status.ts.

import { Check, CircleAlert, LoaderCircle, MessageSquare, Unplug } from 'lucide-react';
import clsx from 'clsx';
import { useLens } from '../../store.ts';
import { barNotices, barStatus, type StatusKind } from '../../model/status.ts';
import { Button } from '../../ui/Button.tsx';
import { NOTICE_ACTIONS, STATUS_ACTIONS } from './const.ts';
import './style.css';

function StatusIcon({ kind }: { kind: StatusKind }) {
  switch (kind) {
    case 'gone':
      return <Unplug size={13} className='status-icon' />;
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

export function StatusBar() {
  const status = useLens(barStatus);
  const notices = useLens(barNotices);
  const action = status.action && STATUS_ACTIONS[status.action];

  return (
    <footer className='status-bar' id='status-bar'>
      {/* polite: a screen reader hears what the bar says, without being interrupted */}
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
      {action && (
        <Button id='status-action' size='sm' variant={action.primary ? 'primary' : 'default'} onClick={action.run}>
          {action.label}
        </Button>
      )}
      <div className='status-notices'>
        {notices.map((notice) =>
          notice.action ? (
            <Button
              key={notice.id}
              size='sm'
              className={clsx('status-notice', notice.tone)}
              onClick={NOTICE_ACTIONS[notice.action]}
            >
              <span className='notice-dot' />
              {notice.text}
            </Button>
          ) : (
            <span key={notice.id} className={clsx('status-fact', notice.tone)}>
              <span className='notice-dot' />
              {notice.text}
            </span>
          ),
        )}
      </div>
    </footer>
  );
}
