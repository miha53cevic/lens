import clsx from 'clsx';
import type { SignalFilter, SignalId } from '../../../store.ts';
import { SIGNALS } from '../../../model/signals.ts';
import { setSignalFilter } from '../../../actions/summary.ts';

interface SignalChipsProps {
  counts: Record<SignalId | 'any', number>;
  signal: SignalFilter;
}

/** One toggle per signal present in the diff, plus "all flagged". */
export function SignalChips({ counts, signal }: SignalChipsProps) {
  if (counts.any === 0) return null;
  const chip = (id: SignalId | 'any', icon: string, label: string) => (
    <button
      key={id}
      className={clsx('sig-chip', id !== 'any' && 'sig-' + id)}
      data-sig={id}
      aria-pressed={signal === id}
      title='list only these (click again for all)'
      onClick={() => setSignalFilter(id)}
    >
      <span className='si'>{icon}</span>
      {label}
      <span className='n'>{counts[id]}</span>
    </button>
  );
  const present = (Object.keys(SIGNALS) as SignalId[]).filter((id) => counts[id] > 0);

  return (
    <div className='sig-chips'>
      {chip('any', '', 'all flagged')}
      {present.map((id) => chip(id, SIGNALS[id].icon, SIGNALS[id].many))}
    </div>
  );
}
