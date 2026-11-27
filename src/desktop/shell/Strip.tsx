import clsx from 'clsx';
import { ArrowLeftRight, Folder, Plug, Plus, Shapes } from 'lucide-react';
import type { StripState, StripTab } from '../shared/api.ts';
import { IconButton } from '../../ui/IconButton.tsx';
import { Kbd } from '../../ui/Kbd.tsx';
import { Tab, TAB_BUTTON } from '../../ui/Tab.tsx';
import { narrowOut, widenIn } from '../../ui/motion.ts';
import { THEME_TRIGGER, ThemeTrigger } from '../../ui/ThemeMenu.tsx';
import { useStrip } from './store.ts';

function TabIcon({ icon }: { icon: StripTab['icon'] }) {
  if (icon === 'folder') return <Folder size={13} />;
  if (icon === 'setup') return <Plug size={13} />;
  if (icon === 'sandbox') return <Shapes size={13} />;
  return <Plus size={13} />;
}

/**
 * What the App button says, and the dot it carries: the reviews' pages know nothing of the app, so
 * this is all a review tab shows of an update. Strongest first: an update running, one that failed,
 * something to install, an update offered.
 */
function appButton({ update, setupMissing }: StripState): { label: string; dot: string | null; live: boolean } {
  if (update.kind === 'applying') {
    return { label: `App: updating to lens ${update.version}`, dot: '[--dot:var(--accent)]', live: true };
  }
  if (update.kind === 'failed') return { label: 'App: ' + update.label, dot: '[--dot:var(--risk)]', live: false };
  if (setupMissing) return { label: 'App: not everything is installed', dot: '[--dot:var(--risk)]', live: false };
  if (update.kind === 'available') {
    return { label: `App: lens ${update.version} is available`, dot: '[--dot:var(--accent)]', live: false };
  }
  return { label: 'App', dot: null, live: false };
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
      floatButtons
      onSelect={() => strip.select(tab.id)}
      // it narrows out, and stays narrowed until the main process's answer takes it out
      onClose={() => narrowOut(document.querySelector(`[data-tab="${tab.id}"]`), () => strip.close(tab.id), true)}
      closeLabel={'Close ' + tab.title}
      actions={
        // on every tab with a review: it shows over the tab's end, so it takes no room
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
  const app = appButton(state);
  const shownUpdate = ['applying', 'failed', 'available'].includes(state.update.kind) ? state.update.kind : undefined;
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
      <IconButton
        id='setup-btn'
        label={app.label}
        data-missing={state.setupMissing || undefined}
        data-update={shownUpdate}
        onClick={() => strip.setup()}
      >
        <Plug size={15} />
        {app.dot && <span className={clsx('dot absolute top-1 right-1', app.dot, app.live && 'pulse')} />}
      </IconButton>
    </header>
  );
}
