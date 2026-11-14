import { useLens } from '../../../store.ts';
import { unitLabel, unitSignals } from '../../../model/signals.ts';
import { listModel } from '../../../model/summaryList.ts';
import { openSummaryUnit } from '../../../actions/summary.ts';
import { baseName } from '../../../shared.ts';
import { ListRow } from '../../../../ui/ListRow.tsx';
import { SignalIcon } from '../../SignalIcon.tsx';
import { AgentText } from '../../AgentText.tsx';

/**
 * Without the agent's overview, what is known of the change: each summarized unit's headline, in
 * the list's order, its findings as their icons. A row opens the unit.
 */
export function Headlines() {
  const { units, marks } = useLens((state) => ({ units: listModel(state)!.units, marks: state.concernMarks }));
  const summarized = units.filter((unit) => unit.summary);
  if (summarized.length === 0) return null;
  return (
    <div data-part='ov-headlines'>
      <div className='mb-2 text-accent eyebrow'>What changed</div>
      <div className='flex flex-col'>
        {summarized.map((unit) => (
          <ListRow
            key={unit.id}
            data-part='ov-headline'
            className='grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 px-3 py-2'
            onClick={() => openSummaryUnit(unit.id)}
          >
            <span className='min-w-0 text-md text-text'>
              <AgentText text={unit.summary!.headline} />
            </span>
            <span className='inline-flex items-center gap-1'>
              {unitSignals(marks, unit).map((signal) => (
                <span key={signal} className={'sig-' + signal + ' inline-flex text-(--sig)'}>
                  <SignalIcon signal={signal} size={12} />
                </span>
              ))}
            </span>
            <span className='overflow-hidden font-mono text-xs text-ellipsis whitespace-nowrap text-faint'>
              {baseName(unit.displayFile)} › {unitLabel(unit)}
            </span>
          </ListRow>
        ))}
      </div>
    </div>
  );
}
