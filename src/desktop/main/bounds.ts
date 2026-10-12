// Where the window opens. Its last place is kept between runs (store.ts), but the displays may
// have changed since: a monitor unplugged, a smaller screen. No Electron here: the window hands
// in the displays there are now.

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** What the window is created with. Without x and y, the system centers it on the main display. */
export interface Placement {
  x?: number;
  y?: number;
  width: number;
  height: number;
}

export const DEFAULT_SIZE = { width: 1320, height: 880 };
export const MIN_SIZE = { width: 760, height: 480 };

/** How much of the window's top strip a display must show: enough to see it and drag it. */
const GRIP = { width: 120, height: 40 };

/** How much of `rect` lies on `area`, along each axis. */
function overlap(rect: Rect, area: Rect): { width: number; height: number } {
  return {
    width: Math.min(rect.x + rect.width, area.x + area.width) - Math.max(rect.x, area.x),
    height: Math.min(rect.y + rect.height, area.y + area.height) - Math.max(rect.y, area.y),
  };
}

/**
 * The window's place: the saved one while a display still shows its top strip, else its saved size
 * (as far as the main display has room) centered there. `workAreas` are the displays' usable
 * areas, the main display's first.
 */
export function placeWindow(saved: Rect | null, workAreas: Rect[]): Placement {
  if (!saved) return { ...DEFAULT_SIZE };
  const width = Math.max(MIN_SIZE.width, Math.round(saved.width));
  const height = Math.max(MIN_SIZE.height, Math.round(saved.height));
  const x = Math.round(saved.x);
  const y = Math.round(saved.y);
  const strip = { x, y, width, height: GRIP.height };
  const inSight = workAreas.some((area) => {
    const shown = overlap(strip, area);
    return shown.width >= GRIP.width && shown.height >= GRIP.height;
  });
  if (inSight) return { x, y, width, height };
  const main = workAreas[0];
  return main ? { width: Math.min(width, main.width), height: Math.min(height, main.height) } : { width, height };
}
