// The Plan tab's pane: New plan, or the picked plan in Lavish's own page, framed through lens's
// proxy (cli-app/plan/proxy.ts). Without Lavish set up it says what's missing instead.

import { useLens } from '../../store.ts';
import { pickedPlan } from '../../model/planTab.ts';
import { hiddenStyle } from '../../shared.ts';
import { Skeleton } from '../../../ui/Skeleton.tsx';
import { LavishMissing } from './LavishMissing.tsx';
import { NewPlan } from './NewPlan.tsx';
import { PlanFrame } from './PlanFrame.tsx';

export function PlanPane() {
  const { shown, list, picked, plan } = useLens((state) => ({
    shown: state.view === 'plan',
    list: state.plan.list,
    picked: state.plan.picked,
    plan: pickedPlan(state),
  }));
  const setup = list?.setup;

  return (
    <div
      data-part='plan-pane'
      id='plan-pane'
      className='flex min-h-0 min-w-0 flex-1 flex-col overflow-auto bg-bg'
      style={hiddenStyle(!shown)}
    >
      {shown && !list && (
        <div className='mx-auto mt-7 flex w-full max-w-[560px] flex-col gap-3 px-6'>
          <Skeleton size='lg' width='50%' />
          <Skeleton size='md' />
          <Skeleton size='md' width='70%' />
        </div>
      )}
      {shown && setup && picked === null && (setup.skill && setup.cli ? <NewPlan /> : <LavishMissing setup={setup} />)}
      {shown && setup && picked !== null && !plan && <div className='empty'>That plan is gone from .lavish/</div>}
      {shown &&
        setup &&
        plan &&
        (setup.cli ? <PlanFrame key={plan.file} plan={plan} /> : <LavishMissing setup={setup} />)}
    </div>
  );
}
