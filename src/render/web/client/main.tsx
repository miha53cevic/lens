// lens viewer: the page's entry point, bundled by esbuild when the server starts (see bundle.ts).
// What belongs to the document rather than to a component is set up here: the global
// listeners, and the store subscriptions that keep the document in step with the state.

import { createRoot } from 'react-dom/client';
import { App } from './components/App.tsx';
import { getState, subscribe, type LensState } from './store.ts';
import { readPref, writePref } from './shared.ts';
import { checkSummaryStamp, setView } from './actions/views.ts';
import { openFirstTreeFile } from './actions/tabs.ts';
import { switchTheme } from './actions/session.ts';
import { askPoll } from './ask/rail.ts';
import { dropForeignSelection, onSelectionChange } from './ask/selection.ts';
import { onKeyDown } from './keys.ts';

// A light code theme flips the whole chrome to the light palette, so the
// header/sidebar/modals match instead of boxing a bright pane in dark panels.
function isLightColor(color: string) {
  // longest-first: themes report #rgb, #rgba, #rrggbb, or #rrggbbaa
  const hexMatch = /^#([0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{4}|[0-9a-f]{3})$/i.exec((color || '').trim());
  if (!hexMatch) return false;
  let hex = hexMatch[1];
  if (hex.length <= 4) hex = [...hex].map((digit) => digit + digit).join('');
  const [red, green, blue] = [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
  return 0.299 * red + 0.587 * green + 0.114 * blue > 140;
}

/** The document follows the state: the theme's colors, the tab title, the Ask selection's change. */
function syncDocument(state: LensState, previous: LensState | null) {
  const { fg, bg, label } = state.data;
  if (!previous || previous.data.fg !== fg || previous.data.bg !== bg) {
    const root = document.documentElement;
    root.style.setProperty('--code-fg', fg);
    root.style.setProperty('--code-bg', bg);
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
// Restore the saved theme choice — unless --theme pinned this run's theme.
const savedTheme = readPref('lens.theme');
if (!data.themePinned && savedTheme && savedTheme !== data.theme) {
  switchTheme(savedTheme).then((switched) => {
    if (!switched) writePref('lens.theme', data.theme); // stale/unknown theme: forget it
  });
}
if (getState().ask.open) askPoll();
createRoot(document.getElementById('root')!).render(<App />);
if (location.hash === '#summary' && data.summary) setView('summary');
