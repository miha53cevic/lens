import clsx from 'clsx';
import { ArrowLeftRight, Folder, Plus, Settings, X } from 'lucide-react';
import type { StripTab } from '../shared/api.ts';
import { IconButton } from '../../ui/IconButton.tsx';
import { Swatch } from '../../ui/Swatch.tsx';
import { useStrip } from './store.ts';
import './style.css';

function TabIcon({ icon }: { icon: StripTab['icon'] }) {
  if (icon === 'folder') return <Folder size={13} />;
  if (icon === 'settings') return <Settings size={13} />;
  return <Plus size={13} />;
}

/** The tab in front stays in sight when there are more tabs than the strip has room for. */
function keepInSight(tab: HTMLElement | null) {
  tab?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function RepoTab({ tab, active }: { tab: StripTab; active: boolean }) {
  const { strip } = window.lensApp;
  return (
    <div
      ref={active ? keepInSight : undefined}
      className={clsx('rtab', active && 'active')}
      data-tab={tab.id}
      // the middle button closes a tab, as in a browser
      onAuxClick={(event) => event.button === 1 && strip.close(tab.id)}
    >
      <button className='rtab-main' role='tab' aria-selected={active} onClick={() => strip.select(tab.id)}>
        <TabIcon icon={tab.icon} />
        <span className='rtab-title'>{tab.title}</span>
        {tab.detail && <span className='rtab-detail'>{tab.detail}</span>}
      </button>
      {/* on every tab with a review, shown or not, so a tab keeps its width when another comes to the front */}
      {tab.canChange && (
        // an icon alone: the title says what it swaps
        <IconButton
          size='sm'
          className='rtab-btn'
          label="Change what's reviewed"
          title="Change what's reviewed"
          onClick={() => strip.change(tab.id)}
        >
          <ArrowLeftRight size={12} />
        </IconButton>
      )}
      <IconButton size='sm' className='rtab-btn' label={'Close ' + tab.title} onClick={() => strip.close(tab.id)}>
        <X size={12} />
      </IconButton>
    </div>
  );
}

/** The window's title bar: the tabs, then what applies to the whole app. */
export function Strip() {
  const state = useStrip((store) => store.strip);
  if (!state) return null;
  const { strip } = window.lensApp;
  return (
    // a click acts without taking the focus, which stays in the tab's page: the ring is for keys
    <header className='tabstrip' onMouseDown={(event) => event.preventDefault()}>
      <div
        className='rtabs'
        role='tablist'
        // a mouse's wheel turns only up and down: here it moves the tabs sideways
        onWheel={(event) => {
          if (event.deltaX === 0) event.currentTarget.scrollLeft += event.deltaY;
        }}
      >
        {state.tabs.map((tab) => (
          <RepoTab key={tab.id} tab={tab} active={tab.id === state.activeId} />
        ))}
      </div>
      <IconButton id='new-tab' label='New tab' onClick={() => strip.add()}>
        <Plus size={14} />
      </IconButton>
      <span className='spacer' />
      <IconButton
        id='theme-btn'
        label={'Code theme: ' + state.theme.name}

        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          strip.themeMenu(rect.left, rect.bottom + 4);
        }}
      >
        <Swatch />
      </IconButton>
      <IconButton id='settings-btn' label='Settings' onClick={() => strip.settings()}>
        <Settings size={15} />
      </IconButton>
    </header>
  );
}
