import clsx from 'clsx';
import { useLens } from '../../../store.ts';
import { isFlagged, type Unit, unitLabel, unitViewKey } from '../../../model/signals.ts';
import { openSummaryUnit } from '../../../actions/summary.ts';
import { toggleUnitViewed } from '../../../actions/prefs.ts';
import { SignalMarker } from '../../SignalMarker.tsx';
import { ViewedBox } from '../../ViewedBox.tsx';

interface UnitItemProps {
  unit: Unit;
  /** What shows on the right: the file, for a change in no flow */
  side?: string;
  active: boolean;
}

/** The open unit stays in sight as the reader steps through the list. */
function keepInSight(item: HTMLElement | null) {
  item?.scrollIntoView({ block: 'nearest' });
}

/** One change in the summary list. */
export function UnitItem({ unit, side, active }: UnitItemProps) {
  const { marks, viewed } = useLens((state) => ({
    marks: state.concernMarks,
    viewed: state.viewedUnits.has(unitViewKey(unit)),
  }));
  const summary = unit.summary;

  return (
    <button
      ref={active ? keepInSight : undefined}
      className={clsx(
        'sum-item',
        active && 'active',
        !summary ? 'pending' : !isFlagged(marks, unit) && 'routine',
        viewed && 'viewed',
        'st-' + unit.status,
      )}
      data-id={unit.id}
      title={unit.id + ' — ' + unit.status + (summary ? '\n' + summary.gist : '')}
      onClick={() => openSummaryUnit(unit.id)}
    >
      <ViewedBox checked={viewed} onToggle={() => toggleUnitViewed(unit)} />
      <span className='name'>{unitLabel(unit)}</span>
      <SignalMarker marks={marks} unit={unit} />
      {side && <span className='side'>{side}</span>}
      {unit.stale && <span className='gist stale'>code changed — re-run</span>}
    </button>
  );
}
