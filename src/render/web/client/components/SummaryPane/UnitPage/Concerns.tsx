import clsx from 'clsx';
import type { Concern } from '../../../../../../summary/store.ts';
import { useLens } from '../../../store.ts';
import { concernLabel, concernMark, SIGNALS, type Unit } from '../../../model/signals.ts';
import { Cite } from './Cite.tsx';
import { Verdict } from './Verdict.tsx';

/** The agent's concerns, each with the reader's verdict. */
export function Concerns({ unit, concerns }: { unit: Unit; concerns: Concern[] }) {
  const marks = useLens((state) => state.concernMarks);
  return (
    <div className='concerns'>
      {concerns.map((concern, concernIndex) => {
        const mark = concernMark(marks, unit, concern);
        return (
          <div key={concernIndex} className={clsx('concern', 'k-' + concern.kind, mark)}>
            <span className='ic'>{SIGNALS[concern.kind].icon}</span>
            <span className='kind'>{concernLabel(concern, mark)}</span>
            <Cite label={concern.line} />
            <Verdict unit={unit} concern={concern} concernIndex={concernIndex} mark={mark} />
            <div className='text'>{concern.text}</div>
          </div>
        );
      })}
    </div>
  );
}
