import {
  createHighlighter,
  bundledThemes,
  bundledLanguages,
  type Highlighter,
  type BundledTheme,
  type BundledLanguage,
} from "shiki";
import { extname } from "node:path";

// One token as shipped to the viewer: [text, color]. Color is a hex string or
// null for the theme's default foreground.
export type ViewerToken = [string, string | null];

// Shown in the viewer's theme dropdown; any bundled Shiki theme also works
// via --theme or .lens.json (https://shiki.style/themes).
export const SUGGESTED_THEMES = [
  "vesper",
  "github-dark",
  "github-light",
  "one-dark-pro",
  "dracula",
  "nord",
  "catppuccin-mocha",
  "solarized-light",
  "monokai",
  "min-light",
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
    langs: ["typescript", "tsx", "javascript"],
  });
  return highlighterPromise;
}

/**
 * Best-effort Shiki language for files lens can't classify — diff mode still
 * shows them, and this gets them syntax colors when Shiki knows the language.
 */
export function shikiLangForFile(file: string): string | null {
  const ext = extname(file).toLowerCase().slice(1);
  const byExtension: Record<string, string> = {
    json: "json", jsonc: "jsonc", md: "markdown", mdx: "mdx",
    yml: "yaml", yaml: "yaml", toml: "toml", xml: "xml",
    css: "css", scss: "scss", less: "less", html: "html", vue: "vue", svelte: "svelte",
    sh: "shellscript", bash: "shellscript", zsh: "shellscript",
    sql: "sql", graphql: "graphql", gql: "graphql", prisma: "prisma",
    py: "python", rb: "ruby", go: "go", rs: "rust", java: "java", php: "php",
  };
  return byExtension[ext] ?? null;
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
  if (!isBundledTheme(theme)) {
    throw new Error(`unknown theme "${theme}" — pick a Shiki theme name (https://shiki.style/themes)`);
  }
  const highlighter = await getHighlighter();
  if (!highlighter.getLoadedThemes().includes(theme)) {
    await highlighter.loadTheme(theme);
  }
  const loaded = highlighter.getTheme(theme);

  if (language === null || !(language in bundledLanguages)) {
    return {
      tokens: source.split("\n").map((line) => [[line, null] as ViewerToken]),
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
