// The single rows of the code. They re-render only when their own props change: a fold level
// or a selection change touches a few rows, not the whole file.

import { memo } from 'react';
import clsx from 'clsx';
import { expandGap } from '../../actions/folds.ts';

interface LineRowProps {
  line: number;
  /** The highlighted line, as HTML */
  html: string;
  changed: boolean;
  gutter: number;
  extraClass?: string;
}

export const LineRow = memo(function LineRow({ line, html, changed, gutter, extraClass }: LineRowProps) {
  return (
    <div className={clsx('row', changed && 'changed', extraClass)} data-line={line}>
      <span className='num'>{String(line).padStart(gutter)}</span>
      <span className={clsx('mark', changed && 'changed')} />
      <span dangerouslySetInnerHTML={{ __html: html || ' ' }} />
    </div>
  );
});

interface RemovedLineRowProps {
  text: string;
  /** Its old-side line: cites and the Ask rail point at it */
  oldLine: number;
  gutter: number;
  extraClass?: string;
}

export const RemovedLineRow = memo(function RemovedLineRow({ text, oldLine, gutter, extraClass }: RemovedLineRowProps) {
  return (
    <div className={clsx('row removed', extraClass)} data-old={oldLine}>
      <span className='num'>{'−'.padStart(gutter)}</span>
      <span className='mark' />
      <span>{text || ' '}</span>
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

interface GapRowProps {
  lineCount: number;
  gapKey: string;
  gutter: number;
}

/** Hidden unchanged lines (hunks only), shown on a click. */
export function GapRow({ lineCount, gapKey, gutter }: GapRowProps) {
  return (
    <div className='row gap' title='click to expand' onClick={() => expandGap(gapKey)}>
      <span className='num'>{'⋯'.padStart(gutter)}</span>
      <span className='mark' />
      <span>{'⋯ ' + lineCount + ' unchanged line' + (lineCount === 1 ? '' : 's')}</span>
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
