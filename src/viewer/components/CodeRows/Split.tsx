// The side-by-side rows (pairRows in rows.ts): the old side on the left, the new on the right.
// In each row the right half comes first, placed by its grid column, so a lookup by line
// (a jump, a cite, the fold opener) finds the new side of an unchanged line.

import type { MouseEvent, ReactNode } from 'react';
import clsx from 'clsx';
import type { SplitItem } from '../../rows.ts';
import { BreakRow, EmptyHalf, LineRow, RemovedLineRow, SplitGapRow } from './Rows.tsx';
import { Region } from './Region.tsx';
import { Context } from './Context.tsx';
import type { RowContext } from './types.ts';
import { escapeHtml } from '../../shared.ts';

interface SplitRowsProps extends RowContext {
  items: SplitItem[];
}

export function SplitRows({ items, ...context }: SplitRowsProps) {
  return <>{splitRows(items, context)}</>;
}

/** On a press in the code: a drag selects the code of the side it starts on, not both sides' lines in turn. */
export function holdSelectionSide(event: MouseEvent<HTMLElement>): void {
  const half = event.target instanceof Element ? event.target.closest('.half') : null;
  if (half) event.currentTarget.dataset.side = half.classList.contains('left') ? 'left' : 'right';
}

function splitRows(items: SplitItem[], context: RowContext): ReactNode[] {
  return items.flatMap((item, itemIndex) => itemRows(item, itemIndex, context));
}

/** A split row and the notes on its lines, under it across both sides. */
function itemRows(item: SplitItem, itemIndex: number, context: RowContext): ReactNode[] {
  const { lines, changedLines, removed: removedLines, gutter, marks } = context;
  const notesOn = (labels: string[]) => labels.flatMap((label) => marks?.notes?.get(label) ?? []);
  const lineHalf = (line: number, side: 'left' | 'right', num?: number) => (
    <LineRow
      key={side}
      line={line}
      num={num}
      html={lines[line - 1] ?? ''}
      changed={side === 'right' && changedLines.has(line)}
      gutter={gutter}
      extraClass={clsx('half', side, (side === 'right' ? marks?.classes : marks?.left)?.get('N' + line))}
    />
  );
  switch (item.kind) {
    case 'same': {
      const label = 'N' + item.line;
      return [
        <div key={label} className='srow'>
          {lineHalf(item.line, 'right')}
          {lineHalf(item.line, 'left', item.old)}
        </div>,
        ...notesOn([label]),
      ];
    }
    case 'pair': {
      const { removed, line } = item;
      const labels = [...(removed ? ['O' + removed.old] : []), ...(line !== null ? ['N' + line] : [])];
      return [
        <div key={labels.join('|')} className='srow'>
          {line !== null ? lineHalf(line, 'right') : <EmptyHalf key='right' side='right' gutter={gutter} />}
          {removed ? (
            <RemovedLineRow
              key='left'
              html={removedLines.get(removed.old) ?? escapeHtml(removed.text)}
              oldLine={removed.old}
              numbered
              gutter={gutter}
              extraClass={clsx('half left', marks?.classes?.get('O' + removed.old))}
            />
          ) : (
            <EmptyHalf key='left' side='left' gutter={gutter} />
          )}
        </div>,
        ...notesOn(labels),
      ];
    }
    case 'gap':
      return [
        <SplitGapRow
          key={item.key}
          start={item.start}
          end={item.end}
          oldStart={item.oldStart}
          oldEnd={item.oldEnd}
          gapKey={item.key}
          gutter={gutter}
        />,
      ];
    case 'break':
      return [<BreakRow key={'break' + itemIndex} gutter={gutter} />];
    case 'region':
      return [
        <Region
          key={'R' + item.region.startLine}
          region={item.region}
          labels={bodyLabels(item.body)}
          context={context}
          split={{ old: item.old }}
        >
          {splitRows(item.body, context)}
        </Region>,
      ];
    case 'context':
      return [
        <Context key={item.key} item={item} context={context}>
          {splitRows(item.body, context)}
        </Context>,
      ];
  }
}

/** The labels of a fold's own rows. */
function bodyLabels(body: SplitItem[]): string[] {
  return body.flatMap((item) =>
    item.kind === 'same'
      ? ['N' + item.line]
      : item.kind === 'pair'
        ? [...(item.removed ? ['O' + item.removed.old] : []), ...(item.line !== null ? ['N' + item.line] : [])]
        : [],
  );
}
