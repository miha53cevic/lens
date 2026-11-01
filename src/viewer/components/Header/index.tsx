// The header: the sidebar toggle, the change's name, Code | Summary, and the session's buttons.
// Everything else (the view settings, the shortcuts, the settings, end session) is in ⋯.

import { MessageSquare, PanelLeft, RefreshCw, Search } from 'lucide-react';
import { useLens } from '../../store.ts';
import { treeModel } from '../../model/tree.ts';
import { isBusy } from '../../model/status.ts';
import { refresh } from '../../actions/session.ts';
import { openSearch } from '../../actions/dialogs.ts';
import { toggleNav } from '../../actions/prefs.ts';
import { askToggle } from '../../ask/rail.ts';
import { hiddenStyle } from '../../shared.ts';
import { Brand } from '../../../ui/Brand.tsx';
import { IconButton } from '../../../ui/IconButton.tsx';
import { ViewSwitch } from './ViewSwitch.tsx';
import { ThemeMenu } from './ThemeMenu.tsx';
import { MoreMenu } from './MoreMenu.tsx';
import { TopBar, TopBarDivider } from '../../../ui/TopBar.tsx';

export function Header() {
  const header = useLens((state) => ({
    navToggleShown: state.view === 'summary' || treeModel(state).hasTree,
    label: state.data.label,
    askOpen: state.ask.open,
    canRefresh: state.data.canRefresh,
    refreshing: isBusy(state, 'refresh'),
  }));

  return (
    <TopBar>
      <IconButton
        id='nav-toggle'
        label='Toggle the sidebar'
        style={hiddenStyle(!header.navToggleShown)}
        onClick={toggleNav}
      >
        <PanelLeft size={16} />
      </IconButton>
      <Brand />
      {/* PR mode: "owner/repo#N — title" */}
      {header.label && (
        <span
          className='max-w-[calc(var(--screen-w)*0.34)] min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-muted'
          id='pr-label'
          title={header.label}
        >
          {header.label}
        </span>
      )}
      <span className='flex-1' />
      <ViewSwitch />
      <span className='flex-1' />
      <IconButton id='search-btn' label='Search in files' shortcut='⌘P' onClick={() => openSearch()}>
        <Search size={16} />
      </IconButton>
      <IconButton id='ask-btn' label='Ask your agent' shortcut='a' aria-pressed={header.askOpen} onClick={askToggle}>
        <MessageSquare size={16} />
      </IconButton>
      <TopBarDivider />
      <ThemeMenu />
      <IconButton
        id='refresh'
        label='Re-run the analysis'
        shortcut='r'
        style={hiddenStyle(!header.canRefresh)}
        disabled={header.refreshing}
        onClick={() => refresh()}
      >
        <RefreshCw size={15} className={header.refreshing ? 'spin' : undefined} />
      </IconButton>
      <MoreMenu />
    </TopBar>
  );
}
