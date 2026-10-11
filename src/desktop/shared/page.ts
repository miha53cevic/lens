// What both of the app's pages do with the code theme: the same as the viewer's main.tsx, so the
// design tokens (src/viewer/styles/tokens.css) mix the chrome from the theme's colors here too.

import { isLightColor } from '../../cli-app/theme.ts';
import type { LensAppApi, ThemeSwatch } from './api.ts';

declare global {
  interface Window {
    lensApp: LensAppApi;
  }
}

/** A plain hex color: the only kind written into a page's markup (a repository's own theme names its colors). */
const HEX_COLOR = /^#[0-9a-f]{3,8}$/i;

/**
 * What applyTheme sets, as attributes for the page's <html> tag: the main process writes them into
 * the page it serves, so its first paint is in the theme (as the viewer's is, `renderPage`).
 * Nothing for a theme whose colors aren't plain ones: the page then takes its theme when it starts.
 */
export function themeAttributes(theme: ThemeSwatch): string {
  if (![theme.fg, theme.bg, theme.accent].every((color) => HEX_COLOR.test(color))) return '';
  const colors = `--code-fg:${theme.fg};--code-bg:${theme.bg};--theme-accent:${theme.accent}`;
  return ` data-appearance="${isLightColor(theme.bg) ? 'light' : 'dark'}" style="${colors}"`;
}

export function applyTheme(theme: ThemeSwatch): void {
  const root = document.documentElement;
  root.style.setProperty('--code-fg', theme.fg);
  root.style.setProperty('--code-bg', theme.bg);
  root.style.setProperty('--theme-accent', theme.accent);
  root.dataset.appearance = isLightColor(theme.bg) ? 'light' : 'dark';
}
