import { ArrowLeftRight, Folder, Plus, Settings, Shapes } from 'lucide-react';
import type { StripTab } from '../shared/api.ts';
import { IconButton } from '../../ui/IconButton.tsx';
import { Tab, TAB_BUTTON } from '../../ui/Tab.tsx';
import { narrowOut, widenIn } from '../../ui/motion.ts';
import { THEME_TRIGGER, ThemeTrigger } from '../../ui/ThemeMenu.tsx';
import { useStrip } from './store.ts';
import './style.css';

function TabIcon({ icon }: { icon: StripTab['icon'] }) {
  if (icon === 'folder') return <Folder size={13} />;
  if (icon === 'settings') return <Settings size={13} />;
  if (icon === 'sandbox') return <Shapes size={13} />;
  return <Plus size={13} />;
}

/**
 * The tab in front stays in sight when there are more tabs than the strip has room for. On the
 * tab's button, since the tab's own ref widens it in when it opens.
 */
function keepInSight(button: HTMLElement | null) {
  button?.closest('.rtab')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function RepoTab({ tab, active }: { tab: StripTab; active: boolean }) {
  const { strip } = window.lensApp;
  return (
    <Tab
      tabRef={widenIn}
      mainRef={active ? keepInSight : undefined}
      className='rtab'
      data-tab={tab.id}
      active={active}
      onSelect={() => strip.select(tab.id)}
      // it narrows out, and stays narrowed until the main process's answer takes it out
      onClose={() => narrowOut(document.querySelector(`.rtab[data-tab="${tab.id}"]`), () => strip.close(tab.id), true)}
      closeLabel={'Close ' + tab.title}
      actions={
        // on every tab with a review, shown or not, so a tab keeps its width when another comes to the front
        tab.canChange && (
          // an icon alone: the title says what it swaps
          <IconButton
            size='sm'
            className={TAB_BUTTON}
            label="Change what's reviewed"
            title="Change what's reviewed"
            onClick={() => strip.change(tab.id)}
          >
            <ArrowLeftRight size={12} />
          </IconButton>
        )
      }
    >
      <TabIcon icon={tab.icon} />
      <span className='rtab-title'>{tab.title}</span>
      {tab.detail && <span className='rtab-detail'>{tab.detail}</span>}
    </Tab>
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
        className={THEME_TRIGGER}
        // the viewer's own theme menu (ui/ThemeMenu), with its button here and its list in a view
        // of its own over the tab's page: a popover of this page would open underneath that
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          strip.themeMenu(rect.right, rect.bottom);
        }}
      >
        <ThemeTrigger />
      </IconButton>
      <IconButton id='settings-btn' label='Settings' onClick={() => strip.settings()}>
        <Settings size={15} />
      </IconButton>
    </header>
  );
}
