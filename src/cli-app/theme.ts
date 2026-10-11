// What the server and the viewer share about the code theme. Pure: the viewer bundles this file too.

/**
 * The cookie that holds the theme the reader picked. A cookie rather than localStorage,
 * because the server reads it: the page then arrives in that theme instead of switching to it.
 */
export const THEME_COOKIE = "lens-theme";

/** Whether a theme's background is light: the page then takes the light set of the fixed colors (diff, signals). */
export function isLightColor(color: string): boolean {
  // longest-first: themes report #rgb, #rgba, #rrggbb, or #rrggbbaa
  const hexMatch = /^#([0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{4}|[0-9a-f]{3})$/i.exec((color || "").trim());
  if (!hexMatch) return false;
  let hex = hexMatch[1];
  if (hex.length <= 4) hex = [...hex].map((digit) => digit + digit).join("");
  const [red, green, blue] = [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
  return 0.299 * red + 0.587 * green + 0.114 * blue > 140;
}
