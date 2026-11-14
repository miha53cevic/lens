import { useCallback, type ReactNode, type Ref, type UIEvent } from 'react';
import { cn } from '../../../ui/cn.ts';
import { StatusLetter, type FileStatus } from '../../../ui/FileStatus.tsx';
import { Tab } from '../../../ui/Tab.tsx';
import { baseName } from '../../shared.ts';
import { Tag } from '../../../ui/Tag.tsx';
import { FoldChips } from '../FoldChips.tsx';
import { Crumbs } from './Crumbs.tsx';
import { trackView } from './util.ts';

interface CodeCardProps {
  status?: FileStatus;
  path: string;
  /** Which part of the file: a summary unit's name */
  scope?: string;
  /** Lines the diff added and removed */
  added: number;
  removed: number;
  /** A word on the change, after the counts, e.g. "formatting only" */
  tag?: string;
  /** At the end of its tab's row, e.g. the Summary tab's "Open in Code" */
  action?: ReactNode;
  /** A note about the whole file, under the header */
  notice?: ReactNode;
  /** Beside the code: the overview ruler */
  ruler?: ReactNode;
  /**
   * The Code tab's editor: it fills the pane under the file tabs, as an editor does, with no frame
   * and no tab of its own (the file tabs carry the status). Its body tracks what's in sight, for the
   * ruler's thumb. Otherwise it is a small editor in a frame: one tab for the file, then the header.
   */
  flush?: boolean;
  className?: string;
  /** Its hook, when it's a particular kind of card */
  part?: string;
  /** The code's scroll container: a callback ref, called once per body */
  bodyRef?: (body: HTMLDivElement | null) => void;
  onBodyScroll?: (event: UIEvent<HTMLDivElement>) => void;
  children: ReactNode;
}

/**
 * Code on the page, an editor in both views: the file's tab with its status, a header with the
 * file's path as a breadcrumb, the lines added and removed and the fold chips, over the code (CodeRows).
 */
export function CodeCard(props: CodeCardProps) {
  const { status, path, scope, added, removed, tag, action, notice, flush, bodyRef } = props;
  const body: Ref<HTMLDivElement> = useCallback(
    (element: HTMLDivElement | null) => {
      bodyRef?.(element);
      return element && flush ? trackView(element) : undefined;
    },
    [bodyRef, flush],
  );
  return (
    <div
      data-part='code-card'
      data-card={props.part}
      data-flush={flush || undefined}
      className={cn(
        // the corners clip the code: the header and the rows stay inside the card
        'flex min-h-0 flex-col overflow-hidden bg-surface',
        flush ? 'flex-1' : 'rounded-md border border-line',
        props.className,
      )}
    >
      {!flush && (
        <div
          data-part='code-tabs'
          role='tablist'
          className='flex h-control-lg flex-none items-stretch bg-bg shadow-[inset_0_-1px_0_var(--line)]'
        >
          <Tab active mono flat className='pr-4'>
            {status && <StatusLetter status={status} />}
            <span data-part='tab-name'>{baseName(path)}</span>
          </Tab>
          <span className='flex-1' />
          {action && <span className='flex items-center pr-2'>{action}</span>}
        </div>
      )}
      <div
        data-part='code-head'
        className='flex h-control flex-none items-center gap-2 border-b border-line bg-surface pr-3 pl-4 text-sm whitespace-nowrap text-muted'
      >
        <Crumbs path={path} scope={scope} />
        {(added > 0 || removed > 0) && (
          <span data-part='counts' className='inline-flex flex-none gap-1 font-mono text-xs leading-none'>
            {added > 0 && <span className='text-add'>+{added}</span>}
            {removed > 0 && <span className='text-del'>−{removed}</span>}
          </span>
        )}
        {tag && <Tag>{tag}</Tag>}
        <span className='flex-1' />
        <FoldChips />
      </div>
      {notice && (
        <div className='flex flex-none items-center gap-2 border-b border-line bg-[color-mix(in_oklab,var(--risk)_var(--tint),var(--surface))] px-4 py-2 text-sm text-risk'>
          {notice}
        </div>
      )}
      <div className='flex min-h-0 flex-1'>
        <div
          data-part='code-body'
          className='min-h-0 min-w-0 flex-1 overflow-auto'
          ref={body}
          onScroll={props.onBodyScroll}
        >
          {props.children}
        </div>
        {props.ruler}
      </div>
    </div>
  );
}

/** How many lines the diff removed, over removed blocks. */
export function removedCount(blocks: { lines: string[] }[]): number {
  return blocks.reduce((count, block) => count + block.lines.length, 0);
}
