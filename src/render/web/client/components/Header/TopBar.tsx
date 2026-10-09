import { useLens } from '../../store.ts';
import { treeModel } from '../../model/tree.ts';
import { endSession, refresh, switchTheme } from '../../actions/session.ts';
import { openDialog, openSearch } from '../../actions/dialogs.ts';
import { setView } from '../../actions/views.ts';
import { toggleNav } from '../../actions/sidebar.ts';
import { askSetOpen } from '../../ask/rail.ts';
import { writePref } from '../../shared.ts';
import { hiddenStyle, statsText } from './util.ts';

export function TopBar() {
  const topBar = useLens((state) => ({
    summaryView: state.view === 'summary',
    navToggleShown: state.view === 'summary' || treeModel(state).hasTree,
    label: state.data.label,
    hasSummary: !!state.data.summary,
    summaryDot: state.summaryDot,
    stats: statsText(state),
    askOpen: state.ask.open,
    theme: state.data.theme,
    themes: state.data.themes,
    themeBusy: state.themeBusy,
    canRefresh: state.data.canRefresh,
    refreshing: state.refreshing,
  }));

  return (
    <div className='bar'>
      <button
        id='nav-toggle'
        className='icon'
        title='toggle the file tree'
        style={hiddenStyle(!topBar.navToggleShown)}
        onClick={toggleNav}
      >
        &#9776;
      </button>
      <div className='brand'>lens</div>
      {/* PR mode: "owner/repo#N — title" */}
      <span className='pr-label' id='pr-label' style={hiddenStyle(!topBar.label)} title={topBar.label || ''}>
        {topBar.label || ''}
      </span>
      <div
        className='view-switch'
        id='view-switch'
        style={hiddenStyle(!topBar.hasSummary)}
        role='group'
        aria-label='view'
      >
        <button
          id='view-code'
          aria-pressed={!topBar.summaryView}
          title='the diff, folded (v)'
          onClick={() => setView('code')}
        >
          Code
        </button>
        <button
          id='view-summary'
          aria-pressed={topBar.summaryView}
          title='one changed function at a time, summarized by your agent (v)'
          onClick={() => setView('summary')}
        >
          Summary
          <span
            className='new-dot'
            id='summary-dot'
            style={hiddenStyle(!topBar.summaryDot)}
            title='a new summary is available'
          />
        </button>
      </div>
      <span className='stats' id='stats' style={topBar.summaryView ? { visibility: 'hidden' } : undefined}>
        {topBar.stats}
      </span>
      <span className='spacer' />
      <button
        id='ask-btn'
        aria-pressed={topBar.askOpen}
        title='ask your agent about the code (a · hide with \)'
        onClick={() => askSetOpen(!topBar.askOpen)}
      >
        Ask
      </button>
      <button id='search-btn' className='icon' title='search in files (⌘P)' onClick={() => openSearch()}>
        ⌕
      </button>
      <select
        id='theme-select'
        title='color theme'
        value={topBar.theme}
        disabled={topBar.themeBusy}
        onChange={async (event) => {
          const theme = event.target.value;
          if (await switchTheme(theme)) writePref('lens.theme', theme);
        }}
      >
        {topBar.themes.map((theme) => (
          <option key={theme} value={theme}>
            {theme}
          </option>
        ))}
      </select>
      <button id='settings-btn' className='icon' title='current settings' onClick={() => openDialog('settings-modal')}>
        ⚙
      </button>
      <button id='keys-btn' className='icon' title='keyboard shortcuts (?)' onClick={() => openDialog('keys-modal')}>
        ?
      </button>
      <button
        id='refresh'
        title='re-run the analysis'
        style={hiddenStyle(!topBar.canRefresh)}
        disabled={topBar.refreshing}
        onClick={refresh}
      >
        {topBar.refreshing ? '…' : '↻ refresh'}
      </button>
      <button
        id='end-session'
        title='stop the lens server'
        onClick={(event) => {
          event.currentTarget.disabled = true;
          endSession();
        }}
      >
        ⏻ end
      </button>
    </div>
  );
}
