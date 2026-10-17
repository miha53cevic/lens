// The sidebar: the file tree (Code view) or the list of changes (Summary tab), each under
// how far the review got.

import { useCallback } from 'react';
import { scrollStore, update, useLens } from '../../store.ts';
import { navShown } from '../../model/tree.ts';
import { Filter } from './Filter.tsx';
import { Tree } from './Tree.tsx';
import { SummaryList } from './SummaryList/index.tsx';
import { ChangesProgress, FilesProgress } from './Progress.tsx';
import { hiddenStyle } from '../../shared.ts';
import './style.css';

export function Nav() {
  const { view, shown, width, navQuery, sumQuery } = useLens((state) => ({
    view: state.view,
    shown: navShown(state),
    width: state.navWidth,
    navQuery: state.navQuery,
    sumQuery: state.sumQuery,
  }));
  const summaryView = view === 'summary';
  // The tree and the summary list share the sidebar's scroller. Keyed by the view, it
  // remounts on a switch and comes back where that view was left, the open unit in sight.
  const restoreScroll = useCallback(
    (nav: HTMLElement | null) => {
      if (!nav) return;
      nav.scrollTop = scrollStore.getState().nav[view];
      nav.querySelector('.sum-item.active, .file.active')?.scrollIntoView({ block: 'nearest' });
    },
    [view],
  );

  return (
    <nav
      id='nav'
      key={view}
      ref={restoreScroll}
      style={{ display: shown ? undefined : 'none', width: width ? width + 'px' : undefined }}
      onScroll={(event) => {
        const scrollTop = event.currentTarget.scrollTop;
        scrollStore.setState((positions) => ({ nav: { ...positions.nav, [view]: scrollTop } }));
      }}
    >
      {summaryView ? <ChangesProgress /> : <FilesProgress />}
      <Filter
        inputId='file-filter'
        clearId='filter-clear'
        hidden={summaryView}
        placeholder='Filter files'
        value={navQuery}
        onChange={(query) => update({ navQuery: query })}
      />
      <div id='tree' style={hiddenStyle(summaryView)}>
        {!summaryView && <Tree />}
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
