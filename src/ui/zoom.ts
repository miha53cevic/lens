// The page's zoom: CSS `zoom` on <html>, with --ui-zoom beside it (the viewer's UI size, the
// launcher's in the app). What is measured on screen (getBoundingClientRect, a pointer's clientX,
// innerWidth) is in screen px, but a length a script sets (style.left, scrollTop) is zoomed again.
// So a script that turns the one into the other divides by the zoom first.

/** The zoom on <html>: 1 when there is none. */
export function pageZoom(): number {
  const zoom = parseFloat(document.documentElement.style.getPropertyValue('--ui-zoom'));
  return zoom > 0 ? zoom : 1;
}

/** A length measured on screen, as the CSS px to set it with. */
export function cssPx(screenPx: number): number {
  return screenPx / pageZoom();
}
