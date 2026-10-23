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
    <div className='concerns'>
      {findings(unit)
        .filter(isConcern)
        .map((finding) => {
          const { concern } = finding;
          const mark = findingMark(marks, finding);
          return (
            <div key={finding.key} className={clsx('concern', 'k-' + concern.kind, mark)}>
              <div className='concern-top'>
                <span className='kind eyebrow'>
                  <SignalIcon signal={concern.kind} /> {concernLabel(concern, mark)}
                </span>
                <Cite label={concern.line} />
              </div>
              <div className='text'>{concern.text}</div>
              <Verdict finding={finding} mark={mark} />
            </div>
          );
        })}
    </div>
  );
}
