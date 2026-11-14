import { useLens } from '../../store.ts';
import { baseName, hiddenStyle } from '../../shared.ts';
import { closeTab, openFile, pinTab } from '../../actions/tabs.ts';
import { openTabMenu } from '../../actions/tabMenu.ts';
import { StatusLetter } from '../../../ui/FileStatus.tsx';
import { Tab } from '../../../ui/Tab.tsx';
import { TabMenu } from './TabMenu.tsx';

/** The tab in front stays in sight when there are more tabs than the bar has room for. */
function keepInSight(tab: HTMLElement | null) {
  tab?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
}

export function Tabs() {
  const { tabs, active, files, hidden } = useLens((state) => ({
    tabs: state.tabs,
    active: state.active,
    files: state.data.files,
    hidden: state.tabs.length === 0 || state.view !== 'code',
  }));
  // basenames shared by several open tabs get their directory as a suffix
  const baseNameCounts = new Map<string, number>();
  for (const tab of tabs) {
    const name = baseName(files[tab.index].file);
    baseNameCounts.set(name, (baseNameCounts.get(name) || 0) + 1);
  }

  return (
    <div
      id='tabbar'
      // the row's bottom line is its own shadow, so the tab in front, in the editor's surface, covers it
      className='flex h-control-lg flex-none items-stretch bg-bg pr-3 shadow-[inset_0_-1px_0_var(--line)]'
      style={hiddenStyle(hidden)}
    >
      <div
        className='flex min-w-0 flex-1 overflow-x-auto [scrollbar-width:none]'
        role='tablist'
        // a mouse's wheel turns only up and down: here it moves the tabs sideways
        onWheel={(event) => {
          if (event.deltaX === 0) event.currentTarget.scrollLeft += event.deltaY;
        }}
      >
        {tabs.map((tab) => {
          const file = files[tab.index];
          const path = file.file;
          const name = baseName(path);
          const dir = path.slice(0, Math.max(0, path.length - name.length - 1));
          return (
            <Tab
              key={tab.index}
              data-file={tab.index}
              tabRef={tab.index === active ? keepInSight : undefined}
              active={tab.index === active}
              className='max-w-[260px]'
              data-preview={tab.pinned ? undefined : ''}
              mono
              flat
              tip={path}
              onSelect={() => openFile(tab.index)}
              onDoubleClick={() => pinTab(tab.index)}
              onClose={() => closeTab(tab.index)}
              onContextMenu={(event) => openTabMenu(tab.index, event.nativeEvent)}
              closeLabel={'Close ' + name}
            >
              {file.status && <StatusLetter status={file.status} />}
              <span data-part='tab-name' className='overflow-hidden text-ellipsis group-data-preview/tab:italic'>
                {name}
              </span>
              {baseNameCounts.get(name)! > 1 && dir && (
                <span className='overflow-hidden text-xs text-ellipsis text-faint'>{dir}</span>
              )}
            </Tab>
          );
        })}
      </div>
      <TabMenu />
    </div>
  );
}
