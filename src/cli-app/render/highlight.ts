import { extname } from 'node:path';
import type { Highlighter, BundledLanguage, BundledTheme, GrammarState, ThemedToken, ThemeRegistration } from 'shiki';
// the lists alone: Shiki's engine (~40 ms to load) is imported once something is tokenized, so a
// command that only names themes (`lens info`) doesn't wait for it
import { bundledThemes } from 'shiki/themes';
import { bundledLanguages } from 'shiki/langs';
import andromedaItalic from './themes/andromeda-italic.json' with { type: 'json' };
import { isLightColor } from '../theme.ts';
import { CHROME_KEYS, type ChromeColors, type ChromeToken, type DiffColors } from './themeColors.ts';

// One token as shipped to the viewer: [text, color, style]. Color is a hex string or null for the
// theme's default foreground; style, only when the theme gives one, is Shiki's FontStyle bits
// (fontStyle.ts).
export type ViewerToken = [string, string | null, number?];

/**
 * Themes lens ships itself, beside Shiki's: VS Code theme files, by the name lens knows them by.
 * Each one's license is next to it in themes/.
 */
const LENS_THEMES: Record<string, ThemeRegistration> = {
  'andromeda-italic': { ...(andromedaItalic as ThemeRegistration), name: 'andromeda-italic' },
};

// Shown in the viewer's theme dropdown; any bundled Shiki theme also works
// via --theme or .lens.json (https://shiki.style/themes).
export const SUGGESTED_THEMES = ['andromeda-italic', 'github-dark', 'github-light', 'monokai'];

/** A theme lens can show: one of its own, or one Shiki bundles. */
export function isBundledTheme(name: string): boolean {
  return Object.hasOwn(LENS_THEMES, name) || Object.hasOwn(bundledThemes, name);
}

export interface HighlightResult {
  tokens: ViewerToken[][];
  /** The theme's default foreground/background, for the viewer's code pane */
  fg: string;
  bg: string;
}

let highlighterPromise: Promise<Highlighter> | null = null;

function getHighlighter(): Promise<Highlighter> {
  highlighterPromise ??= import('shiki').then(({ createHighlighter }) =>
    createHighlighter({ themes: [], langs: ['typescript', 'tsx', 'javascript'] }),
  );
  return highlighterPromise;
}

/** The languages loaded with all they may embed */
const complete = new Set<string>(['typescript', 'tsx', 'javascript']);

/**
 * The language, and every language it may embed, at any depth. Shiki colors an embedded block (a
 * markdown fence of bash) only when that language is loaded already, so without them a file's
 * colors would hang on what this process highlighted before it, and differ between threads.
 */
async function loadLanguage(highlighter: Highlighter, language: BundledLanguage): Promise<void> {
  if (complete.has(language)) return;
  const wanted = new Set<BundledLanguage>();
  const visit = async (name: string) => {
    if (!(name in bundledLanguages) || wanted.has(name as BundledLanguage)) return;
    wanted.add(name as BundledLanguage);
    for (const grammar of (await bundledLanguages[name as BundledLanguage]()).default) {
      for (const embedded of [...(grammar.embeddedLangs ?? []), ...(grammar.embeddedLangsLazy ?? [])]) {
        await visit(embedded);
      }
    }
  };
  await visit(language);
  await highlighter.loadLanguage(...wanted);
  for (const name of wanted) complete.add(name);
}

/** The highlighter with `theme` loaded into it, and that theme. */
async function withTheme(theme: string) {
  if (!isBundledTheme(theme)) {
    throw new Error(`unknown theme "${theme}" — pick a Shiki theme name (https://shiki.style/themes)`);
  }
  const highlighter = await getHighlighter();
  if (!highlighter.getLoadedThemes().includes(theme)) {
    await highlighter.loadTheme(Object.hasOwn(LENS_THEMES, theme) ? LENS_THEMES[theme] : (theme as BundledTheme));
  }
  return { highlighter, loaded: highlighter.getTheme(theme) };
}

/**
 * Best-effort Shiki language for files lens can't classify — diff mode still
 * shows them, and this gets them syntax colors when Shiki knows the language.
 */
