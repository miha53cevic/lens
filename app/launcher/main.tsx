// The app's own screens, shown in a tab until a review runs there: Start, a repository's picker,
// Settings. The page draws what the main process says the tab shows, and asks it for everything
// through window.lensApp; it reads no files and starts nothing itself.

import { createRoot } from 'react-dom/client';
import '../../src/render/web/client/styles/tokens.css';
import '../../src/render/web/client/styles/base.css';
import type { LauncherState } from '../shared/api.ts';
import { applyTheme } from '../shared/page.ts';
import { Launcher } from './components/Launcher.tsx';
import { useLauncher } from './store.ts';

function show(state: LauncherState | null): void {
  if (!state) return;
  if (useLauncher.getState().state?.theme.name !== state.theme.name) applyTheme(state.theme);
  useLauncher.setState({ state });
}

window.lensApp.launcher.onState(show);
void window.lensApp.launcher.state().then(show);
createRoot(document.getElementById('root')!).render(<Launcher />);
