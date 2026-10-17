import clsx from 'clsx';
import { useLens } from '../../../store.ts';
import { unitLabel } from '../../../model/signals.ts';

/** The units a drawing shows, the picked one pressed; what a click does is the card's. */
export function UnitChips({
  units,
  picked,
  onPick,
}: {
  units: string[];
  picked: string | null;
  onPick: (unitId: string) => void;
}) {
  const all = useLens((state) => state.data.summary?.units);
  return (
    <div className='drawing-units'>
      {units.map((id) => {
        const unit = all?.find((candidate) => candidate.id === id);
        if (!unit) return null;
        return (
          <button
            key={id}
            className={clsx('drawing-unit', 'st-' + unit.status, id === picked && 'on')}
            aria-pressed={id === picked}
            onClick={() => onPick(id)}
          >
            <i className='dot' />
            {unitLabel(unit)}
          </button>
        );
      })}
    </div>
  );
}
