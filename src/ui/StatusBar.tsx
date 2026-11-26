// The status bar, along the bottom of a page: on the left, what is going on or what went wrong
// (always one status); on the right, the standing notices. Both are the same flat items, as an
// editor's status bar has them: one that leads somewhere is itself the button. The page decides
// what it says; this draws it, the same in the viewer and in the app's own screens.

import { useCallback, useId, useRef, useState, type ReactNode } from 'react';
import { Check, CircleAlert, MessageSquare, TriangleAlert, Unplug, X } from 'lucide-react';
import clsx from 'clsx';
import { Button } from './Button.tsx';
import { MenuItem, MenuPanel } from './Menu.tsx';
import { riseIn } from './motion.ts';
import { Spinner } from './Spinner.tsx';
import { tipAttrs } from './Tip.tsx';
import { cssPx } from './zoom.ts';

export type StatusKind = 'gone' | 'failed' | 'working' | 'waiting' | 'done' | 'idle';

export interface BarStatus {
  kind: StatusKind;
  label: string;
  /** The reason, after the label: cut when long, whole in its tooltip */
  detail?: string | null;
  /** The status leads somewhere (Ask, the runs): the item itself is the button */
  run?: (() => void) | null;
  /** What its click does: its tooltip */
  tip?: string;
  /** Something done to the status itself (Retry, Cancel): an item after it */
  action?: BarAction | null;
  /** It can be put away: a × after it */
  dismiss?: (() => void) | null;
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
const NOTICE_DOTS: Record<'live' | 'accent', string> = {
  live: '[--dot:var(--add)]',
  accent: '[--dot:var(--accent)]',
};
// every item: the bar's full height, a tint under the pointer; the items touch, so their tints meet
const ITEM = 'inline-flex h-full flex-none items-center gap-2 px-2';
// ui/Button, flattened into an item
const ITEM_BUTTON = 'rounded-none border-0 text-xs font-normal';
/** Room the "+N" item takes, when some notices don't fit */
const MORE_WIDTH = 40;

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
  const body = (
    <>
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
    </>
  );
  return (
    <footer
      data-part='status-bar'
      className='flex h-[28px] flex-none items-center border-t border-line bg-bg px-1 text-xs whitespace-nowrap text-muted'
      id='status-bar'
    >
      {/* polite: a screen reader hears what the bar says, without being interrupted */}
      <div
        className='flex h-full min-w-0 items-center'
        data-kind={status.kind}
        id='status'
        role='status'
        aria-live='polite'
      >
        {status.run ? (
          <Button
            variant='ghost'
            size='sm'
            data-part='status-item'
            className={clsx(ITEM, ITEM_BUTTON, 'min-w-0 flex-initial')}
            {...tipAttrs(status.tip)}
            onClick={status.run}
          >
            {body}
          </Button>
        ) : (
          <span data-part='status-item' className={clsx(ITEM, 'min-w-0 flex-initial')}>
            {body}
          </span>
        )}
      </div>
      {status.action && (
        <Button
          id='status-action'
          variant='ghost'
          size='sm'
          className={clsx(ITEM, ITEM_BUTTON, 'font-semibold', status.action.primary ? 'text-accent' : 'text-text')}
          onClick={status.action.run}
        >
          {status.action.label}
        </Button>
      )}
      {status.dismiss && (
        <Button
          id='status-dismiss'
          variant='ghost'
          size='sm'
          aria-label='Dismiss'
          className={clsx(ITEM, ITEM_BUTTON)}
          onClick={status.dismiss}
        >
          <X size={12} />
        </Button>
      )}
      <Notices notices={notices} />
    </footer>
  );
}

/**
 * The notices, along the rest of the bar from its right end. Those that don't fit fold, from the
 * last, into a "+N" item that lists them: none is cut off unseen. A folded notice stays laid out,
 * invisible, so its width is known when there's room again.
 */
