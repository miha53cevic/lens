import type { PlanFilter as Filter } from '../../../store.ts';
import { useLens } from '../../../store.ts';
import { setPlanFilter, setPlanQuery } from '../../../actions/planTab.ts';
import { planListModel } from '../../../model/planTab.ts';
import { Segmented } from '../../../../ui/Segmented.tsx';
import { Filter as FilterBox } from '../Filter.tsx';

const NAMES: Record<Filter, string> = { all: 'All', active: 'Active', pending: 'Pending' };

/** The plans' filter box, then All | Active | Pending, each with how many of the box's matches it has. */
export function PlanFilter() {
  const { query, filter, counts } = useLens((state) => ({
    query: state.plan.query,
    filter: state.plan.filter,
    counts: planListModel(state).counts,
  }));
  return (
    <div className='mt-1'>
      <FilterBox
        wrapperId='plan-filter'
        hidden={false}
        placeholder='Filter plans'
        value={query}
        onChange={setPlanQuery}
      />
      <div className='px-1 pb-2'>
        <Segmented
          id='plan-show'
          label='show only'
          fill
          value={filter}
          onChange={setPlanFilter}
          options={(Object.keys(NAMES) as Filter[]).map((id) => ({
            value: id,
            id: 'plan-show-' + id,
            ariaLabel: NAMES[id] + ': ' + counts[id],
            label: (
              <>
                {NAMES[id]}{' '}
                <span data-part='n' className='tabular-nums'>
                  {counts[id]}
                </span>
              </>
            ),
          }))}
        />
      </div>
    </div>
  );
}
