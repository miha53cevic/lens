import { extname } from 'node:path';
import type { Highlighter, BundledTheme, BundledLanguage, GrammarState, ThemedToken } from 'shiki';
// the lists alone: Shiki's engine (~40 ms to load) is imported once something is tokenized, so a
// command that only names themes (`lens info`) doesn't wait for it
import { bundledThemes } from 'shiki/themes';
import { bundledLanguages } from 'shiki/langs';

// One token as shipped to the viewer: [text, color]. Color is a hex string or
// null for the theme's default foreground.
export type ViewerToken = [string, string | null];

// Shown in the viewer's theme dropdown; any bundled Shiki theme also works
// via --theme or .lens.json (https://shiki.style/themes).
export const SUGGESTED_THEMES = [
  'vesper',
  'github-dark',
  'github-light',
  'one-dark-pro',
  'dracula',
  'nord',
  'catppuccin-mocha',
  'solarized-light',
  'monokai',
  'min-light',
];

export function isBundledTheme(name: string): name is BundledTheme {
  return Object.hasOwn(bundledThemes, name);
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
    await highlighter.loadTheme(theme);
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

/** A theme as the viewer's theme menu shows it: its name, its colors and its accent. */
export interface ThemeSwatch {
  name: string;
  bg: string;
  fg: string;
  accent: string;
}

export async function themeSwatch(theme: string): Promise<ThemeSwatch> {
  const accent = await themeAccent(theme);
  const { loaded } = await withTheme(theme);
  return { name: theme, bg: loaded.bg, fg: loaded.fg, accent };
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
  return tokens.map((line) => line.map((token) => [token.content, token.color ?? null] as ViewerToken));
}
