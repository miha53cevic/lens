// The whole diff at a glance: counts, the agent's account of the diff, each flow by layer.

import { useLens } from '../../../store.ts';
import { groupUnits, listModel } from '../../../model/summaryList.ts';
import { setOverviewTab } from '../../../actions/summary.ts';
import { Stats } from './Stats.tsx';
import { flowLanes, mapLanes } from './Lanes.tsx';
import { AgentOverview } from './AgentOverview.tsx';

export function Overview() {
  const { summary, list, marks, tab } = useLens((state) => ({
    summary: state.data.summary!,
    list: listModel(state)!,
    marks: state.concernMarks,
    tab: state.overviewTab,
  }));
  const units = list.units; // hide tests: the stats follow the lanes
  const { sections, others } = groupUnits(summary, marks, (unit) => units.includes(unit));
  // the lower half flips between the flows and the map
  const lower = tab === 'map' ? mapLanes({ units }) : flowLanes({ sections, others });

  return (
    <div className='sum-inner'>
      <Stats units={units} flowCount={sections.length} />
      <AgentOverview summary={summary} anySummarized={units.some((unit) => unit.summary)} />
      <div>
        <div className='ov-tabs' role='tablist'>
          <button
            className='ov-tab'
            role='tab'
            data-tab='flows'
            aria-selected={tab === 'flows'}
            onClick={() => setOverviewTab('flows')}
          >
            Flows
          </button>
          <button
            className='ov-tab'
            role='tab'
            data-tab='map'
            aria-selected={tab === 'map'}
            onClick={() => setOverviewTab('map')}
          >
            Map
          </button>
          <span className='ov-tabs-note'>{lower.note}</span>
        </div>
        <div className='ov-lanes'>{lower.lanes}</div>
      </div>
    </div>
  );
}
