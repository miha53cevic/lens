// lens viewer: the page's entry point, bundled by Bun.build when the server starts (see bundle.ts).
// What belongs to the document rather than to a component is set up here: the global
// listeners, and the store subscriptions that keep the document in step with the state.

import { createRoot } from 'react-dom/client';
// the design tokens and the page's base styles come first: every component's own CSS builds on them
import '../ui/styles/tailwind.css';
import '../ui/styles/tokens.css';
import '../ui/styles/base.css';
import './styles/signals.css';
import { App } from './components/App.tsx';
import { ErrorBoundary } from '../ui/ErrorBoundary.tsx';
import { getState, subscribe, type LensState } from './store.ts';
import { isLightColor } from '../cli-app/theme.ts';
import { CODE_SIZE_DEFAULT } from './codeSize.ts';
import { applyZoom } from '../cli-app/zoom.ts';
import { setView, stampWatcher } from './actions/views.ts';
import { openFirstTreeFile } from './actions/tabs.ts';
import { askWatcher } from './ask/rail.ts';
import { dropForeignSelection, onSelectionChange } from './ask/selection.ts';
import { onKeyDown } from './keys.ts';
import { onPreviewMessage } from './actions/previews.ts';
import { onContextMenu } from './actions/codeMenu.ts';
import { forgetOldMarks } from './actions/marks.ts';
import { check, watch } from '../ui/poll.ts';
import { motionReady } from '../ui/motion.ts';

/**
 * The document follows the state: the theme's colors (the tokens' inputs), the code's size, the UI's zoom, the tab title, the Ask selection's change.
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
  // the code's size: at the default the token itself rules
  if (!previous || previous.codeSize !== state.codeSize) {
    const root = document.documentElement;
    if (state.codeSize === CODE_SIZE_DEFAULT) root.style.removeProperty('--text-code');
    else root.style.setProperty('--text-code', state.codeSize + 'px');
  }
  // the whole page's zoom: the server wrote it on the page too, so this changes nothing at start
  if (!previous || previous.uiZoom !== state.uiZoom) applyZoom(document.documentElement, state.uiZoom);
  // PR mode: "owner/repo#N — title" in the tab title too
  if (!previous || previous.data.label !== label) document.title = label ? 'lens — ' + label : 'lens';
  // a selection from another change goes when the reader opens a different one
  dropForeignSelection(state);
}

document.addEventListener('keydown', onKeyDown);
document.addEventListener('selectionchange', onSelectionChange);
// a right-click on a line of code: lens's own menu (Ask, Note, Copy) instead of the browser's
document.addEventListener('contextmenu', onContextMenu);
// the preview frames' clicks and heights (actions/previews.ts)
window.addEventListener('message', onPreviewMessage);
subscribe(syncDocument);

openFirstTreeFile();
syncDocument(getState(), null);
// the marks this browser kept before the server kept them per review: they were for no review in particular
forgetOldMarks();
const { data } = getState();
// what the page watches by asking again (poll.ts): the chat, while it is open or a question waits,
// and whether the summary or the code moved on
watch(askWatcher);
watch(stampWatcher);
if (getState().ask.open) void check(askWatcher.id);
createRoot(document.getElementById('root')!).render(
  <ErrorBoundary what='the review'>
    <App />
  </ErrorBoundary>,
);
// what the page arrives with is drawn still; what appears after may move
motionReady();
if (location.hash === '#summary' && data.summary) setView('summary');
