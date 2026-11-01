import clsx from 'clsx';
import { useLens } from '../../../store.ts';
import { concernLabel, findingMark, findings, isConcern, type Unit } from '../../../model/signals.ts';
import { SignalIcon } from '../../SignalIcon.tsx';
import { Cite } from './Cite.tsx';
import { Verdict } from './Verdict.tsx';

/** The agent's concerns, each a callout with the reader's verdict. */
export function Concerns({ unit }: { unit: Unit }) {
  const marks = useLens((state) => state.concernMarks);
  return (
    <div className='flex flex-col gap-4'>
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
                'group/concern flex flex-col gap-2 border-l-4 border-(--k) py-1 pl-4 data-[mark=real]:rounded-[0_var(--radius-md)_var(--radius-md)_0] data-[mark=real]:bg-[color-mix(in_oklab,var(--k)_var(--tint),transparent)] data-[mark=real]:py-2 data-[mark=dismissed]:flex-row data-[mark=dismissed]:items-center data-[mark=dismissed]:border-line-strong data-[mark=dismissed]:opacity-60 data-[mark=dismissed]:hover:opacity-100',
                'k-' + concern.kind,
              )}
            >
              <div className='flex items-center gap-2'>
                <span
                  data-part='kind'
                  className='inline-flex items-center gap-2 text-(--k) group-data-[mark=dismissed]/concern:text-muted eyebrow'
                >
                  <SignalIcon signal={concern.kind} /> {concernLabel(concern, mark)}
                </span>
                <Cite label={concern.line} />
              </div>
              <div
                data-part='text'
                className='text-base/[1.55] text-text group-data-[mark=dismissed]/concern:min-w-0 group-data-[mark=dismissed]/concern:flex-1 group-data-[mark=dismissed]/concern:overflow-hidden group-data-[mark=dismissed]/concern:text-sm group-data-[mark=dismissed]/concern:text-ellipsis group-data-[mark=dismissed]/concern:whitespace-nowrap group-data-[mark=dismissed]/concern:text-muted group-data-[mark=dismissed]/concern:line-through group-data-[mark=dismissed]/concern:[&_.cite]:hidden'
              >
                {concern.text}
              </div>
              <Verdict finding={finding} mark={mark} />
            </div>
          );
        })}
    </div>
  );
}
