// The rows of a code plan (rows.ts): the Code view's file and a summary unit's code alike.

import type { ReactNode } from 'react';
import type { CodeItem } from '../../rows.ts';
import { BreakRow, GapRow, LineRow, RemovedLineRow } from './Rows.tsx';
import { Region } from './Region.tsx';
import { Context } from './Context.tsx';
import type { RowContext } from './types.ts';
import './style.css';

export { RemovedRow } from './Rows.tsx';
export { SplitRows, holdSelectionSide } from './Split.tsx';

interface CodeRowsProps extends RowContext {
  items: CodeItem[];
}

export function CodeRows({ items, ...context }: CodeRowsProps) {
  return <>{planRows(items, context)}</>;
}

/** The rows for plan items, each followed by the notes on it. */
export function planRows(items: CodeItem[], context: RowContext): ReactNode[] {
  return items.flatMap((item, itemIndex) => itemRows(item, itemIndex, context));
}

function itemRows(item: CodeItem, itemIndex: number, context: RowContext): ReactNode[] {
  const { lines, changedLines, removedWords, gutter, marks } = context;
  const withNotes = (label: string, row: ReactNode) => [row, ...(marks?.notes?.get(label) ?? [])];
  switch (item.kind) {
    case 'line': {
      const label = 'N' + item.line;
      return withNotes(
        label,
        <LineRow
          key={label}
          line={item.line}
          html={lines[item.line - 1] ?? ''}
          changed={changedLines.has(item.line)}
          gutter={gutter}
          extraClass={marks?.classes?.get(label)}
        />,
      );
    }
    case 'removed': {
      const label = 'O' + item.old;
      return withNotes(
        label,
        <RemovedLineRow
          key={label}
          text={item.text}
          oldLine={item.old}
          words={removedWords?.get(item.old)}
          gutter={gutter}
          extraClass={marks?.classes?.get(label)}
        />,
      );
    }
    case 'gap':
      return [<GapRow key={item.key} lineCount={item.end - item.start + 1} gapKey={item.key} gutter={gutter} />];
    case 'break':
      return [<BreakRow key={'break' + itemIndex} gutter={gutter} />];
    case 'region':
      return [
        <Region key={'R' + item.region.startLine} region={item.region} labels={bodyLabels(item.body)} context={context}>
          {planRows(item.body, context)}
        </Region>,
      ];
    case 'context':
      return [
        <Context key={item.key} item={item} context={context}>
          {planRows(item.body, context)}
        </Context>,
      ];
  }
}

/** The labels of a fold's own rows. */
function bodyLabels(body: CodeItem[]): string[] {
  return body.flatMap((item) =>
    item.kind === 'line' ? ['N' + item.line] : item.kind === 'removed' ? ['O' + item.old] : [],
  );
}
