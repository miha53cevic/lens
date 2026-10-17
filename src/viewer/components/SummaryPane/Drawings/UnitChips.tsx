import clsx from 'clsx';
import { useLens } from '../../../store.ts';
import { unitLabel } from '../../../model/signals.ts';
import { openSummaryUnit } from '../../../actions/summary.ts';

/** The units a drawing shows, each opening its page; the page's own unit is picked. */
export function UnitChips({ units, unitId }: { units: string[]; unitId: string | null }) {
  const all = useLens((state) => state.data.summary?.units);
  return (
    <div className='drawing-units'>
      {units.map((id) => {
        const unit = all?.find((candidate) => candidate.id === id);
        if (!unit) return null;
        return (
          <button
            key={id}
            className={clsx('drawing-unit', 'st-' + unit.status, id === unitId && 'on')}
            aria-pressed={id === unitId}
            onClick={() => openSummaryUnit(id)}
          >
            <i className='dot' />
            {unitLabel(unit)}
          </button>
        );
      })}
    </div>
  );
}
