// The strip's theme menu. The strip's page is only the window's top 40px and lies under the
// tabs' views, so a menu of its own would be cut off and covered. This page is a clear sheet in a
// view the main process puts over the whole window while the menu is open, and takes away after.

import { createRoot } from 'react-dom/client';
import '../../ui/styles/tokens.css';
import '../../ui/styles/base.css';
import type { MenuState } from '../shared/api.ts';
import { applyTheme } from '../shared/page.ts';
import { ThemeMenuSheet } from './ThemeMenuSheet.tsx';
import { useMenu } from './store.ts';

function show(menu: MenuState | null): void {
  if (!menu) return;
  if (useMenu.getState().menu?.theme.name !== menu.theme.name) applyTheme(menu.theme);
  useMenu.setState({ menu });
}

window.lensApp.menu.onState(show);
void window.lensApp.menu.state().then(show);
createRoot(document.getElementById('root')!).render(<ThemeMenuSheet />);
