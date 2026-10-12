import type { ReactNode } from 'react';
import { Check, RotateCcw, X } from 'lucide-react';
import type { Concern } from '../../../../cli-app/summary/store.ts';
import type { ConcernMark } from '../../../store.ts';
import type { Unit } from '../../../model/signals.ts';
import { setConcernMark } from '../../../actions/summary.ts';
import { Button } from '../../../../ui/Button.tsx';

interface VerdictProps {
  unit: Unit;
  concern: Concern;
  concernIndex: number;
  mark: ConcernMark | null;
}

/** The reader's call on one concern: real, or dismiss (which hides it from the counts and the code). */
export function Verdict({ unit, concern, concernIndex, mark }: VerdictProps) {
  const button = (value: ConcernMark, icon: ReactNode, label: string, tip: string) => (
    <Button
      variant={value === 'dismissed' ? 'ghost' : 'default'}
      size='sm'
      className={'vbtn v-' + value}
      data-ci={concernIndex}
      data-mark={value}
      aria-pressed={mark === value}
      title={tip}
      onClick={() => setConcernMark(unit, concern, value)}
    >
      {icon} {label}
    </Button>
  );
  if (mark === 'dismissed') {
    return <span className='verdict'>{button('dismissed', <RotateCcw size={11} />, 'Restore', 'bring it back')}</span>;
  }
  return (
    <span className='verdict' role='group' aria-label='your call'>
      {button(
        'real',
        <Check size={11} />,
        'Real',
        mark === 'real' ? 'undo: back to unreviewed' : "you checked: it's a real problem",
      )}
      {button('dismissed', <X size={11} />, 'Dismiss', 'not a problem: hides it from the code and the counts')}
    </span>
  );
}