export function shikiLangForFile(file: string): string | null {
  const ext = extname(file).toLowerCase().slice(1);
  const byExtension: Record<string, string> = {
    json: 'json',
    jsonc: 'jsonc',
    md: 'markdown',
    mdx: 'mdx',
    yml: 'yaml',
    yaml: 'yaml',
    toml: 'toml',
    xml: 'xml',
    css: 'css',
    scss: 'scss',
    less: 'less',
    html: 'html',
    vue: 'vue',
    svelte: 'svelte',
    sh: 'shellscript',
    bash: 'shellscript',
    zsh: 'shellscript',
    sql: 'sql',
    graphql: 'graphql',
    gql: 'graphql',
    prisma: 'prisma',
    py: 'python',
    rb: 'ruby',
    go: 'go',
    rs: 'rust',
    java: 'java',
    php: 'php',
  };
  return byExtension[ext] ?? null;
}

/** The scopes whose color the viewer takes as its accent, best first. */
const ACCENT_SCOPES = ['entity.name.function', 'support.function', 'entity.name.type', 'keyword'];

/**
 * The theme's accent for the viewer's chrome: the color it gives function names, so the
 * buttons and highlights belong to the theme. Falls back to the theme's foreground.
 */
export async function themeAccent(theme: string): Promise<string> {
  const { loaded } = await withTheme(theme);
  for (const wanted of ACCENT_SCOPES) {
    // as TextMate matches: a rule's scope covers the scopes under it ("entity.name" colors
    // "entity.name.function"), and the most specific rule wins
    let best: { length: number; color: string } | null = null;
    for (const rule of loaded.settings) {
      const color = rule.settings?.foreground;
      if (!color) continue;
      const scopes = typeof rule.scope === 'string' ? rule.scope.split(',') : (rule.scope ?? []);
      for (const scope of scopes.map((candidate) => candidate.trim())) {
        const covers = wanted === scope || wanted.startsWith(scope + '.');
        if (covers && !scope.includes(' ') && (!best || scope.length > best.length)) {
          best = { length: scope.length, color };
        }
      }
    }
    if (best) return best.color;
  }
  return loaded.fg;
}

/**
 * The colors the theme gives VS Code's diff (`diffEditor.*`); null when it sets none, and VS Code's
 * defaults show.
 */
export async function themeDiffColors(theme: string): Promise<DiffColors | null> {
  const { loaded } = await withTheme(theme);
  const color = (key: string) => withAlpha(loaded.colors?.[`diffEditor.${key}Background`]);
  const diff: DiffColors = {
    addText: color('insertedText'),
    delText: color('removedText'),
    addLine: color('insertedLine'),
    delLine: color('removedLine'),
  };
  return Object.values(diff).some((value) => value !== null) ? diff : null;
}

/** The surfaces: one the same as the code would hide what it marks (Andromeda's selection is its editor's background). */
const SURFACES: ChromeToken[] = ['bg', 'raised', 'selected-bg', 'hover-bg'];

/**
 * The colors the theme gives VS Code's workbench, for lens's chrome (`CHROME_KEYS`); null when it sets
 * none lens can use, and lens's own mixes show. A surface the same as the code's background, a line that
 * doesn't stand out from it, and a grey focus ring are left to lens.
 */
export async function themeChromeColors(theme: string): Promise<ChromeColors | null> {
  const { loaded } = await withTheme(theme);
  const codeBg = withAlpha(loaded.bg);
  const chrome = {} as ChromeColors;
  for (const [token, key] of Object.entries(CHROME_KEYS) as [ChromeToken, string][]) {
    const color = withAlpha(loaded.colors?.[key]);
    const hidden = SURFACES.includes(token) && color !== null && codeBg !== null && sameColor(color, codeBg);
    const grey = token === 'focus' && color !== null && saturation(color) < 0.3;
    const sunk = token === 'line' && color !== null && codeBg !== null && !standsOut(color, codeBg);
    chrome[token] = hidden || grey || sunk ? null : color;
  }
  return Object.values(chrome).some((value) => value !== null) ? chrome : null;
}

