import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { ClearInfoResponse } from '../../../cli-app/render/web/server.ts';
import type { ClearScope } from '../../../cli-app/clear.ts';
import { useLens } from '../../store.ts';
import { isBusy } from '../../model/status.ts';
import { clearData, countText, VIEWER_KINDS } from '../../actions/clear.ts';
import { Button } from '../../../ui/Button.tsx';
import { ModalHead } from '../ModalHead.tsx';
import { KindRow } from './KindRow.tsx';
import './style.css';

/** ⋯ → Clear saved data…: what lens keeps, one row per kind; nothing goes until it's ticked and Clear is pressed. */
export function ClearDataDialog() {
  const info = useLens((state) => state.clearInfo);
  return (
    <dialog id='clear-modal'>
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
      <div className='modal-body clear-body'>
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
            detail={countText(kind.unit, viewerCounts[kindIndex]) + ': ' + kind.where}
            empty={viewerCounts[kindIndex] === 0}
            warning={null}
            checked={checked.has(kind.id)}
            onCheck={(on) => toggle(kind.id, on)}
          />
        ))}
        {gone.length > 0 && (
          <ul className='clear-gone' aria-label='what goes'>
            {gone.map((what) => (
              <li key={what}>{what}</li>
            ))}
          </ul>
        )}
      </div>
      <div className='clear-foot'>
        <span className='clear-hint'>Settings stay. The agent can write a summary again.</span>
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
