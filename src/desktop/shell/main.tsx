// The tab strip: the window's own page, and its title bar. The tabs' pages are separate views
// the main process lays out under it, so this page is only ever 40px of the window.

import { createRoot } from 'react-dom/client';
import '../../ui/styles/tokens.css';
import '../../ui/styles/base.css';
import { applyTheme } from '../shared/page.ts';
import { motionReady } from '../../ui/motion.ts';
import type { StripState } from '../shared/api.ts';
import { Strip } from './Strip.tsx';
import { useStrip } from './store.ts';

/** A CSS color as #rrggbb, whatever form the browser computed it in (the tokens mix in oklab). */
function hexColor(color: string): string | null {
  const context = document.createElement('canvas').getContext('2d');
  if (!context) return null;
  context.fillStyle = color;
  context.fillRect(0, 0, 1, 1);
  const [red, green, blue] = context.getImageData(0, 0, 1, 1).data;
  return '#' + [red, green, blue].map((part) => part.toString(16).padStart(2, '0')).join('');
}

function show(strip: StripState | null): void {
  if (!strip) return;
  const previous = useStrip.getState().strip;
  const root = document.documentElement;
  root.dataset.platform = strip.platform;
  root.toggleAttribute('data-fullscreen', strip.fullscreen);
  if (previous?.theme.name !== strip.theme.name) {
    applyTheme(strip.theme);
    // the strip's own colors, as the theme mixed them: the main process paints a new tab's
    // background and the window buttons Windows draws in them
    const style = getComputedStyle(document.body);
    const [color, symbolColor] = [hexColor(style.backgroundColor), hexColor(style.color)];
    if (color && symbolColor) window.lensApp.strip.chrome(color, symbolColor);
  }
  useStrip.setState({ strip });
  // the tabs the window opens with are drawn still; a tab opened after widens in
  motionReady();
}

window.lensApp.strip.onState(show);
void window.lensApp.strip.state().then(show);
createRoot(document.getElementById('root')!).render(<Strip />);
