import type { PlanItem, PlanStatus } from '../../../cli-app/summary/store.ts';
import { useLens, type ConcernMark } from '../../store.ts';
import { openSummaryUnit, setMark } from '../../actions/summary.ts';
import { setView } from '../../actions/views.ts';
import { unitById, unitLabel } from '../../model/signals.ts';
import { planMarkKey } from '../../model/plan.ts';
import { AgentText } from '../AgentText.tsx';
import { Button } from '../../../ui/Button.tsx';
import { Tag } from '../../../ui/Tag.tsx';

const STATUS: Record<PlanStatus, { label: string; color: string }> = {
  done: { label: 'Done', color: 'var(--add)' },
  partly: { label: 'Partly', color: 'var(--mod)' },
  missing: { label: 'Missing', color: 'var(--bug)' },
};

function UnitTag({ id }: { id: string }) {
  const label = useLens((state) => {
    const unit = unitById(state.data.summary, id);
    return unit ? unitLabel(unit) : id.split('#').pop();
  });
  const open = () => {
    setView('summary');
    openSummaryUnit(id);
  };
  return (
    <Tag mono onClick={open} title={id}>
      {label}
    </Tag>
  );
}

/** The reader's call on what's off plan: fine as it is, or for the agent to deal with. */
function Verdict({ markKey, mark }: { markKey: string; mark: ConcernMark | null }) {
  return (
    <span className='flex flex-none gap-1'>
      <Button
        size='xs'
        data-part='plan-verdict'
        data-mark='dismissed'
        aria-pressed={mark === 'dismissed'}
        onClick={() => setMark(markKey, 'dismissed')}
      >
        Fine
      </Button>
      <Button
        size='xs'
        variant='ghost'
        data-part='plan-verdict'
        data-mark='real'
        aria-pressed={mark === 'real'}
        onClick={() => setMark(markKey, 'real')}
      >
        Real
      </Button>
    </span>
  );
}

export function Item({ item }: { item: PlanItem }) {
  const key = planMarkKey(item.text);
  const mark = useLens((state) => state.concernMarks.get(key) ?? null);
  const status = STATUS[item.status];
  return (
    <div
      data-part='plan-item'
      data-status={item.status}
      className='flex min-w-0 flex-col gap-1 border-t border-line py-3 first:border-t-0'
    >
      <div className='flex min-w-0 flex-wrap items-center gap-2'>
        <Tag color={status.color}>{status.label}</Tag>
        <span className='min-w-0 flex-1 text-base text-text'>
          <AgentText text={item.text} />
        </span>
        {item.status !== 'done' && <Verdict markKey={key} mark={mark} />}
      </div>
      {item.note && (
        <div className='text-sm text-muted'>
          <AgentText text={item.note} />
        </div>
      )}
      <div className='truncate text-xs text-faint' title={item.quote}>
        {'"' + item.quote + '"'}
      </div>
      {item.units.length > 0 && (
        <div className='mt-1 flex flex-wrap gap-1'>
          {item.units.map((id) => (
            <UnitTag key={id} id={id} />
          ))}
        </div>
      )}
    </div>
  );
}

export function Unplanned({ unit, note }: { unit: string; note: string }) {
  const key = planMarkKey(unit + ':' + note);
  const mark = useLens((state) => state.concernMarks.get(key) ?? null);
  return (
    <div
      data-part='plan-unplanned'
      className='flex min-w-0 flex-wrap items-center gap-2 border-t border-line py-2 first:border-t-0'
    >
      <UnitTag id={unit} />
      <span className='min-w-0 flex-1 text-sm text-text'>
        <AgentText text={note} />
      </span>
      <Verdict markKey={key} mark={mark} />
    </div>
  );
}
