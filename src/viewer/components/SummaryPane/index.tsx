// The Summary tab's pane: the overview, or one unit.

import { useLens } from '../../store.ts';
import { currentUnit, summaryPage } from '../../model/summaryList.ts';
import { Overview } from './Overview/index.tsx';
import { UnitPage } from './UnitPage/index.tsx';
import { hiddenStyle } from '../../shared.ts';

export function SummaryPane() {
  const { shown, page, unit } = useLens((state) => {
    const shown = state.view === 'summary';
    const page = shown ? summaryPage(state) : null;
    return { shown, page, unit: page === 'unit' ? currentUnit(state) : null };
  });

  return (
    // keyed by the page: another page starts at the top, the same one again (a toggle, a verdict) keeps its place
    <div
      key={page === 'unit' ? 'unit:' + (unit?.id ?? '') : (page ?? 'none')}
      data-part='summary-pane'
      className='min-w-0 flex-1 overflow-auto bg-bg'
      id='summary-pane'
      style={hiddenStyle(!shown)}
      data-unit={unit?.id}
    >
      {page === 'overview' && <Overview />}
      {page === 'unit' &&
        (unit ? (
          <UnitPage unit={unit} />
        ) : (
          <div className='mx-auto mt-[calc(var(--screen-h)*0.12)] max-w-[560px] px-6 leading-[1.6] text-muted'>
            nothing changed
          </div>
        ))}
    </div>
  );
}
