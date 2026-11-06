import { Plus } from 'lucide-react';
import type { PlanEntry } from '../../../cli-app/api/contract.ts';
import { useLens } from '../../store.ts';
import { pickPlan } from '../../actions/planTab.ts';
import { planName } from '../../model/planTab.ts';
import { ListRow } from '../../../ui/ListRow.tsx';
import { Skeleton } from '../../../ui/Skeleton.tsx';

/** What a plan's session is, in a word, and its dot: live (an agent polls it), open, ended, or none yet. */
function sessionWord(plan: PlanEntry): { text: string; dot: string } {
  const session = plan.session;
  if (!session) return { text: 'no session', dot: 'dot [--dot:var(--faint)]' };
  if (session.status === 'ended') return { text: 'ended', dot: 'dot [--dot:var(--faint)]' };
  if (session.listening) return { text: 'agent listening', dot: 'dot pulse [--dot:var(--add)]' };
  return { text: 'open', dot: 'dot [--dot:var(--accent)]' };
}

/** The Plan tab's sidebar: New plan, then the root's plans in .lavish/, newest first. */
export function PlanList() {
  const { plans, picked } = useLens((state) => ({ plans: state.plan.list?.plans ?? null, picked: state.plan.picked }));

  return (
    <div id='plan-list' className='flex flex-col gap-1'>
      <ListRow
        selected={picked === null}
        data-part='plan-new'
        data-active={picked === null || undefined}
        className='mb-1 flex w-full items-center gap-2 px-2 py-1 font-medium'
        onClick={() => pickPlan(null)}
      >
        <Plus size={14} />
        New plan
      </ListRow>
      <span className='eyebrow sm px-2 pt-2 pb-1 text-muted'>Plans · .lavish/</span>
      {plans === null && [0, 1, 2].map((row) => <Skeleton key={row} size='sm' className='mx-2' />)}
      {plans?.length === 0 && <div className='no-match'>no plans yet</div>}
      {plans?.map((plan) => {
        const word = sessionWord(plan);
        const selected = plan.file === picked;
        return (
          <ListRow
            key={plan.file}
            selected={selected}
            data-part='plan-row'
            data-file={plan.file}
            data-active={selected || undefined}
            className='flex w-full items-center gap-2 px-2 py-1'
            title={plan.file}
            onClick={() => pickPlan(plan.file)}
          >
            <span className={'flex-none ' + word.dot} />
            <span className='min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap'>{planName(plan)}</span>
            <span data-part='plan-state' className='flex-none text-xs text-muted'>
              {plan.session && plan.session.pending > 0 ? plan.session.pending + ' waiting' : word.text}
            </span>
          </ListRow>
        );
      })}
    </div>
  );
}
