import { useLens } from '../../../store.ts';
import { unitLabel } from '../../../model/signals.ts';
import { Tag } from '../../../../ui/Tag.tsx';

/** A unit's dot: new, gone, or changed */
const UNIT_DOT: Record<string, string> = { new: 'var(--add)', deleted: 'var(--del)' };

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
    <div className='flex flex-wrap gap-2'>
      {units.map((id) => {
        const unit = all?.find((candidate) => candidate.id === id);
        if (!unit) return null;
        return (
          <Tag
            key={id}
            data-part='drawing-unit'
            data-on={id === picked || undefined}
            mono
            dot={UNIT_DOT[unit.status] ?? 'var(--mod)'}
            pressed={id === picked}
            onClick={() => onPick(id)}
          >
            {unitLabel(unit)}
          </Tag>
        );
      })}
    </div>
  );
}
