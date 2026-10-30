import {
  createHighlighter,
  bundledThemes,
  bundledLanguages,
  type Highlighter,
  type BundledTheme,
  type BundledLanguage,
} from 'shiki';
import { extname } from 'node:path';

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
  highlighterPromise ??= createHighlighter({
    themes: [],
    langs: ['typescript', 'tsx', 'javascript'],
  });
  return highlighterPromise;
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
  if (!highlighter.getLoadedLanguages().includes(language)) {
    await highlighter.loadLanguage(language as BundledLanguage);
  }
  const { tokens, fg, bg } = highlighter.codeToTokens(source, {
    lang: language as BundledLanguage,
    theme,
  });
  return {
    tokens: tokens.map((line) => line.map((t) => [t.content, t.color ?? null] as ViewerToken)),
    fg: fg ?? loaded.fg,
    bg: bg ?? loaded.bg,
  };
}
