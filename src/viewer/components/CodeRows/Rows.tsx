// The single rows of the code. They re-render only when their own props change: a fold level
// or a selection change touches a few rows, not the whole file.

import { memo } from 'react';
import clsx from 'clsx';
import { expandGap } from '../../actions/folds.ts';
import { plural } from '../../../cli-app/text.ts';

interface LineRowProps {
  line: number;
  /** The number shown, when it isn't `line`: side by side, an unchanged line's old-side number */
  num?: number;
  /** The highlighted line, as HTML */
  html: string;
  changed: boolean;
  gutter: number;
  extraClass?: string;
}

export const LineRow = memo(function LineRow({ line, num, html, changed, gutter, extraClass }: LineRowProps) {
  return (
    <div className={clsx('row', changed && 'changed', extraClass)} data-line={line}>
      <span className='num'>{String(num ?? line).padStart(gutter)}</span>
      <span className={clsx('mark', changed && 'changed')} />
      <span dangerouslySetInnerHTML={{ __html: html || ' ' }} />
    </div>
  );
});

interface RemovedLineRowProps {
  /** The highlighted line, as HTML (word diff's marks in it) */
  html: string;
  /** Its old-side line: cites and the Ask rail point at it */
  oldLine: number;
  /** Side by side: the old side numbers its lines (unified marks them −) */
  numbered?: boolean;
  gutter: number;
  extraClass?: string;
}

export const RemovedLineRow = memo(function RemovedLineRow({
  html,
  oldLine,
  numbered,
  gutter,
  extraClass,
}: RemovedLineRowProps) {
  return (
    <div className={clsx('row removed', extraClass)} data-old={oldLine}>
      <span className='num'>{(numbered ? String(oldLine) : '−').padStart(gutter)}</span>
      <span className='mark' />
      <span dangerouslySetInnerHTML={{ __html: html || ' ' }} />
    </div>
  );
});

/** A removed line with nothing to point at (a renamed unit's old code). */
export function RemovedRow({ text, gutter }: { text: string; gutter: number }) {
  return (
    <div className='row removed'>
      <span className='num'>{'−'.padStart(gutter)}</span>
      <span className='mark' />
      <span>{text || ' '}</span>
    </div>
  );
}

/** Side by side: the side a line doesn't have (an added line has no old side, a removed one no new side). */
export function EmptyHalf({ side, gutter }: { side: 'left' | 'right'; gutter: number }) {
  return (
    <div className={clsx('row half none', side)}>
      <span className='num'>{''.padStart(gutter)}</span>
      <span className='mark' />
      <span />
    </div>
  );
}

interface GapRowProps {
  lineCount: number;
  gapKey: string;
  gutter: number;
}

/** Hidden unchanged lines (hunks only), shown on a click. */
export function GapRow({ lineCount, gapKey, gutter }: GapRowProps) {
  return (
    <div className='row gap' onClick={() => expandGap(gapKey)}>
      <span className='num'>{'⋯'.padStart(gutter)}</span>
      <span className='mark' />
      <span>{'⋯ ' + lineCount + ' unchanged line' + (lineCount === 1 ? '' : 's')}</span>
    </div>
  );
}

/** "10–21", or "14" for one line */
export function lineSpan(start: number, end: number): string {
  return start === end ? String(start) : start + '–' + end;
}

interface SplitGapRowProps {
  /** Its new-side lines, and the same lines' old-side numbers */
  start: number;
  end: number;
  oldStart: number;
  oldEnd: number;
  gapKey: string;
  gutter: number;
}

/** Side by side, hidden unchanged lines: each half says which of its side's lines they are. */
export function SplitGapRow({ start, end, oldStart, oldEnd, gapKey, gutter }: SplitGapRowProps) {
  const label = plural(end - start + 1, 'unchanged line') + ' · ';
  // the right half first, as in every split row
  return (
    <div className='srow gap-row' onClick={() => expandGap(gapKey)}>
      <div className='row half right gap'>
        <span className='num'>{'⋯'.padStart(gutter)}</span>
        <span className='mark' />
        <span>{label + lineSpan(start, end)}</span>
      </div>
      <div className='row half left gap'>
        <span className='num'>{'⋯'.padStart(gutter)}</span>
        <span className='mark' />
        <span>{label + lineSpan(oldStart, oldEnd)}</span>
      </div>
    </div>
  );
}

/** Where the shown code jumps (a unit's ranges break). */
export function BreakRow({ gutter }: { gutter: number }) {
  return (
    <div className='row unit-gap'>
      <span className='num'>{'⋯'.padStart(gutter)}</span>
      <span className='mark' />
      <span />
    </div>
  );
}
