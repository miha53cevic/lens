import type { ReactNode, Ref, UIEvent } from 'react';
import clsx from 'clsx';
import { baseName } from '../shared.ts';
import { StatusBadge, type FileStatus } from '../ui/FileStatus.tsx';
import { FoldChips } from './FoldChips.tsx';
import './CodeCard.css';

interface CodeCardProps {
  status?: FileStatus;
  /** The file's path */
  path: string;
  /** Which part of the file: a summary unit's name */
  scope?: string;
  /** Lines the diff added and removed */
  added: number;
  removed: number;
  /** At the end of the header, e.g. the Summary tab's "Open in Code" */
  action?: ReactNode;
  /** A note about the whole file, under the header */
  notice?: ReactNode;
  className?: string;
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
  const { status, path, scope, added, removed, action, notice } = props;
  const name = baseName(path);
  return (
    <div className={clsx('code-card', props.className)}>
      <div className={clsx('code-head', status && 'st-' + status)}>
        {status && <StatusBadge status={status} />}
        <span className='code-path' title={path}>
          <span className='dir'>{path.slice(0, path.length - name.length)}</span>
          <b>{name}</b>
          {scope && <span className='scope'>{scope}</span>}
        </span>
        {(added > 0 || removed > 0) && (
          <span className='counts'>
            {added > 0 && <span className='a'>+{added}</span>}
            {removed > 0 && <span className='d'>−{removed}</span>}
          </span>
        )}
        <span className='spacer' />
        <FoldChips />
        {action}
      </div>
      {notice && <div className='notice'>{notice}</div>}
      <div className='code-body' ref={props.bodyRef} onScroll={props.onBodyScroll}>
        {props.children}
      </div>
    </div>
  );
}

/** How many lines the diff removed, over removed blocks. */
export function removedCount(blocks: { lines: string[] }[]): number {
  return blocks.reduce((count, block) => count + block.lines.length, 0);
}
