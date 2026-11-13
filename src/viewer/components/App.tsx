// The whole page: header, sidebar, editor (code, summary or plan, with the review pill), Ask rail, and the modals.

import { useLens } from '../store.ts';
import { navShown } from '../model/tree.ts';
import { askShown } from '../model/askContext.ts';
import { setNavWidth } from '../actions/prefs.ts';
import { askSetWidth } from '../ask/rail.ts';
import { Header } from './Header/index.tsx';
import { Nav } from './Nav/index.tsx';
import { Tabs } from './Tabs/index.tsx';
import { CodePane } from './CodePane/index.tsx';
import { SummaryPane } from './SummaryPane/index.tsx';
import { PlanPane } from './PlanPane/index.tsx';
import { AskRail } from './AskRail/index.tsx';
import { Resizer } from './Resizer.tsx';
import { SettingsDialog } from './SettingsDialog/index.tsx';
import { KeysDialog } from './KeysDialog/index.tsx';
import { SearchDialog } from './SearchDialog/index.tsx';
import { ClearDataDialog } from './ClearDataDialog/index.tsx';
import { ReviewPill } from './ReviewPill.tsx';
import { StatusBar } from './StatusBar/index.tsx';
import { CodeMenu } from './CodeMenu.tsx';
import { cssPx } from '../../ui/zoom.ts';

export function App() {
  const { ended, navVisible, askOpen } = useLens((state) => ({
    ended: state.ended,
    navVisible: navShown(state),
    askOpen: askShown(state),
  }));
  if (ended) return <div className='ended'>Session ended: the lens server has stopped. You can close this tab.</div>;

  return (
    <>
      <Header />
      <SettingsDialog />
      <KeysDialog />
      <SearchDialog />
      <ClearDataDialog />
      <CodeMenu />
      <div className='flex min-h-0 flex-1 overflow-clip'>
        <Nav />
        <Resizer
          id='resizer'
          label='resize the file tree'
          panelId='nav'
          hidden={!navVisible}
          widthAt={(event, nav) =>
            Math.min(600, Math.max(160, cssPx(event.clientX - nav.getBoundingClientRect().left)))
          }
          onResized={setNavWidth}
        />
        <div className='@container/editor relative flex min-w-0 flex-1 flex-col'>
          <Tabs />
          <CodePane />
          <SummaryPane />
          <PlanPane />
          <ReviewPill />
        </div>
        <Resizer
          id='ask-resizer'
          label='resize the Ask rail'
          panelId='ask-rail'
          hidden={!askOpen}
          widthAt={(event, rail) =>
            Math.min(720, Math.max(280, cssPx(rail.getBoundingClientRect().right - event.clientX)))
          }
          onResized={askSetWidth}
        />
        <AskRail />
      </div>
      <StatusBar />
    </>
  );
}
