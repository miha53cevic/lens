// The status bar, along the bottom of a page: on the left, what is going on or what went wrong
// (always one status); on the right, the standing notices. The page decides what it says; this
// draws it, the same in the viewer and in the app's own screens.

import type { ReactNode } from 'react';
import { Check, CircleAlert, MessageSquare, TriangleAlert, Unplug } from 'lucide-react';
import clsx from 'clsx';
import { Button } from './Button.tsx';
import { riseIn } from './motion.ts';
import { Spinner } from './Spinner.tsx';
import { tipAttrs } from './Tip.tsx';

export type StatusKind = 'gone' | 'failed' | 'working' | 'waiting' | 'done' | 'idle';

export interface BarStatus {
  kind: StatusKind;
  label: string;
  /** The reason, after the label: cut when long, whole in its tooltip */
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
  /** warn: needs the reader (a triangle) · live: something is connected · accent: something new · plain: a fact, no dot */
  tone: 'warn' | 'live' | 'accent' | 'plain';
  /** A notice that leads somewhere is a button */
  run?: () => void;
  /** The button's id, for the page's own use */
  buttonId?: string;
  /** In place of the dot: what the notice is about (a language server's mark) */
  icon?: ReactNode;
  /** More than the text says: its tooltip */
  tip?: string;
}

// the color carries meaning only on the icon and the label; the reason after it is ordinary muted text
const ICON_COLORS: Record<StatusKind, string> = {
  gone: 'text-danger',
  failed: 'text-danger',
  working: 'text-accent',
  waiting: 'text-question',
  done: 'text-add',
  idle: '',
};
// at rest: deliberately dull, so any other status stands out against it
const LABEL_COLORS: Record<StatusKind, string> = {
  gone: 'text-danger font-semibold',
  failed: 'text-danger font-semibold',
  working: 'text-text font-semibold',
  waiting: 'text-text font-semibold',
  done: 'text-text font-semibold',
  idle: 'text-muted font-normal',
};
// ui/Button, at the bar's size
const BAR_BUTTON = 'h-[20px] px-3 text-xs';
const NOTICE_DOTS: Record<'live' | 'accent', string> = {
  live: '[--dot:var(--add)]',
  accent: '[--dot:var(--accent)]',
};
// a notice is a flat item, as an editor's status bar has them: the bar's full height, a tint under the pointer
const NOTICE = 'inline-flex h-full flex-none items-center gap-2 px-2';

function StatusIcon({ kind }: { kind: StatusKind }) {
  const ICON = 'flex-none ' + ICON_COLORS[kind];
  switch (kind) {
    case 'gone':
      return <Unplug size={13} className={ICON} />;
    case 'failed':
      return <CircleAlert size={13} className={ICON} />;
    case 'working':
      return <Spinner className={ICON} />;
    case 'waiting':
      return <MessageSquare size={13} className={ICON} />;
    case 'done':
      return <Check size={13} className={ICON} />;
    case 'idle':
      return <span className='dot mx-1 [--dot:var(--faint)]' />;
  }
}

export function StatusBar({ status, notices }: { status: BarStatus; notices: BarNotice[] }) {
  return (
    <footer
      data-part='status-bar'
      className='flex h-[28px] flex-none items-center gap-2 border-t border-line bg-bg pr-1 pl-3 text-xs whitespace-nowrap text-muted'
      id='status-bar'
    >
      {/* polite: a screen reader hears what the bar says, without being interrupted */}
      {/* the status gives way last: a long reason is cut, never the notices' fault */}
      <div
        className='flex min-w-0 items-center gap-2'
        data-kind={status.kind}
        id='status'
        role='status'
        aria-live='polite'
      >
        <StatusIcon kind={status.kind} />
        {/* a new status rises into place, so it's noticed from the corner of the eye */}
        <span
          key={status.kind + ' ' + status.label}
          ref={riseIn}
          data-part='status-label'
          className={'flex-none ' + LABEL_COLORS[status.kind]}
        >
          {status.label}
        </span>
        {/* a long reason is cut: the whole of it is in the tooltip */}
        {status.detail && (
          <span
            data-part='status-detail'
            className='min-w-0 overflow-hidden text-ellipsis'
            {...tipAttrs(status.detail, { cut: true })}
          >
            {status.detail}
          </span>
        )}
      </div>
      {status.action && (
        <Button
          id='status-action'
          size='sm'
          className={BAR_BUTTON}
          variant={status.action.primary ? 'primary' : 'default'}
          onClick={status.action.run}
        >
          {status.action.label}
        </Button>
      )}
      {/* the items touch: their hover tints meet, as the bar's own sections */}
      <div data-part='status-notices' className='ml-auto flex h-full min-w-0 items-center overflow-hidden'>
        {notices.map((notice) => {
          const mark =
            notice.icon ??
            (notice.tone === 'warn' ? (
              <TriangleAlert data-part='notice-warn' size={13} className='flex-none text-risk' />
            ) : (
              notice.tone !== 'plain' && (
                <span
                  data-part='notice-dot'
                  className={clsx('dot', NOTICE_DOTS[notice.tone], notice.tone === 'live' && 'pulse')}
                />
              )
            ));
          return notice.run ? (
            <Button
              key={notice.id}
              id={notice.buttonId}
              variant='ghost'
              size='sm'
              data-part='status-notice'
              className={clsx(NOTICE, 'rounded-none border-0 text-xs font-normal')}
              data-tone={notice.tone}
              {...tipAttrs(notice.tip)}
              onClick={notice.run}
            >
              {mark}
              {notice.text}
            </Button>
          ) : (
            <span key={notice.id} className={NOTICE} data-tone={notice.tone} {...tipAttrs(notice.tip)}>
              {mark}
              {notice.text}
            </span>
          );
        })}
      </div>
    </footer>
  );
}
