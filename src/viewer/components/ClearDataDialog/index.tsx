import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { ClearInfoResponse } from '../../../cli-app/api/contract.ts';
import type { ClearScope } from '../../../cli-app/clear.ts';
import { useLens } from '../../store.ts';
import { isBusy } from '../../model/status.ts';
import { clearData, VIEWER_KINDS } from '../../actions/clear.ts';
import { countText } from '../../../cli-app/text.ts';
import { Button } from '../../../ui/Button.tsx';
import { ChoiceList } from '../../../ui/Choice.tsx';
import { DIALOG, ModalHead } from '../ModalHead.tsx';
import { cn } from '../../../ui/cn.ts';
import { KindRow } from './KindRow.tsx';

/** ⋯ → Clear saved data…: what lens keeps, one row per kind; nothing goes until it's ticked and Clear is pressed. */
export function ClearDataDialog() {
  const info = useLens((state) => state.clearInfo);
  return (
    <dialog id='clear-modal' tabIndex={-1} className={cn(DIALOG, 'w-[min(480px,calc(var(--screen-w)*0.9))]')}>
      <ModalHead title='Clear saved data' />
      {/* a fresh pick on every opening: nothing stays ticked from the last one */}
      {info && <Picker key={info.opened} kinds={info.kinds} />}
    </dialog>
  );
}

/** The first scope with something in it, else the first one */
function firstScope(plans: ClearInfoResponse['kinds'][number]['plans']): ClearScope {
  const scopes = Object.keys(plans) as ClearScope[];
  return scopes.find((scope) => (plans[scope]?.count ?? 0) > 0) ?? scopes[0];
}

function Picker({ kinds }: { kinds: ClearInfoResponse['kinds'] }) {
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());
  const [scopes, setScopes] = useState<Record<string, ClearScope>>(() =>
    Object.fromEntries(kinds.map((kind) => [kind.id, firstScope(kind.plans)])),
  );
  const viewerCounts = useLens((state) => VIEWER_KINDS.map((kind) => kind.count(state)));
  const busy = useLens((state) => isBusy(state, 'clear'));

  const toggle = (id: string, on: boolean) => {
    const next = new Set(checked);
    if (on) next.add(id);
    else next.delete(id);
    setChecked(next);
  };
  const serverPicks = kinds.filter((kind) => checked.has(kind.id) && (kind.plans[scopes[kind.id]]?.count ?? 0) > 0);
  const viewerPicks = VIEWER_KINDS.filter((kind, kindIndex) => checked.has(kind.id) && viewerCounts[kindIndex] > 0);
  const gone = [
    ...serverPicks.flatMap((kind) => kind.plans[scopes[kind.id]]?.paths ?? []),
    ...viewerPicks.map((kind) => countText(kind.unit, viewerCounts[VIEWER_KINDS.indexOf(kind)]) + ' in this browser'),
  ];

  return (
    <>
      <div data-part='modal-body' className='min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-5 text-md grid gap-3'>
        <ChoiceList type='checkbox' label='What to clear'>
          {kinds.map((kind) => {
            const scope = scopes[kind.id];
            const plan = kind.plans[scope];
            return (
              <KindRow
                key={kind.id}
                id={kind.id}
                label={kind.label}
                detail={plan ? countText(kind.unit, plan.count) : ''}
                empty={Object.values(kind.plans).every((candidate) => !candidate || candidate.count === 0)}
                warning={checked.has(kind.id) ? kind.warning : null}
                checked={checked.has(kind.id)}
                onCheck={(on) => toggle(kind.id, on)}
                scopes={Object.keys(kind.plans) as ClearScope[]}
                scope={scope}
                scopeCount={(option) => kind.plans[option]?.count ?? 0}
                onScope={(option) => setScopes({ ...scopes, [kind.id]: option })}
              />
            );
          })}
          {VIEWER_KINDS.map((kind, kindIndex) => (
            <KindRow
              key={kind.id}
              id={kind.id}
              label={kind.label}
              detail={countText(kind.unit, viewerCounts[kindIndex]) + ' · ' + kind.where}
              empty={viewerCounts[kindIndex] === 0}
              warning={null}
              checked={checked.has(kind.id)}
              onCheck={(on) => toggle(kind.id, on)}
            />
          ))}
        </ChoiceList>
        {gone.length > 0 && (
          <ul
            data-part='clear-gone'
            className="m-0 grid list-none gap-1 rounded-md bg-[color-mix(in_oklab,var(--danger)_var(--tint),transparent)] px-3 py-2 [&_li]:font-mono [&_li]:text-xs [&_li]:[overflow-wrap:anywhere] [&_li]:before:text-danger [&_li]:before:content-['−_']"
            aria-label='what goes'
          >
            {gone.map((what) => (
              <li key={what}>{what}</li>
            ))}
          </ul>
        )}
      </div>
      <div className='flex flex-none items-center gap-2 border-t border-line px-4 py-3'>
        <span className='min-w-0 flex-1 text-sm text-faint'>Settings stay. The agent can write a summary again.</span>
        <form method='dialog'>
          <Button variant='ghost'>Cancel</Button>
        </form>
        <Button
          id='clear-confirm'
          variant='danger'
          disabled={gone.length === 0 || busy}
          onClick={() =>
            clearData({
              server: Object.fromEntries(serverPicks.map((kind) => [kind.id, scopes[kind.id]])),
              viewer: viewerPicks.map((kind) => kind.id),
            })
          }
        >
          <Trash2 size={14} />
          Clear
        </Button>
      </div>
    </>
  );
}
