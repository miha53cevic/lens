import { useLens } from '../../store.ts';
import { setView } from '../../actions/views.ts';

/** Code | Summary, in diff and PR mode. The Summary tab gets a dot when a newer summary waits. */
export function ViewSwitch() {
  const { summaryView, hasSummary, summaryDot } = useLens((state) => ({
    summaryView: state.view === 'summary',
    hasSummary: !!state.data.summary,
    summaryDot: state.summaryDot,
  }));
  if (!hasSummary) return null;

  return (
    <div className='view-switch' id='view-switch' role='group' aria-label='view'>
      <button id='view-code' aria-pressed={!summaryView} title='the diff, folded (v)' onClick={() => setView('code')}>
        Code
      </button>
      <button
        id='view-summary'
        aria-pressed={summaryView}
        title='one change at a time, summarized by your agent (v)'
        onClick={() => setView('summary')}
      >
        Summary
        {summaryDot && <span className='new-dot' id='summary-dot' title='a new summary is available' />}
      </button>
    </div>
  );
}
