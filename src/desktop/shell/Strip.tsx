import { ArrowLeftRight, Folder, Plus, Settings, Shapes } from 'lucide-react';
import type { StripTab } from '../shared/api.ts';
import { IconButton } from '../../ui/IconButton.tsx';
import { Kbd } from '../../ui/Kbd.tsx';
import { Tab, TAB_BUTTON } from '../../ui/Tab.tsx';
import { narrowOut, widenIn } from '../../ui/motion.ts';
import { THEME_TRIGGER, ThemeTrigger } from '../../ui/ThemeMenu.tsx';
import { useStrip } from './store.ts';

function TabIcon({ icon }: { icon: StripTab['icon'] }) {
  if (icon === 'folder') return <Folder size={13} />;
  if (icon === 'settings') return <Settings size={13} />;
  if (icon === 'sandbox') return <Shapes size={13} />;
  return <Plus size={13} />;
}

/** The number that picks the tab at this index: ⌘1–⌘8, and ⌘9 the last one, as in a browser. */
function hintOf(index: number, count: number): string | null {
  if (index < 8) return String(index + 1);
  return index === count - 1 ? '9' : null;
}

/**
 * The tab in front stays in sight when there are more tabs than the strip has room for. On the
 * tab's button, since the tab's own ref widens it in when it opens.
 */
function keepInSight(button: HTMLElement | null) {
  button?.closest('[data-tab]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function RepoTab({ tab, active, hint }: { tab: StripTab; active: boolean; hint: string | null }) {
  const { strip } = window.lensApp;
  return (
    <Tab
      tabRef={widenIn}
      mainRef={active ? keepInSight : undefined}
      data-tab={tab.id}
      active={active}
      onSelect={() => strip.select(tab.id)}
      // it narrows out, and stays narrowed until the main process's answer takes it out
      onClose={() => narrowOut(document.querySelector(`[data-tab="${tab.id}"]`), () => strip.close(tab.id), true)}
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
      {/* the number over the icon, which keeps its place: the tabs don't move while ⌘ is held */}
      <span className='relative inline-flex'>
        <span className={hint ? 'invisible inline-flex' : 'inline-flex'}>
          <TabIcon icon={tab.icon} />
        </span>
        {hint && (
          <span className='absolute inset-0 flex items-center justify-center'>
            <Kbd size='sm' combo={hint} />
          </span>
        )}
      </span>
      <span className='font-semibold'>{tab.title}</span>
      {tab.detail && <span className='overflow-hidden text-ellipsis text-muted'>{tab.detail}</span>}
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
    <header
      data-part='tabstrip'
      className='flex h-[40px] items-center gap-1 bg-bg pr-[max(var(--space-3),calc(var(--screen-w)-env(titlebar-area-x,0px)-env(titlebar-area-width,var(--screen-w))))] pl-[max(var(--space-3),env(titlebar-area-x,0px))] select-none [-webkit-app-region:drag] [:root[data-platform=darwin]:not([data-fullscreen])_&]:pl-[max(78px,env(titlebar-area-x,0px))] [&_button]:[-webkit-app-region:no-drag] [&>span]:min-w-[48px]'
      onMouseDown={(event) => event.preventDefault()}
    >
      <div
        className='-mx-1 flex min-w-0 gap-1 overflow-x-auto p-1 [scrollbar-width:none] [-webkit-app-region:no-drag]'
        role='tablist'
        data-hints={state.hints || undefined}
        // a mouse's wheel turns only up and down: here it moves the tabs sideways
        onWheel={(event) => {
          if (event.deltaX === 0) event.currentTarget.scrollLeft += event.deltaY;
        }}
      >
        {state.tabs.map((tab, index) => (
          <RepoTab
            key={tab.id}
            tab={tab}
            active={tab.id === state.activeId}
            hint={state.hints ? hintOf(index, state.tabs.length) : null}
          />
        ))}
      </div>
      <IconButton id='new-tab' label='New tab' onClick={() => strip.add()}>
        <Plus size={14} />
      </IconButton>
      <span className='flex-1' />
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
