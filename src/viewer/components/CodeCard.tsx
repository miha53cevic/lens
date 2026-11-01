import type { ReactNode, Ref, UIEvent } from 'react';
import clsx from 'clsx';
import { cn } from '../../ui/cn.ts';
import { baseName } from '../shared.ts';
import { StatusBadge, type FileStatus, fileStatusTone } from '../../ui/FileStatus.tsx';
import { Tag } from '../../ui/Tag.tsx';
import { FoldChips } from './FoldChips.tsx';

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
  /** At the end of the header, e.g. the Summary tab's "Open in Code" */
  action?: ReactNode;
  /** A note about the whole file, under the header */
  notice?: ReactNode;
  /** Beside the code: the overview ruler */
  ruler?: ReactNode;
  className?: string;
  /** Its hook, when it's a particular kind of card */
  part?: string;
  /** The code's scroll container */
  bodyRef?: Ref<HTMLDivElement>;
  onBodyScroll?: (event: UIEvent<HTMLDivElement>) => void;
  children: ReactNode;
}

/**
 * Code on the page, the same in both views: a card whose header has the file's status, its
 * path, the lines added and removed and the fold chips, over the code (CodeRows).
 */
export function CodeCard(props: CodeCardProps) {
  const { status, path, scope, added, removed, tag, action, notice } = props;
  const name = baseName(path);
  return (
    <div
      data-part='code-card'
      data-card={props.part}
      className={cn(
        // the corners clip the code: the header and the rows stay inside the card
        'flex min-h-0 flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-1',
        props.className,
      )}
    >
      <div
        data-part='code-head'
        className={clsx(
          // the status, as a colored top edge
          'flex flex-none items-center gap-2 border-b border-line bg-surface px-4 pt-3 pb-2 text-sm whitespace-nowrap text-muted shadow-[inset_0_3px_0_var(--tone)]',
          status ? fileStatusTone(status) : '[--tone:var(--line)]',
        )}
      >
        {status && <StatusBadge status={status} />}
        <span className='flex min-w-0 items-baseline gap-2'>
          <span
            data-part='code-path'
            className='min-w-0 overflow-hidden font-mono text-sm/[1.5] text-ellipsis [&_b]:font-medium [&_b]:text-text'
            title={path}
          >
            <span data-part='dir' className='text-faint'>
              {path.slice(0, path.length - name.length)}
            </span>
            <b>{name}</b>
            {scope && (
              <span className="ml-2 font-medium text-text before:text-faint before:content-['›_']">{scope}</span>
            )}
          </span>
          {(added > 0 || removed > 0) && (
            <span data-part='counts' className='inline-flex flex-none gap-1 font-mono text-xs leading-none'>
              {added > 0 && <span className='text-add'>+{added}</span>}
              {removed > 0 && <span className='text-del'>−{removed}</span>}
            </span>
          )}
        </span>
        {tag && <Tag>{tag}</Tag>}
        <span className='flex-1' />
        <FoldChips />
        {action}
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
          ref={props.bodyRef}
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
