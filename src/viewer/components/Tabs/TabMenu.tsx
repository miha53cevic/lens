import { useLens } from '../../store.ts';
import { MenuItem, MenuPanel, MenuSeparator } from '../../../ui/Menu.tsx';
import { closeAllTabs, closeOtherTabs, closeTab, closeTabsToTheRight, closeViewedTabs } from '../../actions/tabs.ts';
import { copyTabPath, revealTab, TAB_MENU_ID } from '../../actions/tabMenu.ts';

/** A tab's right-click menu, on the tab it was opened on (`tabMenu`). */
export function TabMenu() {
  const { fileIndex, last, alone } = useLens((state) => ({
    fileIndex: state.tabMenu,
    last: state.tabs.at(-1)?.index === state.tabMenu,
    alone: state.tabs.length === 1,
  }));
  return (
    <MenuPanel id={TAB_MENU_ID} className='w-[240px] origin-top-left'>
      <MenuItem id='tab-menu-close' onSelect={() => closeTab(fileIndex)}>
        Close
      </MenuItem>
      <MenuItem id='tab-menu-others' disabled={alone} onSelect={() => closeOtherTabs(fileIndex)}>
        Close Others
      </MenuItem>
      <MenuItem id='tab-menu-right' disabled={last} onSelect={() => closeTabsToTheRight(fileIndex)}>
        Close to the Right
      </MenuItem>
      <MenuItem id='tab-menu-viewed' onSelect={closeViewedTabs}>
        Close Viewed
      </MenuItem>
      <MenuItem id='tab-menu-all' onSelect={closeAllTabs}>
        Close All
      </MenuItem>
      <MenuSeparator />
      <MenuItem id='tab-menu-copy' onSelect={() => void copyTabPath(fileIndex)}>
        Copy Path
      </MenuItem>
      <MenuItem id='tab-menu-reveal' onSelect={() => revealTab(fileIndex)}>
        Reveal in Tree
      </MenuItem>
    </MenuPanel>
  );
}
