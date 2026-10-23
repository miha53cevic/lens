import { ArrowRight } from 'lucide-react';
import type { ChangeRow } from '../../../../cli-app/summary/store.ts';
import { Cite } from './Cite.tsx';

interface ChangesProps {
  changes: ChangeRow[];
  /** The row under the pointer: its cite, or null once the pointer leaves */
  onHover: (cite: string | null) => void;
}

/** What behaves differently, one sentence per situation: when …, what it did, what it does now, and the line that causes it. */
export function Changes({ changes, onHover }: ChangesProps) {
  return (
    <div className='chg'>
      <div className='section-label eyebrow'>What behaves differently</div>
      {changes.map((change, changeIndex) => (
        <p
          key={changeIndex}
          className='scn'
          data-line={change.line}
          onMouseEnter={() => onHover(change.line)}
          onMouseLeave={() => onHover(null)}
        >
          <span className='when'>When {change.when}:</span>{' '}
          {change.before ? (
            <>
              <del>{change.before}</del> <ArrowRight size={12} className='to' />{' '}
            </>
          ) : (
            <span className='new-b eyebrow sm' title="behavior that didn't exist before">
              new
            </span>
          )}
          <ins>{change.now}</ins> <Cite label={change.line} />
        </p>
      ))}
    </div>
  );
}