function Notices({ notices }: { notices: BarNotice[] }) {
  const [fit, setFit] = useState(Infinity);
  const menuId = useId();
  const menuRef = useRef<HTMLDivElement>(null);
  // a new callback for each set of notices: React calls it again once they're drawn, and it measures them
  const noticeKey = notices.map((notice) => notice.id + '\n' + notice.text).join('\n\n');
  const followRoom = useCallback(
    (row: HTMLDivElement | null) => {
      if (!row) return;
      const place = () => {
        const widths = [...row.querySelectorAll<HTMLElement>(':scope > [data-notice]')].map((item) => item.offsetWidth);
        setFit(noticesThatFit(widths, row.clientWidth));
      };
      place();
      if (typeof ResizeObserver !== 'function') return;
      const observer = new ResizeObserver(place);
      observer.observe(row);
      return () => observer.disconnect();
    },
    [noticeKey],
  );
  const folded = notices.slice(fit);
  return (
    <div
      ref={followRoom}
      data-part='status-notices'
      className='relative flex h-full min-w-[48px] flex-1 items-center justify-end overflow-hidden'
    >
      {notices.map((notice, index) => {
        const mark = noticeMark(notice);
        // folded: out of the flow and unseen, still measured
        const fold = index >= fit && 'invisible absolute';
        return notice.run ? (
          <Button
            key={notice.id}
            id={notice.buttonId}
            variant='ghost'
            size='sm'
            data-part='status-notice'
            data-notice=''
            className={clsx(ITEM, ITEM_BUTTON, fold)}
            data-tone={notice.tone}
            {...tipAttrs(notice.tip)}
            onClick={notice.run}
          >
            {mark}
            {notice.text}
          </Button>
        ) : (
          <span
            key={notice.id}
            data-notice=''
            className={clsx(ITEM, fold)}
            data-tone={notice.tone}
            {...tipAttrs(notice.tip)}
          >
            {mark}
            {notice.text}
          </span>
        );
      })}
      {folded.length > 0 && (
        <>
          <Button
            variant='ghost'
            size='sm'
            data-part='status-more'
            className={clsx(ITEM, ITEM_BUTTON, 'order-last font-semibold text-text')}
            popoverTarget={menuId}
            aria-label={folded.length + ' more'}
            onClick={(event) => placeAbove(menuRef.current, event.currentTarget)}
          >
            +{folded.length}
          </Button>
          <MenuPanel panelRef={menuRef} id={menuId} className='w-auto max-w-[480px]'>
            {folded.map((notice) => (
              <MenuItem
                key={notice.id}
                icon={noticeMark(notice)}
                disabled={!notice.run}
                onSelect={() => notice.run?.()}
              >
                {notice.text}
              </MenuItem>
            ))}
          </MenuPanel>
        </>
      )}
    </div>
  );
}

function noticeMark(notice: BarNotice): ReactNode {
  if (notice.icon) return notice.icon;
  if (notice.tone === 'warn')
    return <TriangleAlert data-part='notice-warn' size={13} className='flex-none text-risk' />;
  if (notice.tone === 'plain') return null;
  return (
    <span data-part='notice-dot' className={clsx('dot', NOTICE_DOTS[notice.tone], notice.tone === 'live' && 'pulse')} />
  );
}

/**
 * How many notices, from the first, fit in `room` px: all when they do, otherwise those that leave
 * room for the "+N" item. No layout (every width 0, as in a test's page): all.
 */
export function noticesThatFit(widths: number[], room: number): number {
  const total = widths.reduce((sum, width) => sum + width, 0);
  if (total <= room) return widths.length;
  let used = MORE_WIDTH;
  let count = 0;
  while (count < widths.length && used + widths[count] <= room) used += widths[count++];
  return count;
}

/** The "+N" menu opens above its item (the bar is at the bottom), right-aligned with it. */
function placeAbove(menu: HTMLElement | null, trigger: HTMLElement) {
  if (!menu) return;
  const rect = trigger.getBoundingClientRect();
  menu.style.top = 'auto';
  menu.style.bottom = cssPx(window.innerHeight - rect.top) + 6 + 'px';
  menu.style.right = Math.max(8, cssPx(window.innerWidth - rect.right)) + 'px';
}
