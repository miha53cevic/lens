import type { SignalFilter, SignalId } from '../../../store.ts';
import { SIGNALS } from '../../../model/signals.ts';
import { setSignalFilter } from '../../../actions/summary.ts';
import { SignalIcon } from '../../SignalIcon.tsx';
import { Segmented } from '../../../../ui/Segmented.tsx';

interface SignalChipsProps {
  counts: Record<NonNullable<SignalFilter>, number>;
  signal: SignalFilter;
}

const NAMES: Record<NonNullable<SignalFilter>, string> = {
  any: 'All flagged',
  bug: 'Possible bugs',
  risk: 'Risks',
  question: 'Questions',
  breaks: 'May break callers',
  dismissed: 'Dismissed',
};

/**
 * The list's filter, one segment per signal present in the diff (its icon and count), after "all
 * flagged", and "dismissed" once the reader dismissed a concern. The picked one again lifts it.
 */
export function SignalChips({ counts, signal }: SignalChipsProps) {
  if (counts.any === 0 && counts.dismissed === 0) return null;
  const present = (Object.keys(SIGNALS) as SignalId[]).filter((id) => counts[id] > 0);
  const ids: NonNullable<SignalFilter>[] = [
    ...(counts.any > 0 ? ['any' as const] : []),
    ...present,
    ...(counts.dismissed > 0 ? ['dismissed' as const] : []),
  ];
  const count = (id: NonNullable<SignalFilter>) => (
    <span data-part='n' className='tabular-nums'>
      {counts[id]}
    </span>
  );
  return (
    <div className='px-1 pt-1 pb-2'>
      <Segmented
        id='sig-filter'
        label='show only'
        fill
        value={signal ?? ''}
        onChange={(id) => setSignalFilter(id as NonNullable<SignalFilter>)}
        options={ids.map((id) => ({
          value: id,
          title: NAMES[id],
          ariaLabel: NAMES[id] + ': ' + counts[id],
          // its signal's color, until it's the picked one: then the accent's text color
          icon: id !== 'any' && (
            <span
              data-part='sig-icon'
              className={'sig-' + id + ' inline-flex text-(--sig) in-aria-checked:text-inherit'}
            >
              <SignalIcon signal={id} size={12} />
            </span>
          ),
          label: id === 'any' ? <>All {count(id)}</> : count(id),
        }))}
      />
    </div>
  );
}
