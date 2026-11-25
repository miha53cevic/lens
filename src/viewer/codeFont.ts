// The code's font: a font list the reader types, kept in a cookie as the code's size is
// (codeSize.ts), so every repository's viewer shows it.

export const CODE_FONT_COOKIE = 'lens-code-font';

/** Longer than any font list a reader types; the cookie stays small */
export const CODE_FONT_MAX = 200;

/**
 * A typed font list as lens uses it: '' (the default) when it holds anything but names, quotes and
 * commas, so nothing typed reaches the page's CSS as more than a font-family.
 */
export function cleanCodeFont(typed: string): string {
  const font = typed.trim().replace(/^[,\s]+|[,\s]+$/g, '');
  if (font.length > CODE_FONT_MAX || !/^[\p{L}\p{N}\s,'"_.-]*$/u.test(font)) return '';
  // a quote still open (mid-typing 'Fira Code) is no font-family yet
  if (font.split("'").length % 2 === 0 || font.split('"').length % 2 === 0) return '';
  return font;
}

/** What --font-code holds: the reader's fonts, then the default stack for a name not installed. */
export function codeFontValue(font: string): string {
  return font + ', var(--font-mono)';
}

/** What the reader typed, as a cookie header holds it ('' when none): cleanCodeFont decides what of it is used. */
export function savedCodeFont(cookies: string): string {
  const match = new RegExp('(?:^|; *)' + CODE_FONT_COOKIE + '=([^;]*)').exec(cookies);
  if (!match) return '';
  try {
    return decodeURIComponent(match[1]).slice(0, CODE_FONT_MAX);
  } catch {
    return '';
  }
}

/** Families every browser has: never "not installed" */
const GENERIC = new Set(['monospace', 'ui-monospace', 'serif', 'sans-serif', 'ui-serif', 'ui-sans-serif', 'system-ui']);

/** The names of a usable font list (cleanCodeFont's), without their quotes. */
export function fontNames(font: string): string[] {
  return font
    .split(',')
    .map((name) => name.trim().replace(/^['"]|['"]$/g, ''))
    .filter((name) => name !== '');
}

export interface FontShown {
  /** The first of the reader's fonts this machine has; null: none, the default shows */
  shown: string | null;
  /** The names before it that aren't installed */
  missing: string[];
}

/** Which of the reader's fonts the code shows in; null when `installed` can't tell. */
export function fontShown(font: string, installed: (name: string) => boolean | null): FontShown | null {
  const missing: string[] = [];
  for (const name of fontNames(font)) {
    const has = GENERIC.has(name.toLowerCase()) || installed(name);
    if (has === null) return null;
    if (has) return { shown: name, missing };
    missing.push(name);
  }
  return { shown: null, missing };
}

const installedCache = new Map<string, boolean | null>();

/**
 * Whether this machine has a font, by text drawn in it before two fallbacks: a missing font draws
 * as the fallback does. Browsers keep the list of installed fonts to themselves; this is what's left.
 * null when there's no canvas to draw on.
 */
export function isFontInstalled(name: string): boolean | null {
  const cached = installedCache.get(name);
  if (cached !== undefined) return cached;
  const context = document.createElement('canvas').getContext('2d');
  let installed: boolean | null = null;
  if (context) {
    const sample = 'mmmmmmmmmmlli10O@#WwQq';
    const width = (family: string) => {
      context.font = '72px ' + family;
      return context.measureText(sample).width;
    };
    const quoted = '"' + name.replace(/"/g, '') + '"';
    installed = ['monospace', 'serif'].some((fallback) => width(quoted + ', ' + fallback) !== width(fallback));
  }
  installedCache.set(name, installed);
  return installed;
}

/** Which font the code shows in, as typed: a font missing from this machine falls through to the next. */
export function codeFontHint(typed: string, installed = isFontInstalled): string {
  const fallback = 'font names, comma-separated';
  if (typed.trim() === '') return fallback;
  const font = cleanCodeFont(typed);
  if (font === '') return 'not a font list yet · the default shows';
  const result = fontShown(font, installed);
  if (!result) return fallback;
  const missing = result.missing.length > 0 ? result.missing.join(', ') + ' not installed · ' : '';
  return missing + (result.shown ? 'showing ' + result.shown : 'the default shows');
}