/**
 * Whether a line stands out on lens's page, which is the code's background taken further from the text
 * (darker on a dark theme): only when the line goes the other way, toward the text. A VS Code border can
 * go either way, since its panels are lighter than it (Andromeda's and GitHub Dark's are darker than their code).
 */
function standsOut(line: string, codeBg: string): boolean {
  const brightness = (color: string) => {
    const [red, green, blue] = channels(color);
    return 0.299 * red + 0.587 * green + 0.114 * blue;
  };
  const towardText = isLightColor(codeBg)
    ? brightness(codeBg) - brightness(line)
    : brightness(line) - brightness(codeBg);
  return towardText >= 8;
}

/** Two `#rrggbbaa` colors' red, green and blue, as 0–255 */
function channels(color: string): number[] {
  return [1, 3, 5].map((offset) => parseInt(color.slice(offset, offset + 2), 16));
}

/** Whether two `#rrggbbaa` colors look the same, alpha aside */
function sameColor(a: string, b: string): boolean {
  const [ca, cb] = [channels(a), channels(b)];
  return ca.every((value, index) => Math.abs(value - cb[index]) <= 4);
}

/** A `#rrggbbaa` color's HSL saturation, 0–1 */
function saturation(color: string): number {
  const [red, green, blue] = channels(color).map((value) => value / 255);
  const [max, min] = [Math.max(red, green, blue), Math.min(red, green, blue)];
  return max === min ? 0 : (max - min) / (1 - Math.abs(max + min - 1));
}

/** `#rgb`, `#rgba`, `#rrggbb` or `#rrggbbaa` as `#rrggbbaa`; null for anything else. */
function withAlpha(color: string | undefined): string | null {
  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(color ?? '')?.[1];
  if (!hex) return null;
  const full = hex.length <= 4 ? [...hex].map((digit) => digit + digit).join('') : hex;
  return '#' + (full.length === 6 ? full + 'ff' : full).toLowerCase();
}

/** A theme as the theme menus show it and the app's pages paint it: its name, its colors and its accent. */
export interface ThemeSwatch {
  name: string;
  bg: string;
  fg: string;
  accent: string;
  /** The chrome's colors from the theme's workbench ones; null: lens's own */
  chrome: ChromeColors | null;
}

export async function themeSwatch(theme: string): Promise<ThemeSwatch> {
  const [accent, chrome] = await Promise.all([themeAccent(theme), themeChromeColors(theme)]);
  const { loaded } = await withTheme(theme);
  return { name: theme, bg: loaded.bg, fg: loaded.fg, accent, chrome };
}

/**
 * Tokenizes source for the web viewer. Returns one array per source line;
 * concatenating a line's token texts reproduces that line exactly.
 * An unknown/null language yields plain (uncolored) line-aligned tokens.
 */
export async function highlightSource(
  source: string,
  language: string | null,
  theme: string,
): Promise<HighlightResult> {
  const { highlighter, loaded } = await withTheme(theme);

  if (language === null || !(language in bundledLanguages)) {
    return {
      tokens: source.split('\n').map((line) => [[line, null] as ViewerToken]),
      fg: loaded.fg,
      bg: loaded.bg,
    };
  }
  await loadLanguage(highlighter, language as BundledLanguage);
  const { tokens, fg, bg } = highlighter.codeToTokens(source, {
    lang: language as BundledLanguage,
    theme,
  });
  return {
    tokens: toViewerTokens(tokens),
    fg: fg ?? loaded.fg,
    bg: bg ?? loaded.bg,
  };
}

/**
 * A file's old side, as `highlightSides` takes it: its text, and for each of its lines (0-based)
 * the new side's line that is the same line of the file, or null for a removed line.
 */
export interface OldSide {
  text: string;
  keptAt: (number | null)[];
}

export interface SidesResult extends HighlightResult {
  /** The old side's tokens by line: every removed line's, and the other lines' only where they were needed */
  oldTokens: ViewerToken[][] | null;
}

/**
 * Both sides of a changed file, each tokenized as `highlightSource` tokenizes a whole text, but the
 * old side's kept lines mostly not at all. A TextMate grammar tokenizes a line from the state the
 * line before left: the same line from the same state gives the same tokens and the same state
 * after. So where the old side reaches a run of kept lines in the state the new side reached it in,
 * the run is skipped and the new side's state after it taken over. Only where a removed line left
 * another state (a comment or a string it opened) is the run tokenized again on the old side.
 */
