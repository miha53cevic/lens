import { PanelsTopLeft } from 'lucide-react';
import { useLens } from '../../../store.ts';
import { type Unit, unitLabel, unitViewKey } from '../../../model/signals.ts';
import { openSummaryUnit } from '../../../actions/summary.ts';
import { toggleUnitViewed } from '../../../actions/prefs.ts';
import { SignalMarker } from '../../SignalMarker.tsx';
import { ViewedBox } from '../../ViewedBox.tsx';
import { changedSinceViewed } from '../../../model/viewed.ts';
import { ListRow } from '../../../../ui/ListRow.tsx';
import { drawnUnits } from '../../../model/drawings.ts';
import { fileByPath, unitNoteCount } from '../../../model/notes.ts';
import { NoteMark } from '../NoteMark.tsx';

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
  const { marks, viewed, changed, drawn, notes } = useLens((state) => ({
    marks: state.concernMarks,
    viewed: state.viewedUnits.has(unitViewKey(unit)),
    changed: changedSinceViewed(state.viewedUnits, unitViewKey(unit)),
    drawn: drawnUnits(state.data.summary, state.data.buildPreviews).has(unit.id),
    notes: unitNoteCount(state.notes, fileByPath(state.data, unit.displayFile), unit),
  }));
  const summary = unit.summary;

  return (
    <ListRow
      ref={active ? keepInSight : undefined}
      selected={active}
      data-part='sum-item'
      data-active={active || undefined}
      data-pending={summary ? undefined : ''}
      data-viewed={viewed || undefined}
      className='group/item grid w-full grid-cols-[16px_minmax(0,1fr)_auto_auto_auto_auto] items-center gap-x-2 px-2 py-1 text-left'
      title={unit.id + ' — ' + unit.status + (summary ? '\n' + summary.gist : '')}
      onClick={() => openSummaryUnit(unit.id)}
    >
      <ViewedBox checked={viewed} changed={changed} onToggle={() => toggleUnitViewed(unit)} />
      <span
        data-part='name'
        className='overflow-hidden text-ellipsis whitespace-nowrap group-data-pending/item:opacity-60 group-data-viewed/item:opacity-55'
      >
        {unitLabel(unit)}
      </span>
      {drawn && (
        <span data-part='drawn' className='inline-flex text-faint' title='Has a preview or a sequence'>
          <PanelsTopLeft size={12} />
        </span>
      )}
      <NoteMark count={notes} />
      <SignalMarker marks={marks} unit={unit} />
      {side && (
        <span
          data-part='side'
          className='max-w-[80px] overflow-hidden text-xs text-ellipsis whitespace-nowrap text-faint'
        >
          {side}
        </span>
      )}
      {unit.stale && (
        <span data-part='gist' className='col-[2/-1] text-xs text-mod'>
          code changed — re-run
        </span>
      )}
      {changed && !unit.stale && (
        <span data-part='gist' className='col-[2/-1] text-xs text-mod'>
          changed since you reviewed it
        </span>
      )}
    </ListRow>
  );
}
