import { X } from 'lucide-react';
import clsx from 'clsx';
import { useLens } from '../store.ts';
import { baseName, hiddenStyle } from '../shared.ts';
import { closeTab, openFile, pinTab } from '../actions/tabs.ts';
import { StatusLetter } from '../../ui/FileStatus.tsx';
import { IconButton } from '../../ui/IconButton.tsx';
import './Tabs.css';

/** The tab in front stays in sight when there are more tabs than the bar has room for. */
function keepInSight(tab: HTMLElement | null) {
  tab?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
}

/** The Code view's editor tabs. */
export function Tabs() {
  const { tabs, active, files, hidden } = useLens((state) => ({
    tabs: state.tabs,
    active: state.active,
    files: state.data.files,
    hidden: state.tabs.length === 0 || state.view === 'summary',
  }));
  // basenames shared by several open tabs get their directory as a suffix
  const baseNameCounts = new Map<string, number>();
  for (const tab of tabs) {
    const name = baseName(files[tab.index].file);
    baseNameCounts.set(name, (baseNameCounts.get(name) || 0) + 1);
  }

  return (
    <div
      className='tabbar'
      id='tabbar'
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
          <div
            key={tab.index}
            ref={tab.index === active ? keepInSight : undefined}
            className={clsx('tab', tab.index === active && 'active', !tab.pinned && 'preview')}
            title={path}
            onClick={() => openFile(tab.index)}
            onDoubleClick={() => pinTab(tab.index)}
            onAuxClick={(event) => {
              if (event.button === 1) closeTab(tab.index);
            }}
          >
            {file.status && <StatusLetter status={file.status} />}
            <span className='tab-name'>{name}</span>
            {baseNameCounts.get(name)! > 1 && dir && <span className='tab-dir'>{dir}</span>}
            <IconButton
              size='sm'
              className='tab-close'
              label='close'
              onClick={(event) => {
                event.stopPropagation();
                closeTab(tab.index);
              }}
            >
              <X size={12} />
            </IconButton>
          </div>
        );
      })}
    </div>
  );
}
