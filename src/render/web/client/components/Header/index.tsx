// The header: the sidebar toggle, the change's name, Code | Summary, and the session's buttons.
// Everything else (the view settings, the shortcuts, the settings, end session) is in ⋯.

import { MessageSquare, PanelLeft, RefreshCw, Search } from 'lucide-react';
import { useLens } from '../../store.ts';
import { treeModel } from '../../model/tree.ts';
import { refresh } from '../../actions/session.ts';
import { openSearch } from '../../actions/dialogs.ts';
import { toggleNav } from '../../actions/prefs.ts';
import { askSetOpen } from '../../ask/rail.ts';
import { hiddenStyle } from '../../shared.ts';
import { IconButton } from '../../ui/IconButton.tsx';
import { ViewSwitch } from './ViewSwitch.tsx';
import { ThemeMenu } from './ThemeMenu.tsx';
import { MoreMenu } from './MoreMenu.tsx';
import './style.css';

export function Header() {
  const header = useLens((state) => ({
    navToggleShown: state.view === 'summary' || treeModel(state).hasTree,
    label: state.data.label,
    askOpen: state.ask.open,
    canRefresh: state.data.canRefresh,
    refreshing: state.refreshing,
  }));

  return (
    <header className='header'>
      <IconButton
        id='nav-toggle'
        label='Toggle the sidebar'
        style={hiddenStyle(!header.navToggleShown)}
        onClick={toggleNav}
      >
        <PanelLeft size={16} />
      </IconButton>
      <span className='brand'>
        lens<em>.</em>
      </span>
      {/* PR mode: "owner/repo#N — title" */}
      {header.label && (
        <span className='header-title' id='pr-label' title={header.label}>
          {header.label}
        </span>
      )}
      <span className='spacer' />
      <ViewSwitch />
      <span className='spacer' />
      <IconButton id='search-btn' label='Search in files' shortcut='⌘P' onClick={() => openSearch()}>
        <Search size={16} />
      </IconButton>
      <IconButton
        id='ask-btn'
        label='Ask your agent'
        shortcut='a'
        aria-pressed={header.askOpen}
        onClick={() => askSetOpen(!header.askOpen)}
      >
        <MessageSquare size={16} />
      </IconButton>
      <span className='header-divider' />
      <ThemeMenu />
      <IconButton
        id='refresh'
        label='Re-run the analysis'
        shortcut='r'
        style={hiddenStyle(!header.canRefresh)}
        disabled={header.refreshing}
        onClick={refresh}
      >
        <RefreshCw size={15} className={header.refreshing ? 'spin' : undefined} />
      </IconButton>
      <MoreMenu />
    </header>
  );
}
