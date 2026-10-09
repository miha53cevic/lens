import clsx from 'clsx';
import { useLens } from '../store.ts';
import { baseName, hiddenStyle } from '../shared.ts';
import { closeTab, openFile, pinTab } from '../actions/tabs.ts';

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
    <div className='tabbar' id='tabbar' style={hiddenStyle(hidden)}>
      {tabs.map((tab) => {
        const path = files[tab.index].file;
        const name = baseName(path);
        const dir = path.slice(0, Math.max(0, path.length - name.length - 1));
        return (
          <div
            key={tab.index}
            className={clsx('tab', tab.index === active && 'active', !tab.pinned && 'preview')}
            title={path + (tab.pinned ? '' : ' — preview tab: reused by the next open, double-click to keep')}
            onClick={() => openFile(tab.index)}
            onDoubleClick={() => pinTab(tab.index)}
            onAuxClick={(event) => {
              if (event.button === 1) closeTab(tab.index);
            }}
          >
            <span className='tab-name'>{name}</span>
            {baseNameCounts.get(name)! > 1 && dir && <span className='tab-dir'>{dir}</span>}
            <button
              className='tab-close'
              title='close (or middle-click)'
              onClick={(event) => {
                event.stopPropagation();
                closeTab(tab.index);
              }}
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}
