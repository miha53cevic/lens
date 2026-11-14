import type { KeyboardEvent } from 'react';
import { useLens, type SettingsPage } from '../../store.ts';
import { showSettingsPage } from '../../actions/dialogs.ts';
import { cn } from '../../../ui/cn.ts';
import { ListRow } from '../../../ui/ListRow.tsx';
import { DIALOG, ModalHead } from '../ModalHead.tsx';
import { VIEW_PAGES } from './const.ts';
import { ConfigFoot, ConfigPage } from './ConfigPage.tsx';
import { ViewPages } from './ViewPages.tsx';
import { SettingsFile } from './SettingsFile.tsx';

/**
 * Settings: the view settings a page per section, picked in the rail on the left, and the config in
 * effect apart at its foot. A view setting applies as it changes; the config is read-only.
 */
export function SettingsDialog() {
  const { picked, summaryPage } = useLens((state) => ({
    picked: state.settingsPage,
    // without a summary its page would be empty: it leaves the rail
    summaryPage: state.data.summary !== null,
  }));
  const pages: SettingsPage[] = [
    ...VIEW_PAGES.filter(({ id }) => id !== 'summary' || summaryPage).map(({ id }) => id),
    'config',
  ];
  const page = pages.includes(picked) ? picked : pages[0];

  // ↑ / ↓ move through the rail, as through any list of tabs
  const onRailKey = (event: KeyboardEvent) => {
    const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = pages[(pages.indexOf(page) + step + pages.length) % pages.length];
    showSettingsPage(next);
    document.getElementById('settings-tab-' + next)?.focus();
  };
  const railRow = (id: SettingsPage, label: string) => (
    <ListRow
      key={id}
      id={'settings-tab-' + id}
      role='tab'
      aria-selected={page === id}
      tabIndex={page === id ? 0 : -1}
      selected={page === id}
      className='px-2 py-1'
      onClick={() => showSettingsPage(id)}
    >
      {label}
    </ListRow>
  );

  return (
    <dialog
      id='settings-modal'
      className={cn(DIALOG, 'h-[min(36rem,calc(var(--screen-h)*0.85))] w-[min(800px,calc(var(--screen-w)*0.9))]')}
    >
      <ModalHead title='Settings' />
      <div className='flex min-h-0 flex-1'>
        <div
          data-part='settings-rail'
          role='tablist'
          aria-orientation='vertical'
          aria-label='settings'
          className='flex w-[9.5rem] flex-none flex-col gap-1 border-r border-line p-2'
          onKeyDown={onRailKey}
        >
          {VIEW_PAGES.filter(({ id }) => pages.includes(id)).map(({ id, label }) => railRow(id, label))}
          <span className='flex-1' />
          {railRow('config', 'Config')}
        </div>
        <div
          data-part='modal-body'
          id='settings-body'
          role='tabpanel'
          aria-labelledby={'settings-tab-' + page}
          className='min-h-0 min-w-0 flex-1 overflow-y-auto px-4 pt-4 pb-5 text-md'
        >
          <ViewPages page={page} />
          <ConfigPage shown={page === 'config'} />
        </div>
      </div>
      <div className='flex-none border-t border-line px-4 py-3 text-sm [overflow-wrap:anywhere] text-faint [&_code]:text-text'>
        {page === 'config' ? <ConfigFoot /> : <SettingsFile />}
      </div>
    </dialog>
  );
}
