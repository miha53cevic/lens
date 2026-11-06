import { RotateCcw } from 'lucide-react';
import type { PlanEntry } from '../../../cli-app/api/contract.ts';
import { useLens } from '../../store.ts';
import { openPlan } from '../../actions/planTab.ts';
import { planName, resumeCommand } from '../../model/planTab.ts';
import { isBusy } from '../../model/status.ts';
import { Button } from '../../../ui/Button.tsx';
import { CopyCommand } from '../../../ui/CopyCommand.tsx';
import { Skeleton } from '../../../ui/Skeleton.tsx';

/**
 * One plan: a line on its session (who polls it), then Lavish's page in a frame. The frame is on
 * the proxy's origin, not lens's: it can't reach lens's API, and without allow-top-navigation it
 * can't take the page away.
 */
export function PlanFrame({ plan }: { plan: PlanEntry }) {
  const { url, opening } = useLens((state) => ({
    url: state.plan.frame?.file === plan.file ? state.plan.frame.url : null,
    opening: isBusy(state, 'plan-open'),
  }));
  const session = plan.session;
  const endedByYou = !url && session?.status === 'ended' && session.endedByUser;

  return (
    <div data-part='plan-frame' data-file={plan.file} className='flex min-h-0 flex-1 flex-col gap-2 px-6 pt-3 pb-4'>
      <div className='flex min-h-control flex-wrap items-center gap-x-3 gap-y-1'>
        <span className='font-semibold'>{planName(plan)}</span>
        <span className='font-mono text-xs text-muted'>{plan.file}</span>
        <span className='flex-1' />
        {url && session?.listening && (
          <span data-part='plan-listening' className='inline-flex items-center gap-2 text-sm text-muted'>
            <span className='dot pulse [--dot:var(--add)]' />
            Agent listening
          </span>
        )}
        {url && !session?.listening && (
          <span data-part='plan-no-agent' className='inline-flex items-center gap-2 text-sm text-muted'>
            No agent on it · <CopyCommand command={resumeCommand(plan)} />
          </span>
        )}
      </div>
      {endedByYou && (
        <div data-part='plan-ended' className='empty flex flex-col items-center gap-3'>
          You ended this plan in Lavish.
          <Button id='plan-reopen' disabled={opening} onClick={() => void openPlan(plan.file, true)}>
            <RotateCcw size={14} />
            Reopen it
          </Button>
        </div>
      )}
      {!url && !endedByYou && opening && (
        <div
          data-part='plan-opening'
          className='flex flex-1 flex-col gap-3 rounded-lg border border-line bg-surface p-6'
        >
          <Skeleton size='lg' width='40%' />
          <Skeleton width='90%' />
          <Skeleton width='80%' />
          <Skeleton width='60%' />
        </div>
      )}
      {!url && !endedByYou && !opening && (
        // the status bar says why it failed
        <div data-part='plan-failed' className='empty flex flex-col items-center gap-3'>
          Lavish didn't open this plan.
          <Button id='plan-retry' onClick={() => void openPlan(plan.file, false)}>
            <RotateCcw size={14} />
            Try again
          </Button>
        </div>
      )}
      {url && (
        <iframe
          id='plan-iframe'
          title={'Lavish: ' + planName(plan)}
          src={url}
          sandbox='allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads'
          allow='clipboard-write'
          className='min-h-0 w-full flex-1 rounded-lg border border-line bg-surface'
        />
      )}
    </div>
  );
}
