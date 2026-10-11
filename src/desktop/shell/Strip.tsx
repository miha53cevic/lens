import clsx from 'clsx';
import { ChevronDown, Folder, Plus, Settings, X } from 'lucide-react';
import type { StripTab } from '../shared/api.ts';
import { IconButton } from '../../viewer/ui/IconButton.tsx';
// the theme swatch is the viewer header's
import '../../viewer/components/Header/style.css';
import { useStrip } from './store.ts';
import './style.css';

function TabIcon({ icon }: { icon: StripTab['icon'] }) {
  if (icon === 'folder') return <Folder size={13} />;
  if (icon === 'settings') return <Settings size={13} />;
  return <Plus size={13} />;
}

function RepoTab({ tab, active }: { tab: StripTab; active: boolean }) {
  const { strip } = window.lensApp;
  return (
    <div
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
      {/* on the tab in front: its picker opens over the review you are looking at */}
      {tab.canChange && active && (
        <button className='rtab-btn' aria-label="Change what's reviewed" onClick={() => strip.change(tab.id)}>
          <ChevronDown size={12} />
        </button>
      )}
      <button className='rtab-btn rtab-close' aria-label={'Close ' + tab.title} onClick={() => strip.close(tab.id)}>
        <X size={12} />
      </button>
    </div>
  );
}

/** The window's title bar: the tabs, then what applies to the whole app. */
export function Strip() {
  const state = useStrip((store) => store.strip);
  if (!state) return null;
  const { strip } = window.lensApp;
  return (
    <header className='tabstrip'>
      <div className='rtabs' role='tablist'>
        {state.tabs.map((tab) => (
          <RepoTab key={tab.id} tab={tab} active={tab.id === state.activeId} />
        ))}
      </div>
      <IconButton id='new-tab' label='New tab' className='strip-btn' onClick={() => strip.add()}>
        <Plus size={14} />
      </IconButton>
      <span className='spacer' />
      <IconButton
        id='theme-btn'
        label={'Code theme: ' + state.theme.name}
        className='strip-btn'
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          strip.themeMenu(rect.left, rect.bottom + 4);
        }}
      >
        <span className='swatch current' />
      </IconButton>
      <IconButton id='settings-btn' label='Settings' className='strip-btn' onClick={() => strip.settings()}>
        <Settings size={15} />
      </IconButton>
    </header>
  );
}
