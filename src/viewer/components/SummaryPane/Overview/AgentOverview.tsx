import type { SummaryView } from '../../../../cli-app/summary/view.ts';
import { CopyCommand } from '../../../../ui/CopyCommand.tsx';
import { CheckoutFirst } from '../CheckoutFirst.tsx';
import { SummaryRun } from '../SummaryRun.tsx';
import { RunProgress } from './RunProgress.tsx';
import { useLens } from '../../../store.ts';
import { runGoing } from '../../../model/status.ts';
import { AgentText } from '../../AgentText.tsx';
import { Headlines } from './Headlines.tsx';

interface AgentOverviewProps {
  summary: SummaryView;
  anySummarized: boolean;
  /** The server is being asked for a newer summary */
  checking: boolean;
}

/** The agent's account of the whole diff, or what to run to get one. */
export function AgentOverview({ summary, anySummarized, checking }: AgentOverviewProps) {
  const overview = summary.overview;
  const build = useLens((state) => runGoing(state));
  const ownRun = useLens((state) => state.data.agent !== null);
  if (!overview && summary.checkout) {
    return (
      <div className='[&_p]:mt-0 [&_p]:mb-4 [&_p]:text-lg/[1.65] [&_p]:text-pretty [&_p]:text-text' id='no-summary'>
        <div data-part='ov-what-label' className='mb-1 text-accent eyebrow'>
          Agent summary
        </div>
        <p className='[&&]:m-0 [&&]:text-md/[1.6] [&&]:text-muted'>
          <CheckoutFirst checkout={summary.checkout} />
        </p>
      </div>
    );
  }
  // the agent is on it: where it has got to, not what to run
  if (!overview && build) return <RunProgress build={build} command={summary.command} />;
  // what is known without it: the units' headlines, and how to get the overview under them
  if (!overview && anySummarized) {
    return (
      <>
        <Headlines />
        <div data-part='sum-note' className='text-md/[1.5] text-muted'>
          <SummaryRun command={summary.command}>
            {(command) => <>No overview yet — run {command} again to add one.</>}
          </SummaryRun>
        </div>
      </>
    );
  }
  if (!overview) {
    // while the server is asked for a newer summary, "not written yet" waits: it may be about to arrive
    if (checking) return null;
    // nothing summarized yet: how to get a summary, where it will be
    return (
      <div className='[&_p]:mt-0 [&_p]:mb-4 [&_p]:text-lg/[1.65] [&_p]:text-pretty [&_p]:text-text' id='no-summary'>
        <div data-part='ov-what-label' className='mb-1 text-accent eyebrow'>
          Agent summary
        </div>
        <p className='[&&]:m-0 [&&]:text-md/[1.6] [&&]:text-muted'>
          {ownRun
            ? 'Not written yet. The agent writes it, and it appears here when done.'
            : 'Not written yet. Your coding agent writes it: run this in it.'}
        </p>
        <SummaryRun command={summary.command} block>
          {(command) => (
            <>
              {command}
              <p className='[&&]:m-0 [&&]:text-md/[1.6] [&&]:text-muted'>
                Without the skill, any agent with a shell can follow <CopyCommand command={summary.cli} />. It appears
                here when it's done.
              </p>
            </>
          )}
        </SummaryRun>
      </div>
    );
  }
  return (
    <>
      <div className='[&_p]:mt-0 [&_p]:mb-4 [&_p]:text-lg/[1.65] [&_p]:text-pretty [&_p]:text-text'>
        <div data-part='ov-what-label' className='mb-1 text-accent eyebrow'>
          Agent summary
        </div>
        {overview.what.split('\n\n').map((paragraph, paragraphIndex) => (
          <p key={paragraphIndex}>
            <AgentText text={paragraph} />
          </p>
        ))}
      </div>
      {/* a run over a written overview is the status bar's to say, as any reload of what's on screen is */}
      {overview.stale && !build && (
        <div
          data-part='sum-note'
          data-stale=''
          className='rounded-md border border-[color-mix(in_oklab,var(--mod)_var(--tint-line),transparent)] bg-surface px-3 py-2 text-md/[1.5] text-mod'
        >
          The diff changed since this overview was written.{' '}
          {summary.checkout ? (
            <CheckoutFirst checkout={summary.checkout} />
          ) : (
            <SummaryRun command={summary.command}>{(command) => <>Run {command} again to update it.</>}</SummaryRun>
          )}
        </div>
      )}
    </>
  );
}
