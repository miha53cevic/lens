import type { ReactNode } from 'react';
import { Check, RotateCcw, X } from 'lucide-react';
import type { ConcernMark } from '../../../store.ts';
import type { Finding } from '../../../model/signals.ts';
import { setMark } from '../../../actions/summary.ts';
import { Button } from '../../../../ui/Button.tsx';

interface VerdictProps {
  finding: Finding;
  mark: ConcernMark | null;
  /** sm beside a finding in the unit's list, xs in a note under its line */
  size?: 'sm' | 'xs';
}

/** The reader's call on one finding: real, or dismiss (which hides it from the counts and the code). */
export function Verdict({ finding, mark, size = 'sm' }: VerdictProps) {
  const button = (value: ConcernMark, icon: ReactNode, label: string, tip: string) => (
    <Button
      variant={value === 'dismissed' ? 'ghost' : 'default'}
      size={size}
      // "real", once given, is the reader's check: green, as viewed is
      className={value === 'real' ? 'aria-pressed:border-add aria-pressed:bg-add aria-pressed:text-surface' : undefined}
      data-part='vbtn'
      data-mark={value}
      aria-pressed={mark === value}
      title={tip}
      onClick={() => setMark(finding.key, value)}
    >
      {icon} {label}
    </Button>
  );
  if (mark === 'dismissed') {
    return (
      <span className='inline-flex items-center gap-2'>
        {button('dismissed', <RotateCcw size={11} />, 'Restore', 'bring it back')}
      </span>
    );
  }
  return (
    <span className='inline-flex items-center gap-2' role='group' aria-label='your call'>
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
