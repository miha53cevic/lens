import clsx from 'clsx';
import { useLens } from '../../../store.ts';
import { concernLabel, findingMark, findings, isConcern, type Unit } from '../../../model/signals.ts';
import { SignalIcon } from '../../SignalIcon.tsx';
import { Cite } from './Cite.tsx';
import { Verdict } from './Verdict.tsx';
import { AgentText } from '../../AgentText.tsx';
import { tipAttrs } from '../../../../ui/Tip.tsx';

/**
 * The agent's concerns at a glance, one line each: what and where (its cite shows it in the code).
 * The whole concern and the reader's verdict sit under its line in the code; a dismissed one is
 * gone from there, so its Restore is here.
 */
export function Concerns({ unit }: { unit: Unit }) {
  const marks = useLens((state) => state.concernMarks);
  return (
    <div data-part='concerns' className='flex flex-col gap-2'>
      {findings(unit)
        .filter(isConcern)
        .map((finding) => {
          const { concern } = finding;
          const mark = findingMark(marks, finding);
          return (
            <div
              key={finding.key}
              data-part='concern'
              data-mark={mark ?? undefined}
              className={clsx(
                'group/concern flex min-w-0 items-center gap-3 border-l-4 border-(--k) py-1 pl-4 data-[mark=real]:rounded-[0_var(--radius-md)_var(--radius-md)_0] data-[mark=real]:bg-[color-mix(in_oklab,var(--k)_var(--tint),transparent)] data-[mark=dismissed]:border-line-strong data-[mark=dismissed]:opacity-60 data-[mark=dismissed]:hover:opacity-100',
                'k-' + concern.kind,
              )}
            >
              <span
                data-part='kind'
                className='inline-flex flex-none items-center gap-2 text-(--k) group-data-[mark=dismissed]/concern:text-muted eyebrow'
              >
                <SignalIcon signal={concern.kind} confirmed={mark === 'real'} /> {concernLabel(concern, mark)}
              </span>
              <span
                data-part='text'
                className='min-w-0 overflow-hidden text-md text-ellipsis whitespace-nowrap text-text group-data-[mark=dismissed]/concern:text-muted group-data-[mark=dismissed]/concern:line-through [&_.cite]:hidden'
                {...tipAttrs(concern.text, { cut: true })}
              >
                <AgentText text={concern.text} />
              </span>
              <Cite label={concern.line} />
              {mark === 'dismissed' && <Verdict finding={finding} mark={mark} size='xs' />}
            </div>
          );
        })}
    </div>
  );
}
