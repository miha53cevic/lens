import clsx from 'clsx';
// The sidebar: the file tree (Code view) or the list of changes (Summary tab), each under
// how far the review got, or the list of plans (Plan tab).

import { useCallback } from 'react';
import { scrollStore, update, useLens } from '../../store.ts';
import { navShown } from '../../model/tree.ts';
import { Filter } from './Filter.tsx';
import { Tree } from './Tree/index.tsx';
import { ExplorerHeader } from './ExplorerHeader.tsx';
import { SummaryList } from './SummaryList/index.tsx';
import { ChangesProgress, FilesProgress } from './Progress.tsx';
import { PlanList } from './PlanList/index.tsx';
import { hiddenStyle } from '../../shared.ts';

export function Nav() {
  const { view, shown, width, navQuery, sumQuery } = useLens((state) => ({
    view: state.view,
    shown: navShown(state),
    width: state.navWidth,
    navQuery: state.navQuery,
    sumQuery: state.sumQuery,
  }));
  const summaryView = view === 'summary';
  const planView = view === 'plan';
  // The tree and the summary list share the sidebar's scroller. Keyed by the view, it
  // remounts on a switch and comes back where that view was left, the open unit in sight.
  const restoreScroll = useCallback(
    (nav: HTMLElement | null) => {
      if (!nav) return;
      nav.scrollTop = scrollStore.getState().nav[view];
      nav.querySelector('[data-part="file"][data-active]')?.scrollIntoView({ block: 'nearest' });
    },
    [view],
  );

  return (
    <nav
      id='nav'
      key={view}
      className={clsx(
        // a row scrolled into sight from below the top stops under the sticky filter, not behind it
        'group/nav w-[270px] flex-none overflow-x-hidden overflow-y-auto bg-bg px-3 pt-4 pb-6 scroll-pt-[calc(var(--control-h)+var(--space-2))] text-sm',
        // the Summary list's cards need the room
        summaryView ? 'min-w-[340px]' : 'min-w-0',
      )}
      ref={restoreScroll}
      style={{ display: shown ? undefined : 'none', width: width ? width + 'px' : undefined }}
      onScroll={(event) => {
        const scrollTop = event.currentTarget.scrollTop;
        scrollStore.setState((positions) => ({ nav: { ...positions.nav, [view]: scrollTop } }));
      }}
    >
      {planView ? <PlanList /> : summaryView ? <ChangesProgress /> : <FilesProgress />}
      {view === 'code' && <ExplorerHeader />}
      <Filter
        inputId='file-filter'
        clearId='filter-clear'
        hidden={summaryView || planView}
        placeholder='Filter files'
        value={navQuery}
        onChange={(query) => update({ navQuery: query })}
      />
      <div id='tree' className='-mx-3' style={hiddenStyle(summaryView || planView)}>
        {view === 'code' && <Tree />}
      </div>
      <Filter
        wrapperId='sum-filter'
        hidden={!summaryView}
        placeholder='Filter changes'
        value={sumQuery}
        onChange={(query) => update({ sumQuery: query })}
      />
      <div id='summary-list' style={hiddenStyle(!summaryView)}>
        {summaryView && <SummaryList />}
      </div>
    </nav>
  );
}
