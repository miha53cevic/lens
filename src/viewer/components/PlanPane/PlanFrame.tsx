import { Maximize, RotateCcw, X } from 'lucide-react';
import type { PlanEntry } from '../../../cli-app/api/contract.ts';
import { useLens } from '../../store.ts';
import { closePlan, openPlan, planFullScreen } from '../../actions/planTab.ts';
import { planName, resumeCommand } from '../../model/planTab.ts';
import { isBusy } from '../../model/status.ts';
import { Button } from '../../../ui/Button.tsx';
import { CopyCommand } from '../../../ui/CopyCommand.tsx';
import { IconButton } from '../../../ui/IconButton.tsx';
import { Skeleton } from '../../../ui/Skeleton.tsx';

/**
 * One plan: its name, the command to go on with it when no agent polls it, and its buttons, then
 * Lavish's page in a frame. The frame is on the proxy's origin, not lens's: it can't reach lens's
 * API, and without allow-top-navigation it can't take the page away.
 */
export function PlanFrame({ plan }: { plan: PlanEntry }) {
  const { url, opening, closing } = useLens((state) => ({
    url: state.plan.frame?.file === plan.file ? state.plan.frame.url : null,
    opening: isBusy(state, 'plan-open'),
    closing: isBusy(state, 'plan-close'),
  }));
  const session = plan.session;
  const ended = !url && session?.status === 'ended';

  return (
    <div data-part='plan-frame' data-file={plan.file} className='flex min-h-0 flex-1 flex-col gap-2 px-6 pt-3 pb-4'>
      <div className='flex min-h-control flex-wrap items-center gap-x-3 gap-y-1'>
        <span className='font-semibold'>{planName(plan)}</span>
        <span className='font-mono text-xs text-muted'>{plan.file}</span>
        <span className='flex-1' />
        <span className='flex items-center gap-2'>
          {url && !session?.listening && (
            <span data-part='plan-no-agent' className='inline-flex items-center gap-2 text-sm text-muted'>
              No agent on it · <CopyCommand command={resumeCommand(plan)} shown='/lavish continue the plan' />
            </span>
          )}
          {url && (
            <IconButton
              id='plan-close'
              label='Close session'
              disabled={closing}
              onClick={() => void closePlan(plan.file)}
            >
              <X size={15} />
            </IconButton>
          )}
          {url && (
            <IconButton id='plan-full' label='Full screen' shortcut='f' tipSide='end' onClick={planFullScreen}>
              <Maximize size={15} />
            </IconButton>
          )}
        </span>
      </div>
      {ended && (
        <div data-part='plan-ended' className='empty flex flex-col items-center gap-3'>
          {session.endedByUser ? 'You ended this plan in Lavish.' : "This plan's session is closed."}
          <Button id='plan-reopen' disabled={opening} onClick={() => void openPlan(plan.file, session.endedByUser)}>
            <RotateCcw size={14} />
            Open it again
          </Button>
        </div>
      )}
      {!url && !ended && opening && (
        <div
          data-part='plan-opening'
          className='flex flex-1 animate-[wait-hidden_150ms] flex-col gap-3 rounded-lg border border-line bg-surface p-6 shadow-1'
        >
          <Skeleton size='lg' width='40%' />
          <Skeleton width='90%' />
          <Skeleton width='80%' />
          <Skeleton width='60%' />
        </div>
      )}
      {!url && !ended && !opening && (
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
          className='min-h-0 w-full flex-1 rounded-lg border border-line bg-surface shadow-1'
        />
      )}
    </div>
  );
}
