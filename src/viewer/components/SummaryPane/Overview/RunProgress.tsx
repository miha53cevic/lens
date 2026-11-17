import { Check } from 'lucide-react';
import type { BuildProgress } from '../../../../cli-app/summary/progress.ts';
import { Skeleton } from '../../../../ui/Skeleton.tsx';
import { SummaryRun } from '../SummaryRun.tsx';
import { useLens } from '../../../store.ts';
import { Tag } from '../../../../ui/Tag.tsx';
import { agoText } from '../../../model/status.ts';
import { Button } from '../../../../ui/Button.tsx';
import { stopAgentRun } from '../../../actions/agentRuns.ts';

/** The run's steps, in order: what a Tag shows for each, and which stage it is */
function steps(build: BuildProgress): { stage: BuildProgress['stage']; label: string }[] {
  return [
    { stage: 'changes', label: 'Changes ' + build.done + ' of ' + build.total },
    { stage: 'story', label: 'Story' },
    ...(build.drawings ? [{ stage: 'drawings' as const, label: 'Drawings' }] : []),
  ];
}

/** What the agent is on while it writes this summary's overview, in its place and in place of what to run. */
export function RunProgress({ build, command }: { build: BuildProgress; command: string }) {
  const ownRun = useLens((state) => state.agentRuns.find((run) => run.kind === 'summary')?.id ?? null);
  // the fixes come after the last step: every step is behind them
  const current =
    build.stage === 'fixes' ? steps(build).length : steps(build).findIndex((step) => step.stage === build.stage);
  return (
    <div data-part='run-progress' className='flex flex-col gap-3'>
      <div className='flex flex-wrap items-center gap-2 text-sm text-muted'>
        <span className='dot pulse' />
        <b className='font-semibold text-text'>Your agent is writing this</b>
        <span data-part='run-quiet'>{'· last write ' + agoText(build.quietMs) + ' ago'}</span>
      </div>
      <div className='flex flex-wrap items-center gap-2'>
        {steps(build).map((step, stepIndex) => (
          <Tag
            key={step.stage}
            data-part='run-step'
            data-active={stepIndex === current ? '' : undefined}
            className={stepIndex === current ? 'border-selected-ring bg-selected-bg text-text' : undefined}
            icon={stepIndex < current ? <Check size={11} /> : undefined}
          >
            {step.label}
          </Tag>
        ))}
        {build.stage === 'fixes' && (
          <Tag data-part='run-step' data-active='' className='border-selected-ring bg-selected-bg text-text'>
            Fixing what submit rejected
          </Tag>
        )}
      </div>
      {/* lens can't see the reader's own agent: if it died, the way to start it again must still be there. Its own run it can stop. */}
      {ownRun ? (
        <div data-part='run-restart' className='text-sm text-muted'>
          <Button data-part='run-stop' size='sm' onClick={() => void stopAgentRun(ownRun)}>
            Stop
          </Button>
        </div>
      ) : (
        <div data-part='run-restart' className='text-sm text-muted'>
          <SummaryRun command={command}>{(copy) => <>Agent stopped? Run {copy} again.</>}</SummaryRun>
        </div>
      )}
      <div className='flex flex-col gap-2 text-lg'>
        <div className='mb-1 text-accent eyebrow'>Agent summary</div>
        <Skeleton />
        <Skeleton />
        <Skeleton width='62%' />
      </div>
    </div>
  );
}