export async function highlightSides(
  source: string,
  language: string | null,
  theme: string,
  old: OldSide | null,
): Promise<SidesResult> {
  if (old === null) return { ...(await highlightSource(source, language, theme)), oldTokens: null };
  if (language === null || !(language in bundledLanguages)) {
    const [result, before] = await Promise.all([
      highlightSource(source, language, theme),
      highlightSource(old.text, language, theme),
    ]);
    return { ...result, oldTokens: before.tokens };
  }
  const { highlighter, loaded } = await withTheme(theme);
  const lang = language as BundledLanguage;
  await loadLanguage(highlighter, lang);
  let colors: { fg?: string; bg?: string } = {};
  const tokenize = (lines: string[], grammarState: GrammarState | undefined) => {
    const result = highlighter.codeToTokens(lines.join('\n'), { lang, theme, grammarState });
    colors = result;
    return { tokens: toViewerTokens(result.tokens), state: result.grammarState };
  };

  // the lines as Shiki splits a text: a CRLF's \r isn't the line's
  const newLines = source.split(/\r?\n/);
  const oldLines = old.text.split(/\r?\n/);
  // the old side in runs: removed lines, and kept lines that follow each other on the new side too
  const runs: { from: number; to: number; at: number | null }[] = [];
  oldLines.forEach((text, index) => {
    const kept = old.keptAt[index] ?? null;
    // a kept line is only skipped when it is the very same text
    const at = kept !== null && newLines[kept] === text ? kept : null;
    const last = runs[runs.length - 1];
    const extends_ = last && (at === null ? last.at === null : last.at !== null && last.at + index - last.from === at);
    if (extends_) last.to = index + 1;
    else runs.push({ from: index, to: index + 1, at });
  });

  // the new side, tokenized in parts cut where a kept run starts and ends, so its state is known there
  const cuts = new Set<number>();
  for (const run of runs) {
    if (run.at !== null) cuts.add(run.at).add(run.at + run.to - run.from);
  }
  const ends = [...cuts].filter((cut) => cut > 0 && cut < newLines.length).sort((a, b) => a - b);
  ends.push(newLines.length);
  /** the state before each new line that is a cut: undefined before the first, as a whole text starts */
  const stateAt = new Map<number, GrammarState | undefined>([[0, undefined]]);
  const tokens: ViewerToken[][] = [];
  let state: GrammarState | undefined;
  let start = 0;
  for (const end of ends) {
    const part = tokenize(newLines.slice(start, end), state);
    for (const line of part.tokens) tokens.push(line);
    state = part.state;
    stateAt.set(end, state);
    start = end;
  }
  const { fg, bg } = colors;

  const oldTokens: ViewerToken[][] = new Array(oldLines.length);
  let oldState: GrammarState | undefined;
  for (const run of runs) {
    if (run.at !== null && sameState(oldState, stateAt.get(run.at))) {
      oldState = stateAt.get(run.at + run.to - run.from);
      continue;
    }
    const part = tokenize(oldLines.slice(run.from, run.to), oldState);
    part.tokens.forEach((line, index) => (oldTokens[run.from + index] = line));
    oldState = part.state;
  }
  return { tokens, fg: fg ?? loaded.fg, bg: bg ?? loaded.bg, oldTokens };
}

/** Undefined is the state a text starts in: two are the same only both there, or by the grammar's own test. */
function sameState(a: GrammarState | undefined, b: GrammarState | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  const stackA = a.getInternalStack();
  const stackB = b.getInternalStack();
  return !!stackA && !!stackB && stackA.equals(stackB);
}

function toViewerTokens(tokens: ThemedToken[][]): ViewerToken[][] {
  // no style (0) or none set (-1) leaves it out: most tokens have none, and the payload stays small
  return tokens.map((line) =>
    line.map((token): ViewerToken =>
      token.fontStyle && token.fontStyle > 0
        ? [token.content, token.color ?? null, token.fontStyle]
        : [token.content, token.color ?? null],
    ),
  );
}
