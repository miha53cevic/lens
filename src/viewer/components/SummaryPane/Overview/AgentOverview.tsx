import type { SummaryView } from '../../../../cli-app/summary/view.ts';
import { CopyCommand } from '../../../../ui/CopyCommand.tsx';
import { CheckoutFirst } from '../CheckoutFirst.tsx';

interface AgentOverviewProps {
  summary: SummaryView;
  anySummarized: boolean;
  /** The server is being asked for a newer summary */
  checking: boolean;
}

/** The agent's account of the whole diff, or what to run to get one. */
export function AgentOverview({ summary, anySummarized, checking }: AgentOverviewProps) {
  const overview = summary.overview;
  if (!overview && summary.checkout) {
    return (
      <div className='ov-what' id='no-summary'>
        <div className='ov-what-label eyebrow'>Agent summary</div>
        <p className='ov-how'>
          <CheckoutFirst branch={summary.checkout} />
        </p>
      </div>
    );
  }
  if (!overview && anySummarized) {
    return (
      <div className='sum-note'>
        No overview yet — run <CopyCommand command={summary.command} /> again to add one.
      </div>
    );
  }
  if (!overview) {
    // while the server is asked for a newer summary, "not written yet" waits: it may be about to arrive
    if (checking) return null;
    // nothing summarized yet: how to get a summary, where it will be
    return (
      <div className='ov-what' id='no-summary'>
        <div className='ov-what-label eyebrow'>Agent summary</div>
        <p className='ov-how'>Not written yet. Your coding agent writes it: run this in it.</p>
        <CopyCommand command={summary.command} block />
        <p className='ov-how'>
          Without the skill, any agent with a shell can follow <CopyCommand command={summary.cli} />. It appears here
          when it's done.
        </p>
      </div>
    );
  }
  return (
    <>
      <div className='ov-what'>
        <div className='ov-what-label eyebrow'>Agent summary</div>
        {overview.what.split('\n\n').map((paragraph, paragraphIndex) => (
          <p key={paragraphIndex}>{paragraph}</p>
        ))}
      </div>
      {overview.stale && (
        <div className='sum-note stale'>
          The diff changed since this overview was written.{' '}
          {summary.checkout ? (
            <CheckoutFirst branch={summary.checkout} />
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
