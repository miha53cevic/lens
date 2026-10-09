import type { SummaryView } from '../../../../../../summary/view.ts';

interface AgentOverviewProps {
  summary: SummaryView;
  anySummarized: boolean;
}

/** The agent's account of the whole diff, or what to run to get one. */
export function AgentOverview({ summary, anySummarized }: AgentOverviewProps) {
  const overview = summary.overview;
  if (!overview) {
    return anySummarized ? (
      <div className='sum-note'>
        No overview yet — run <code>{summary.command}</code> again to add one.
      </div>
    ) : (
      <div className='sum-note'>
        Not summarized yet — run <code>{summary.command}</code> in your agent.
      </div>
    );
  }
  return (
    <>
      <div className='ov-what'>
        <div className='ov-what-label'>Agent summary</div>
        {overview.what.split('\n\n').map((paragraph, paragraphIndex) => (
          <p key={paragraphIndex}>{paragraph}</p>
        ))}
      </div>
      {overview.stale && (
        <div className='sum-note stale'>
          The diff changed since this overview was written. Run <code>{summary.command}</code> again to update it.
        </div>
      )}
    </>
  );
}
