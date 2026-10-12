// lens viewer: the page's entry point, bundled by esbuild when the server starts (see bundle.ts).
// What belongs to the document rather than to a component is set up here: the global
// listeners, and the store subscriptions that keep the document in step with the state.

import { createRoot } from 'react-dom/client';
// the design tokens and the page's base styles come first: every component's own CSS builds on them
import './styles/tokens.css';
import './styles/base.css';
import './styles/signals.css';
import { App } from './components/App.tsx';
import { getState, subscribe, type LensState } from './store.ts';
import { isLightColor } from '../cli-app/theme.ts';
import { checkSummaryStamp, setView } from './actions/views.ts';
import { openFirstTreeFile } from './actions/tabs.ts';
import { askWatcher } from './ask/rail.ts';
import { dropForeignSelection, onSelectionChange } from './ask/selection.ts';
import { onKeyDown } from './keys.ts';
import { check, watch } from './poll.ts';

/**
 * The document follows the state: the theme's colors (the tokens' inputs), the tab title, the Ask selection's change.
 * The chrome's colors are mixed from the code theme's (styles/tokens.css), and a light theme also flips the
 * fixed colors (diff, signals) to their light set. The server writes the same on the page it sends.
 */
function syncDocument(state: LensState, previous: LensState | null) {
  const { fg, bg, accent, label } = state.data;
  if (!previous || previous.data.fg !== fg || previous.data.bg !== bg || previous.data.accent !== accent) {
    const root = document.documentElement;
    root.style.setProperty('--code-fg', fg);
    root.style.setProperty('--code-bg', bg);
    root.style.setProperty('--theme-accent', accent);
    root.dataset.appearance = isLightColor(bg) ? 'light' : 'dark';
  }
  // PR mode: "owner/repo#N — title" in the tab title too
  if (!previous || previous.data.label !== label) document.title = label ? 'lens — ' + label : 'lens';
  // a selection from another change goes when the reader opens a different one
  dropForeignSelection(state);
}

document.addEventListener('keydown', onKeyDown);
document.addEventListener('selectionchange', onSelectionChange);
window.addEventListener('focus', checkSummaryStamp);
subscribe(syncDocument);

openFirstTreeFile();
syncDocument(getState(), null);
const { data } = getState();
// what the page watches by asking again (poll.ts): the chat, while it is open or a question waits
watch(askWatcher);
if (getState().ask.open) void check(askWatcher.id);
createRoot(document.getElementById('root')!).render(<App />);
if (location.hash === '#summary' && data.summary) setView('summary');
