import clsx from 'clsx';
import { PanelsTopLeft } from 'lucide-react';
import { useLens } from '../../../../store.ts';
import { signalTip, type Unit, unitLabel, unitSignals, unitViewKey } from '../../../../model/signals.ts';
import { changedSinceViewed } from '../../../../model/viewed.ts';
import { drawnUnits } from '../../../../model/drawings.ts';
import { openSummaryUnit } from '../../../../actions/summary.ts';
import { toggleUnitViewed } from '../../../../actions/prefs.ts';
import { baseName } from '../../../../shared.ts';
import { SignalIcon } from '../../../SignalIcon.tsx';
import { Button } from '../../../../../ui/Button.tsx';
import { listRowClass } from '../../../../../ui/ListRow.tsx';

/** The open card stays in sight as the reader steps through the inbox. */
function keepInSight(card: HTMLElement | null) {
  card?.scrollIntoView({ block: 'nearest' });
}

/** One change as a card: its headline, where it is, and its open findings' and preview's icons. */
export function UnitCard({ unit, active }: { unit: Unit; active: boolean }) {
  const { marks, read, changed, drawn } = useLens((state) => ({
    marks: state.concernMarks,
    read: state.viewedUnits.has(unitViewKey(unit)),
    changed: changedSinceViewed(state.viewedUnits, unitViewKey(unit)),
    drawn: drawnUnits(state.data.summary, state.data.buildPreviews).has(unit.id),
  }));
  const summary = unit.summary;
  return (
    <div
      ref={active ? keepInSight : undefined}
      className={listRowClass(active, 'inbox-card', read && 'read', !summary && 'pending')}
      data-inbox-unit={unit.id}
      role='button'
      onClick={() => openSummaryUnit(unit.id)}
    >
      <span className='title'>{summary ? summary.headline : unitLabel(unit)}</span>
      <Button
        variant='ghost'
        size='xs'
        className='inbox-read-btn'
        aria-pressed={read}
        onClick={(event) => {
          event.stopPropagation();
          toggleUnitViewed(unit);
        }}
      >
        {read ? 'Unread' : 'Read'}
      </Button>
      <span className='caption' title={unit.displayFile}>
        <span className='caption-file'>{baseName(unit.displayFile)}</span>
        <span className='caption-sep'>›</span>
        <span className='caption-unit'>{unitLabel(unit)}</span>
      </span>
      <span className='icons'>
        {unitSignals(marks, unit).map((signal) => (
          <span key={signal} className={clsx('sig', 'sig-' + signal)} title={signalTip(marks, unit, signal)}>
            <SignalIcon signal={signal} size={12} />
          </span>
        ))}
        {drawn && (
          <span className='drawn' title='Has a preview or a sequence'>
            <PanelsTopLeft size={12} />
          </span>
        )}
      </span>
      {unit.stale && <span className='note'>code changed — re-run</span>}
      {changed && !unit.stale && <span className='note'>changed since you read it</span>}
    </div>
  );
}
