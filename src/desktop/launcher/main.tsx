// The app's own screens, shown in a tab until a review runs there: Start, a repository's picker,
// Settings, the design system's sandbox. The page draws what the main process says the tab shows, and asks it for everything
// through window.lensApp; it reads no files and starts nothing itself.

import { createRoot } from 'react-dom/client';
import '../../ui/styles/tailwind.css';
import '../../ui/styles/tokens.css';
import '../../ui/styles/base.css';
import { watch } from '../../ui/poll.ts';
import type { LauncherState } from '../shared/api.ts';
import { applyTheme } from '../shared/page.ts';
import { applyZoom } from '../../cli-app/zoom.ts';
import { motionReady } from '../../ui/motion.ts';
import { Launcher } from './components/Launcher.tsx';
import { ErrorBoundary } from '../../ui/ErrorBoundary.tsx';
import { useLauncher } from './store.ts';

function show(state: LauncherState | null): void {
  if (!state) return;
  if (useLauncher.getState().state?.theme.name !== state.theme.name) applyTheme(state.theme);
  if (useLauncher.getState().state?.zoom !== state.zoom) applyZoom(document.documentElement, state.zoom);
  useLauncher.setState({ state });
  // the screen the tab opens on is drawn still; the ones after it may move
  motionReady();
}

/** How often the picker asks whether its repository is still as shown. */
const PICKER_POLL_MS = 5000;

window.lensApp.launcher.onState(show);
// The picker's counts follow the repository: asked again while the picker is in sight, and at once
// when it comes back into sight (the loop is the viewer's, poll.ts). A `git add` in a terminal shows.
watch({
  id: 'picker',
  every: PICKER_POLL_MS,
  when: () => useLauncher.getState().state?.screen === 'picker',
  run: () => window.lensApp.launcher.refresh(),
});
// ⌘O / Ctrl O on Start: Open repository, as its button says
document.addEventListener('keydown', (event) => {
  const state = useLauncher.getState().state;
  if (state?.screen !== 'start' || state.status.kind === 'working') return;
  const mod = state.platform === 'darwin' ? event.metaKey : event.ctrlKey;
  if (mod && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'o') {
    event.preventDefault();
    window.lensApp.launcher.openRepository();
  }
});
void window.lensApp.launcher.state().then(show);
createRoot(document.getElementById('root')!).render(
  <ErrorBoundary what='this screen'>
    <Launcher />
  </ErrorBoundary>,
);
