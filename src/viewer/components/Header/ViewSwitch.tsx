import { useLens } from '../../store.ts';
import { setView } from '../../actions/views.ts';
import { Segmented } from '../../../ui/Segmented.tsx';

/** Code | Summary, in diff and PR mode. The Summary tab gets a dot when a newer summary waits. */
export function ViewSwitch() {
  const { view, hasSummary, summaryDot } = useLens((state) => ({
    view: state.view,
    hasSummary: !!state.data.summary,
    summaryDot: state.summaryDot,
  }));
  if (!hasSummary) return null;

  return (
    <Segmented
      id='view-switch'
      label='view'
      size='lg'
      value={view}
      onChange={setView}
      options={[
        { value: 'code', label: 'Code', id: 'view-code' },
        {
          value: 'summary',
          label: 'Summary',
          id: 'view-summary',
          badge: summaryDot && <span className='dot' id='summary-dot' />,
        },
      ]}
    />
  );
}
