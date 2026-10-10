// The whole page: header, sidebar, editor (code or summary, with the review pill), Ask rail, and the modals.

import { useLens } from '../store.ts';
import { navShown } from '../model/tree.ts';
import { setNavWidth } from '../actions/prefs.ts';
import { askSetWidth } from '../ask/rail.ts';
import { Header } from './Header/index.tsx';
import { Nav } from './Nav/index.tsx';
import { Tabs } from './Tabs.tsx';
import { CodePane } from './CodePane/index.tsx';
import { SummaryPane } from './SummaryPane/index.tsx';
import { AskRail } from './AskRail/index.tsx';
import { Resizer } from './Resizer.tsx';
import { SettingsDialog } from './SettingsDialog.tsx';
import { KeysDialog } from './KeysDialog/index.tsx';
import { SearchDialog } from './SearchDialog/index.tsx';
import { ReviewPill } from './ReviewPill.tsx';
import { StatusBar } from './StatusBar/index.tsx';
import './App.css';

export function App() {
  const { ended, navVisible, askOpen } = useLens((state) => ({
    ended: state.ended,
    navVisible: navShown(state),
    askOpen: state.ask.open,
  }));
  if (ended) return <div className='ended'>Session ended: the lens server has stopped. You can close this tab.</div>;

  return (
    <>
      <Header />
      <SettingsDialog />
      <KeysDialog />
      <SearchDialog />
      <div className='layout'>
        <Nav />
        <Resizer
          id='resizer'
          label='resize the file tree'
          panelId='nav'
          hidden={!navVisible}
          widthAt={(event, nav) => Math.min(600, Math.max(160, event.clientX - nav.getBoundingClientRect().left))}
          onResized={(width) => setNavWidth(width || 262)}
        />
        <div className='editor'>
          <Tabs />
          <CodePane />
          <SummaryPane />
          <ReviewPill />
        </div>
        <Resizer
          id='ask-resizer'
          label='resize the Ask rail'
          panelId='ask-rail'
          hidden={!askOpen}
          widthAt={(event, rail) => Math.min(720, Math.max(280, rail.getBoundingClientRect().right - event.clientX))}
          onResized={(width) => askSetWidth(width || 360)}
        />
        <AskRail />
      </div>
      <StatusBar />
    </>
  );
}
