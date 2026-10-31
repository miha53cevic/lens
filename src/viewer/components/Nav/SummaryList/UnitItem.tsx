import clsx from 'clsx';
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
      className={clsx('sum-item', active && 'active', !summary && 'pending', viewed && 'viewed', 'st-' + unit.status)}
      title={unit.id + ' — ' + unit.status + (summary ? '\n' + summary.gist : '')}
      onClick={() => openSummaryUnit(unit.id)}
    >
      <ViewedBox checked={viewed} changed={changed} onToggle={() => toggleUnitViewed(unit)} />
      <span className='name'>{unitLabel(unit)}</span>
      {drawn && (
        <span className='drawn' title='Has a preview or a sequence'>
          <PanelsTopLeft size={12} />
        </span>
      )}
      <NoteMark count={notes} />
      <SignalMarker marks={marks} unit={unit} />
      {side && <span className='side'>{side}</span>}
      {unit.stale && <span className='gist stale'>code changed — re-run</span>}
      {changed && !unit.stale && <span className='gist changed'>changed since you reviewed it</span>}
    </ListRow>
  );
}
