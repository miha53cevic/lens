import { ChevronRight } from 'lucide-react';
import clsx from 'clsx';
import type { CodeItem } from '../../rows.ts';
import { plural } from '../../../cli-app/text.ts';
import { toggleContext } from '../../actions/folds.ts';
import { planRows } from './index.tsx';
import type { RowContext } from './types.ts';

/** How many of a stretch's names its bar lists before "+N more" */
const NAMES_SHOWN = 4;

interface ContextProps {
  item: Extract<CodeItem, { kind: 'context' }>;
  context: RowContext;
}

/**
 * Full units: the rest of the unit's file above or below it, behind a bar that says what it
 * holds. A click on the bar opens it as ordinary code, and closes it again. Its rows are there
 * while it's closed, as a fold's are, so a jump to one of them finds it (openFoldAround).
 */
export function Context({ item, context }: ContextProps) {
  const changed = item.added > 0 || item.removed > 0;
  const hidden = item.names.length - NAMES_SHOWN;
  return (
    <div className={clsx('context', item.side, item.open && 'open')} data-key={item.key}>
      <div className='row context-bar' onClick={() => toggleContext(item.key)}>
        <span className='num'>{''.padStart(context.gutter)}</span>
        <span className={clsx('mark', changed && 'changed')} />
        <span className='context-label'>
          <ChevronRight className={clsx('caret', item.open && 'open')} size={12} strokeWidth={2.5} />
          <span>{item.side === 'above' ? 'Above' : 'Below'}</span>
          {item.names.length > 0 && (
            <span className='context-names'>
              {item.names.slice(0, NAMES_SHOWN).join(', ')}
              {hidden > 0 && ' +' + hidden + ' more'}
            </span>
          )}
        </span>
        <span className='spacer' />
        {changed && (
          <span className='counts'>
            {item.added > 0 && <span className='a'>+{item.added}</span>}
            {item.removed > 0 && <span className='d'>−{item.removed}</span>}
          </span>
        )}
        <span className='context-count'>{plural(item.lineCount, 'line')}</span>
      </div>
      <div className='context-body'>{planRows(item.body, context)}</div>
    </div>
  );
}
