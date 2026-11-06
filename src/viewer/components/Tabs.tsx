import { useLens } from '../store.ts';
import { baseName, hiddenStyle } from '../shared.ts';
import { closeTab, openFile, pinTab } from '../actions/tabs.ts';
import { StatusLetter } from '../../ui/FileStatus.tsx';
import { Tab } from '../../ui/Tab.tsx';

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
      className='flex flex-none gap-1 overflow-x-auto bg-bg px-6 pt-3 pb-2 [scrollbar-width:none]'
      id='tabbar'
      role='tablist'
      style={hiddenStyle(hidden)}
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
            title={path}
            onSelect={() => openFile(tab.index)}
            onDoubleClick={() => pinTab(tab.index)}
            onClose={() => closeTab(tab.index)}
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
  );
}
