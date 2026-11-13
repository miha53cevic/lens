// A tab's right-click menu (components/Tabs/TabMenu.tsx): the close family, its path, its row in the tree.

import { commit, getState } from '../store.ts';
import { openAt } from '../../ui/Menu.tsx';
import { openFile } from './tabs.ts';
import { toggleNav } from './prefs.ts';
import { scrollToActiveRow } from './tree.ts';
import { copy } from './codeMenu.ts';

export const TAB_MENU_ID = 'tab-menu';

/** Committed: the menu's items name the tab before it opens. */
export function openTabMenu(fileIndex: number, event: MouseEvent): void {
  event.preventDefault();
  commit({ tabMenu: fileIndex });
  openAt(document.getElementById(TAB_MENU_ID), event);
}

export function copyTabPath(fileIndex: number): Promise<void> {
  return copy(getState().data.files[fileIndex].file, 'the path');
}

/** The file shows, its folders open (openFile), the sidebar too, and its row is scrolled to. */
export function revealTab(fileIndex: number): void {
  openFile(fileIndex);
  if (getState().navCollapsed) toggleNav();
  scrollToActiveRow();
}
