import type { Concern } from '../../../../../../summary/store.ts';
import type { ConcernMark } from '../../../store.ts';
import type { Unit } from '../../../model/signals.ts';
import { setConcernMark } from '../../../actions/summary.ts';

interface VerdictProps {
  unit: Unit;
  concern: Concern;
  concernIndex: number;
  mark: ConcernMark | null;
}

/** The reader's call on one concern: real, or dismiss (which hides it from the counts and the code). */
export function Verdict({ unit, concern, concernIndex, mark }: VerdictProps) {
  const button = (value: ConcernMark, label: string, tip: string) => (
    <button
      className={'vbtn v-' + value}
      data-ci={concernIndex}
      data-mark={value}
      aria-pressed={mark === value}
      title={tip}
      onClick={() => setConcernMark(unit, concern, value)}
    >
      {label}
    </button>
  );
  if (mark === 'dismissed') {
    return <span className='verdict'>{button('dismissed', '↺ Restore', 'bring it back')}</span>;
  }
  return (
    <span className='verdict' role='group' aria-label='your call'>
      {button('real', '✓ Real', mark === 'real' ? 'undo: back to unreviewed' : "you checked: it's a real problem")}
      {button('dismissed', '✕ Dismiss', 'not a problem: hides it from the code and the counts')}
    </span>
  );
}
