// The status bar, along the bottom of a page: on the left, what is going on or what went wrong
// (always one status); on the right, the standing notices. The page decides what it says; this
// draws it, the same in the viewer and in the app's own screens.

import { Check, CircleAlert, LoaderCircle, MessageSquare, Unplug } from 'lucide-react';
import clsx from 'clsx';
import { Button } from './Button.tsx';
import { riseIn } from './motion.ts';
import './StatusBar.css';

export type StatusKind = 'gone' | 'failed' | 'working' | 'waiting' | 'done' | 'idle';

export interface BarStatus {
  kind: StatusKind;
  label: string;
  /** The reason, after the label: cut when long, whole in its title */
  detail?: string | null;
  action?: BarAction | null;
}

export interface BarAction {
  label: string;
  /** The one thing left to do gets the accent */
  primary?: boolean;
  run: () => void;
}

export interface BarNotice {
  id: string;
  text: string;
  /** warn: needs the reader · live: something is connected · accent: something new · plain: a fact, no dot */
  tone: 'warn' | 'live' | 'accent' | 'plain';
  /** A notice that leads somewhere is a button */
  run?: () => void;
  /** The button's id, for the page's own use */
  buttonId?: string;
}

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
      return <span className='dot status-dot' />;
  }
}

export function StatusBar({ status, notices }: { status: BarStatus; notices: BarNotice[] }) {
  return (
    <footer className='status-bar' id='status-bar'>
      {/* polite: a screen reader hears what the bar says, without being interrupted */}
      <div className={clsx('status', 'status-' + status.kind)} id='status' role='status' aria-live='polite'>
        <StatusIcon kind={status.kind} />
        {/* a new status rises into place, so it's noticed from the corner of the eye */}
        <span key={status.kind + ' ' + status.label} ref={riseIn} className='status-label'>
          {status.label}
        </span>
        {/* a long reason is cut: the whole of it is in the title */}
        {status.detail && (
          <span className='status-detail' title={status.detail}>
            {status.detail}
          </span>
        )}
      </div>
      {status.action && (
        <Button
          id='status-action'
          size='sm'
          variant={status.action.primary ? 'primary' : 'default'}
          onClick={status.action.run}
        >
          {status.action.label}
        </Button>
      )}
      <div className='status-notices'>
        {notices.map((notice) => {
          const dot = notice.tone !== 'plain' && (
            <span className={clsx('dot notice-dot', notice.tone === 'live' && 'pulse')} />
          );
          return notice.run ? (
            <Button
              key={notice.id}
              id={notice.buttonId}
              size='sm'
              className={clsx('status-notice', notice.tone)}
              onClick={notice.run}
            >
              {dot}
              {notice.text}
            </Button>
          ) : (
            <span key={notice.id} className={clsx('status-fact', notice.tone)}>
              {dot}
              {notice.text}
            </span>
          );
        })}
      </div>
    </footer>
  );
}
