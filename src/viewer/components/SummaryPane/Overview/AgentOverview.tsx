import type { SummaryView } from '../../../../cli-app/summary/view.ts';
import { CopyCommand } from '../../../../ui/CopyCommand.tsx';
import { CheckoutFirst } from '../CheckoutFirst.tsx';
import { RunProgress } from './RunProgress.tsx';
import { useLens } from '../../../store.ts';
import { runGoing } from '../../../model/status.ts';
import { AgentText } from '../../AgentText.tsx';

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
  if (!overview && summary.checkout) {
    return (
      <div
        className='[&_p]:mt-0 [&_p]:mb-4 [&_p]:max-w-[72ch] [&_p]:text-lg/[1.65] [&_p]:text-pretty [&_p]:text-text'
        id='no-summary'
      >
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
  if (!overview && anySummarized) {
    return (
      <div data-part='sum-note' className='rounded-md border border-line bg-surface px-3 py-2 text-md/[1.5] text-muted'>
        No overview yet — run <CopyCommand command={summary.command} /> again to add one.
      </div>
    );
  }
  if (!overview) {
    // while the server is asked for a newer summary, "not written yet" waits: it may be about to arrive
    if (checking) return null;
    // nothing summarized yet: how to get a summary, where it will be
    return (
      <div
        className='[&_p]:mt-0 [&_p]:mb-4 [&_p]:max-w-[72ch] [&_p]:text-lg/[1.65] [&_p]:text-pretty [&_p]:text-text'
        id='no-summary'
      >
        <div data-part='ov-what-label' className='mb-1 text-accent eyebrow'>
          Agent summary
        </div>
        <p className='[&&]:m-0 [&&]:text-md/[1.6] [&&]:text-muted'>
          Not written yet. Your coding agent writes it: run this in it.
        </p>
        <CopyCommand command={summary.command} block />
        <p className='[&&]:m-0 [&&]:text-md/[1.6] [&&]:text-muted'>
          Without the skill, any agent with a shell can follow <CopyCommand command={summary.cli} />. It appears here
          when it's done.
        </p>
      </div>
    );
  }
  return (
    <>
      <div className='[&_p]:mt-0 [&_p]:mb-4 [&_p]:max-w-[72ch] [&_p]:text-lg/[1.65] [&_p]:text-pretty [&_p]:text-text'>
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
            <>
              Run <CopyCommand command={summary.command} /> again to update it.
            </>
          )}
        </div>
      )}
    </>
  );
}
