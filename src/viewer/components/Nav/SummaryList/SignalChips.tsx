import clsx from 'clsx';
import type { SignalFilter, SignalId } from '../../../store.ts';
import { SIGNALS } from '../../../model/signals.ts';
import { setSignalFilter } from '../../../actions/summary.ts';
import { SignalIcon } from '../../SignalIcon.tsx';
import { Tag } from '../../../../ui/Tag.tsx';

interface SignalChipsProps {
  counts: Record<NonNullable<SignalFilter>, number>;
  signal: SignalFilter;
}

/** One toggle per signal present in the diff, plus "all flagged", and "dismissed" once the reader dismissed a concern. */
export function SignalChips({ counts, signal }: SignalChipsProps) {
  if (counts.any === 0 && counts.dismissed === 0) return null;
  const chip = (id: NonNullable<SignalFilter>, label: string) => (
    // the signal's color once it's on; till then only on its icon
    <Tag
      key={id}
      data-part='sig-chip'
      className={clsx(id !== 'any' && 'sig-' + id, '[&>[data-part=tag-icon]]:text-(--sig)')}
      data-sig={id}
      color={signal === id ? 'var(--sig)' : undefined}
      icon={id !== 'any' && <SignalIcon signal={id} size={11} />}
      pressed={signal === id}
      onClick={() => setSignalFilter(id)}
    >
      {label}
      <span data-part='n' className='text-text tabular-nums'>
        {counts[id]}
      </span>
    </Tag>
  );
  const present = (Object.keys(SIGNALS) as SignalId[]).filter((id) => counts[id] > 0);

  return (
    <div className='flex flex-wrap gap-1 px-1 pt-1 pb-2'>
      {counts.any > 0 && chip('any', 'all flagged')}
      {present.map((id) => chip(id, SIGNALS[id].many))}
      {counts.dismissed > 0 && chip('dismissed', 'dismissed')}
    </div>
  );
}
