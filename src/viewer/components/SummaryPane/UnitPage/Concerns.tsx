import clsx from 'clsx';
import type { Concern } from '../../../../cli-app/summary/store.ts';
import { useLens } from '../../../store.ts';
import { concernLabel, concernMark, type Unit } from '../../../model/signals.ts';
import { SignalIcon } from '../../SignalIcon.tsx';
import { Cite } from './Cite.tsx';
import { Verdict } from './Verdict.tsx';

/** The agent's concerns, each a callout with the reader's verdict. */
export function Concerns({ unit, concerns }: { unit: Unit; concerns: Concern[] }) {
  const marks = useLens((state) => state.concernMarks);
  return (
    <div className='concerns'>
      {concerns.map((concern, concernIndex) => {
        const mark = concernMark(marks, unit, concern);
        return (
          <div key={concernIndex} className={clsx('concern', 'k-' + concern.kind, mark)}>
            <div className='concern-top'>
              <span className='kind'>
                <SignalIcon signal={concern.kind} /> {concernLabel(concern, mark)}
              </span>
              <Cite label={concern.line} />
            </div>
            <div className='text'>{concern.text}</div>
            <Verdict unit={unit} concern={concern} concernIndex={concernIndex} mark={mark} />
          </div>
        );
      })}
    </div>
  );
}
