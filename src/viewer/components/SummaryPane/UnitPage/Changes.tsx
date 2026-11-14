import { ArrowRight } from 'lucide-react';
import type { ChangeRow } from '../../../../cli-app/summary/store.ts';
import { Cite } from './Cite.tsx';
import { AgentText } from '../../AgentText.tsx';
import { tipAttrs } from '../../../../ui/Tip.tsx';

interface ChangesProps {
  changes: ChangeRow[];
  /** The row under the pointer: its cite, or null once the pointer leaves */
  onHover: (cite: string | null) => void;
}

/** What behaves differently, one sentence per situation: when …, what it did, what it does now, and the line that causes it. */
export function Changes({ changes, onHover }: ChangesProps) {
  return (
    <div className='flex flex-col gap-2'>
      <div data-part='section-label' className='eyebrow mb-1'>
        What behaves differently
      </div>
      {changes.map((change, changeIndex) => (
        <p
          key={changeIndex}
          data-part='scn'
          className='-mx-2 my-0 rounded-md px-2 py-1 text-base/[1.6] hover:bg-hover-bg [&_del]:text-muted [&_del]:decoration-del [&_ins]:rounded-xs [&_ins]:bg-add-bg [&_ins]:px-1 [&_ins]:text-text [&_ins]:no-underline [&_ins]:shadow-[inset_0_-1.5px_0_var(--add)]'
          data-line={change.line}
          onMouseEnter={() => onHover(change.line)}
          onMouseLeave={() => onHover(null)}
        >
          <span className='font-serif text-muted italic'>
            When <AgentText text={change.when} />:
          </span>{' '}
          {change.before ? (
            <>
              <del>
                <AgentText text={change.before} />
              </del>{' '}
              <ArrowRight size={12} className='align-[-1px] text-faint' />{' '}
            </>
          ) : (
            <span
              className='mr-2 rounded-xs bg-add p-1 align-[2px] leading-none text-surface eyebrow sm'
              {...tipAttrs("behavior that didn't exist before")}
            >
              new
            </span>
          )}
          <ins>
            <AgentText text={change.now} />
          </ins>{' '}
          <Cite label={change.line} />
        </p>
      ))}
    </div>
  );
}
