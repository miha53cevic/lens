import clsx from 'clsx';
import { PanelsTopLeft } from 'lucide-react';
import { type SignalId, useLens } from '../../../../store.ts';
import {
  confirmedSignals,
  signalTip,
  type Unit,
  unitLabel,
  unitSignals,
  unitViewKey,
} from '../../../../model/signals.ts';
import { changedSinceViewed } from '../../../../model/viewed.ts';
import { drawnUnits } from '../../../../model/drawings.ts';
import { fileByPath, unitNotes } from '../../../../model/notes.ts';
import { openSummaryUnit } from '../../../../actions/summary.ts';
import { toggleUnitViewed } from '../../../../actions/prefs.ts';
import { baseName } from '../../../../shared.ts';
import { SignalIcon } from '../../../SignalIcon.tsx';
import { Button } from '../../../../../ui/Button.tsx';
import { listRow } from '../../../../../ui/ListRow.tsx';

/** The open card stays in sight as the reader steps through the inbox. */
function keepInSight(card: HTMLElement | null) {
  card?.scrollIntoView({ block: 'nearest' });
}

/**
 * One change as a card: its headline, where it is, and the icons of its open findings (the agent's,
 * and the reader's own notes on it, by their kind) and of its preview.
 */
export function UnitCard({ unit, active }: { unit: Unit; active: boolean }) {
  const { marks, read, changed, drawn, notes, signalKey, confirmedKey } = useLens((state) => {
    const notes = unitNotes(state.notes, fileByPath(state.data, unit.displayFile), unit);
    return {
      marks: state.concernMarks,
      read: state.viewedUnits.has(unitViewKey(unit)),
      changed: changedSinceViewed(state.viewedUnits, unitViewKey(unit)),
      drawn: drawnUnits(state.data.summary, state.data.buildPreviews).has(unit.id),
      notes,
      // as text: the signals are a new array each time
      signalKey: unitSignals(state.concernMarks, unit, new Set(notes.map((note) => note.kind))).join(' '),
      confirmedKey: confirmedSignals(state.concernMarks, unit).join(' '),
    };
  });
  const signals = (signalKey ? signalKey.split(' ') : []) as SignalId[];
  const confirmed = new Set(confirmedKey.split(' '));
  const summary = unit.summary;
  return (
    <div
      ref={active ? keepInSight : undefined}
      {...listRow(
        active,
        // a card keeps its ground under the pointer: its edge answers. Read: still a card on the flow's ground
        // (a light theme loses a see-through one), only quieter
        clsx(
          'group/card grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] gap-x-2 gap-y-1 rounded-md border border-line bg-raised p-3 not-data-selected:hover:border-line-strong not-data-selected:hover:bg-raised data-selected:border-selected-ring',
          read ? 'shadow-none' : 'shadow-1',
          active && 'data-selected:shadow-[0_0_0_1px_var(--selected-ring),var(--elev-1)]',
        ),
      )}
      data-part='inbox-card'
      data-read={read || undefined}
      data-pending={summary ? undefined : ''}
      data-inbox-unit={unit.id}
      role='button'
      onClick={() => openSummaryUnit(unit.id)}
    >
      <span className='min-w-0 self-baseline text-md leading-[1.35] font-semibold [overflow-wrap:anywhere] text-text group-data-pending/card:font-normal group-data-pending/card:text-faint group-data-pending/card:italic group-data-read/card:font-medium group-data-read/card:text-muted'>
        {summary ? summary.headline : unitLabel(unit)}
      </span>
      <Button
        variant='ghost'
        size='xs'
        data-part='inbox-read-btn'
        // text only: the way a caption reads, its text alone answers the pointer. Held to the card's
        // edge: the icons under it can make the column wider than the word
        className='h-auto self-baseline justify-self-end border-0 p-0 text-xs leading-[1.35] font-medium text-faint group-hover/card:text-muted group-data-selected/card:text-muted not-disabled:hover:bg-transparent not-disabled:hover:font-semibold not-disabled:hover:text-text'
        aria-pressed={read}
        onClick={(event) => {
          event.stopPropagation();
          toggleUnitViewed(unit);
        }}
      >
        {read ? 'Unread' : 'Read'}
      </Button>
      <span className='flex min-w-0 items-baseline gap-1 text-xs text-faint' title={unit.displayFile}>
        <span className='min-w-0 overflow-hidden text-ellipsis whitespace-nowrap'>{baseName(unit.displayFile)}</span>
        <span className='flex-none'>›</span>
        <span
          data-part='caption-unit'
          className='max-w-[60%] flex-none overflow-hidden text-ellipsis whitespace-nowrap'
        >
          {unitLabel(unit)}
        </span>
      </span>
      <span data-part='icons' className='inline-flex items-center justify-end gap-1 group-data-read/card:opacity-60'>
        {signals.map((signal) => (
          <span
            key={signal}
            className={clsx('inline-flex text-(--sig)', 'sig-' + signal)}
            title={signalTip(marks, unit, signal, notes)}
          >
            <SignalIcon signal={signal} size={12} confirmed={confirmed.has(signal)} />
          </span>
        ))}
        {drawn && (
          <span data-part='drawn' className='inline-flex text-muted' title='Has a preview or a sequence'>
            <PanelsTopLeft size={12} />
          </span>
        )}
      </span>
      {unit.stale && <span className='col-[1/-1] text-xs text-mod'>code changed — re-run</span>}
      {changed && !unit.stale && <span className='col-[1/-1] text-xs text-mod'>changed since you read it</span>}
    </div>
  );
}
