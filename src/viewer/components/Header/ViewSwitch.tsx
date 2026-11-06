import { useLens } from '../../store.ts';
import { setView } from '../../actions/views.ts';
import { Segmented } from '../../../ui/Segmented.tsx';

/** Code | Summary | Plan; Summary in diff and PR mode only, Plan once its switch is on (⋯). The Summary tab gets a dot when a newer summary waits. */
export function ViewSwitch() {
  const { view, hasSummary, summaryDot, planTab } = useLens((state) => ({
    view: state.view,
    hasSummary: !!state.data.summary,
    summaryDot: state.summaryDot,
    planTab: state.data.planTab,
  }));
  // the switch is there only with a choice in it
  if (!hasSummary && !planTab) return null;

  return (
    <Segmented
      id='view-switch'
      label='view'
      size='lg'
      value={view}
      onChange={setView}
      options={[
        { value: 'code', label: 'Code', id: 'view-code' },
        ...(hasSummary
          ? [
              {
                value: 'summary' as const,
                label: 'Summary',
                id: 'view-summary',
                badge: summaryDot && <span className='dot' id='summary-dot' />,
              },
            ]
          : []),
        ...(planTab ? [{ value: 'plan' as const, label: 'Plan', id: 'view-plan' }] : []),
      ]}
    />
  );
}
