// The UI's size: the whole page zoomed, as a browser's or VS Code's zoom does. Pure: the server writes it
// on the page it sends, the viewer and the desktop app read and set it.

/** In percent: the browser's own steps. */
export const UI_ZOOMS = [80, 90, 100, 110, 125, 150];

export const UI_ZOOM_DEFAULT = 100;

/**
 * A cookie, as the code's size is (codeSize.ts): the server reads it, so the page arrives at its size,
 * and cookies don't keep ports apart, so every repository's viewer opens at it.
 */
export const UI_ZOOM_COOKIE = 'lens-ui-zoom';

/** The zoom a step away, staying within the steps. */
export function steppedZoom(zoom: number, delta: number): number {
  const zoomIndex = UI_ZOOMS.indexOf(zoom);
  if (zoomIndex < 0) return UI_ZOOM_DEFAULT;
  return UI_ZOOMS[Math.max(0, Math.min(UI_ZOOMS.length - 1, zoomIndex + delta))];
}

/** A cookie's value as a zoom: the default when it isn't one of the steps. */
export function parsedZoom(value: string | null | undefined): number {
  const zoom = Number(value);
  return UI_ZOOMS.includes(zoom) ? zoom : UI_ZOOM_DEFAULT;
}

/** The zoom a cookie header holds. */
export function savedZoom(cookies: string): number {
  const match = new RegExp('(?:^|; *)' + UI_ZOOM_COOKIE + '=([0-9]+)').exec(cookies);
  return parsedZoom(match?.[1]);
}

/**
 * What goes in the style of <html>: CSS `zoom`, and `--ui-zoom` for what the zoom gets wrong
 * (viewport units, --screen-w / --screen-h in tokens.css; pointer coordinates, ui/zoom.ts).
 * Nothing at the default.
 */
export function zoomStyle(zoom: number): string {
  if (zoom === UI_ZOOM_DEFAULT || !UI_ZOOMS.includes(zoom)) return '';
  const factor = zoom / 100;
  return `;zoom:${factor};--ui-zoom:${factor}`;
}

/** The same, on a page that is already showing. */
export function applyZoom(root: HTMLElement, zoom: number): void {
  if (zoom === UI_ZOOM_DEFAULT || !UI_ZOOMS.includes(zoom)) {
    root.style.removeProperty('zoom');
    root.style.removeProperty('--ui-zoom');
    return;
  }
  root.style.setProperty('zoom', String(zoom / 100));
  root.style.setProperty('--ui-zoom', String(zoom / 100));
}
