// What both of the app's pages do with the code theme: the same as the viewer's main.tsx, so the
// design tokens (src/ui/styles/tokens.css) mix the chrome from the theme's colors here too.

import { chromeColorProperties } from '../../cli-app/render/themeColors.ts';
import { isLightColor } from '../../cli-app/theme.ts';
import { UI_ZOOM_DEFAULT, zoomStyle } from '../../cli-app/zoom.ts';
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
 * `zoom` is the UI's size, for the launcher's page (`zoomStyle` writes only numbers it knows).
 */
export function themeAttributes(theme: ThemeSwatch, zoom = UI_ZOOM_DEFAULT): string {
  if (![theme.fg, theme.bg, theme.accent].every((color) => HEX_COLOR.test(color))) return '';
  const chrome = chromeProperties(theme)
    .map(([name, color]) => `;${name}:${color}`)
    .join('');
  const colors = `--code-fg:${theme.fg};--code-bg:${theme.bg};--theme-accent:${theme.accent}${chrome}${zoomStyle(zoom)}`;
  return ` data-appearance="${isLightColor(theme.bg) ? 'light' : 'dark'}" style="${colors}"`;
}

export function applyTheme(theme: ThemeSwatch): void {
  const root = document.documentElement;
  root.style.setProperty('--code-fg', theme.fg);
  root.style.setProperty('--code-bg', theme.bg);
  root.style.setProperty('--theme-accent', theme.accent);
  for (const [name] of chromeColorProperties(null)) root.style.removeProperty(name);
  for (const [name, color] of chromeProperties(theme)) root.style.setProperty(name, color);
  root.dataset.appearance = isLightColor(theme.bg) ? 'light' : 'dark';
}

/** The theme's chrome colors the page takes: only plain hex ones, as for its other colors. */
function chromeProperties(theme: ThemeSwatch): [string, string][] {
  return chromeColorProperties(theme.chrome ?? null).flatMap(([name, color]) =>
    color && HEX_COLOR.test(color) ? [[name, color] as [string, string]] : [],
  );
}
