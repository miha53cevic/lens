import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import type { FileFoldModel, LensConfig } from "../../model.ts";
import {
  highlightSource,
  isBundledTheme,
  shikiLangForFile,
  SUGGESTED_THEMES,
  type ViewerToken,
} from "../highlight.ts";

export type ViewerFile = FileFoldModel & { source: string };

export interface ViewerInput {
  threshold: number;
  files: ViewerFile[];
  deleted: string[];
  /** Changed files skipped via exclude patterns — listed, not loaded */
  excluded: string[];
  /** Pure renames — listed, nothing to analyze */
  renamed: { from: string; to: string }[];
  testFilePatterns: string[];
  /** The effective merged config, shown in the viewer's settings modal */
  config: LensConfig;
  configSource: string | null;
}

export interface ViewerOptions {
  port: number;
  open: boolean;
  theme: string;
  /** true when --theme was passed explicitly — the viewer then ignores its saved choice */
  themePinned: boolean;
}

interface ThemeTokens {
  theme: string;
  fg: string;
  bg: string;
  /** tokens[fileIndex] — aligned with the files array */
  tokens: ViewerToken[][][];
}

const templatePath = join(dirname(fileURLToPath(import.meta.url)), "viewer.html");

export async function serveViewer(
  input: ViewerInput,
  opts: ViewerOptions,
  reanalyze?: () => Promise<ViewerInput>,
): Promise<void> {
  let current = input;
  const themeCache = new Map<string, ThemeTokens>();

  async function tokensFor(theme: string): Promise<ThemeTokens> {
    const cached = themeCache.get(theme);
    if (cached) return cached;
    const results = await Promise.all(
      current.files.map((f) =>
        highlightSource(f.source, f.language ?? shikiLangForFile(f.file), theme)),
    );
    const entry: ThemeTokens = {
      theme,
      fg: results[0]?.fg ?? "#ffffff",
      bg: results[0]?.bg ?? "#000000",
      tokens: results.map((r) => r.tokens),
    };
    themeCache.set(theme, entry);
    return entry;
  }

  const themes = SUGGESTED_THEMES.includes(opts.theme)
    ? SUGGESTED_THEMES
    : [opts.theme, ...SUGGESTED_THEMES];

  async function payloadFor(theme: string) {
    const t = await tokensFor(theme);
    return {
      threshold: current.threshold,
      theme,
      themes,
      fg: t.fg,
      bg: t.bg,
      files: current.files.map((f, i) => ({ ...f, tokens: t.tokens[i] })),
      deleted: current.deleted,
      excluded: current.excluded,
      renamed: current.renamed,
      testFilePatterns: current.testFilePatterns,
      config: current.config,
      configSource: current.configSource,
      themePinned: opts.themePinned,
      canRefresh: reanalyze !== undefined,
    };
  }

  // Warm the initial theme before accepting requests.
  await tokensFor(opts.theme);
  const template = readFileSync(templatePath, "utf8");

  // Serialized pages are cached per theme — payloads can be MBs, and
  // stringifying them on every reload is waste. Cleared on refresh.
  const htmlCache = new Map<string, string>();
  async function htmlFor(theme: string): Promise<string> {
    const cached = htmlCache.get(theme);
    if (cached) return cached;
    const data = JSON.stringify(await payloadFor(theme)).replace(/</g, "\\u003c");
    // Function replacement: a plain string would expand $-sequences in the payload.
    const html = template.replace("/*__LENS_DATA__*/ null", () => data);
    htmlCache.set(theme, html);
    return html;
  }

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      const themeParam = url.searchParams.get("theme");
      const theme = themeParam && isBundledTheme(themeParam) ? themeParam : opts.theme;

      if (url.pathname === "/" || url.pathname === "/index.html") {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(await htmlFor(theme));
      } else if (url.pathname === "/api/tokens") {
        if (themeParam && !isBundledTheme(themeParam)) {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: `unknown theme "${themeParam}"` }));
          return;
        }
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(await tokensFor(theme)));
      } else if (url.pathname === "/api/refresh") {
        if (!reanalyze) {
          res.writeHead(404, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "refresh not available" }));
          return;
        }
        current = await reanalyze();
        themeCache.clear();
        htmlCache.clear();
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(await payloadFor(theme)));
      } else {
        res.writeHead(404);
        res.end("not found");
      }
    } catch (err) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: (err as Error).message }));
    }
  });

  server.listen(opts.port, "127.0.0.1", () => {
    const url = `http://127.0.0.1:${opts.port}/`;
    console.log(`lens viewer on ${url}  (ctrl-c to stop)`);
    if (opts.open) {
      const opener = process.platform === "darwin" ? "open"
        : process.platform === "win32" ? "start" : "xdg-open";
      spawn(opener, [url], { stdio: "ignore", detached: true }).unref();
    }
  });
}
