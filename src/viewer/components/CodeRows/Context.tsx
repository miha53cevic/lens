import { ChevronsDown, ChevronsUp } from 'lucide-react';
import type { ReactNode } from 'react';
import clsx from 'clsx';
import type { CodeItem } from '../../rows.ts';
import { plural } from '../../../cli-app/text.ts';
import { toggleContext } from '../../actions/folds.ts';
import type { RowContext } from './types.ts';

/** How many of a stretch's names its bar lists before "+N more" */
const NAMES_SHOWN = 4;

interface ContextProps {
  item: Omit<Extract<CodeItem, { kind: 'context' }>, 'body'>;
  context: RowContext;
  /** Its rows, unified or side by side */
  children: ReactNode;
}

/**
 * Full units: the rest of the unit's file above or below it, behind a bar that says what it
 * holds. A click on the bar opens it as ordinary code, and closes it again. Above opens over
 * its bar, so the bar stays on the unit's top edge and on screen where it was (toggleContext).
 * Its rows are there while it's closed, as a fold's are, so a jump to one of them finds it
 * (openFoldAround).
 */
export function Context({ item, context, children }: ContextProps) {
  const changed = item.added > 0 || item.removed > 0;
  const hidden = item.names.length - NAMES_SHOWN;
  const body = <div className='context-body'>{children}</div>;
  const Arrow = item.side === 'above' ? ChevronsUp : ChevronsDown;
  return (
    <div className={clsx('context', item.side, item.open && 'open')} data-key={item.key}>
      {item.side === 'above' && body}
      <div className='row context-bar' onClick={(event) => toggleContext(item.key, event.currentTarget)}>
        <span className='num'>
          {''.padStart(context.gutter)}
          <Arrow className='context-arrow' size={14} strokeWidth={2.25} />
        </span>
        <span className={clsx('mark', changed && 'changed')} />
        <span className='context-label'>
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
      {item.side === 'below' && body}
    </div>
  );
}
