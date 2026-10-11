// What both of the app's pages do with the code theme: the same as the viewer's main.tsx, so the
// design tokens (src/viewer/styles/tokens.css) mix the chrome from the theme's colors here too.

import { isLightColor } from '../../cli-app/theme.ts';
import type { LensAppApi, ThemeSwatch } from './api.ts';

declare global {
  interface Window {
    lensApp: LensAppApi;
  }
}

export function applyTheme(theme: ThemeSwatch): void {
  const root = document.documentElement;
  root.style.setProperty('--code-fg', theme.fg);
  root.style.setProperty('--code-bg', theme.bg);
  root.style.setProperty('--theme-accent', theme.accent);
  root.dataset.appearance = isLightColor(theme.bg) ? 'light' : 'dark';
}
