import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import type { FileFoldModel, LensConfig } from "../../model.ts";
import type { SummaryView } from "../../summary/view.ts";
import { removeServerInfo, writeServerInfo } from "../../ask/discovery.ts";
import { createAskRoutes } from "../../ask/routes.ts";
import { isLocalRequest, readCookie, sendJson } from "./http.ts";
import { escapeHtml } from "../../text.ts";
import { isLightColor, THEME_COOKIE } from "../../theme.ts";
import { bundleViewer } from "./bundle.ts";
import {
  highlightSource,
  themeSwatch,
  type ThemeSwatch,
  isBundledTheme,
  shikiLangForFile,
  SUGGESTED_THEMES,
  type ViewerToken,
} from "../highlight.ts";

export type ViewerFile = FileFoldModel & {
  source: string;
  /** The new side's git blob when that's what's shown (PR, ref ranges) — the working tree may differ */
  blob?: string;
};

export interface ViewerInput {
  /** Repo root in diff/PR mode, else where lens runs: .lens/ lives here */
  root: string;
  /** Where lens runs: file paths are relative to it */
  cwd: string;
  threshold: number;
  files: ViewerFile[];
  deleted: string[];
  /** Changed files skipped via exclude patterns — listed, not loaded */
  excluded: string[];
  /** Pure renames — listed, nothing to analyze */
  renamed: { from: string; to: string }[];
  /** The effective merged config, shown in the viewer's settings modal */
  config: LensConfig;
  configSource: string | null;
  /** PR mode: "owner/repo#N — title", shown in the viewer header */
  label: string | null;
  /** Diff/PR mode: data for the Summary tab */
  summary: SummaryView | null;
  /** The summary as stored now: the same object until a submit changes summary.json */
  latestSummary: (() => SummaryView) | null;
}

export interface ViewerOptions {
  port: number;
  open: boolean;
  /** Open the browser on the Summary tab instead of the code view */
  openSummary?: boolean;
  theme: string;
  /** true when --theme was passed explicitly — the viewer then ignores its saved choice */
  themePinned: boolean;
}

/** What the page gets as DATA (client/shared.ts): ViewerInput made serializable, plus one theme's tokens. */
export type ViewerPayload = Omit<ViewerInput, "root" | "cwd" | "files" | "latestSummary"> & {
  theme: string;
  /** The theme menu's themes, each with its colors */
  themes: ThemeSwatch[];
  fg: string;
  bg: string;
  /** The theme's function-name color: the viewer's accent */
  accent: string;
  files: (ViewerFile & { tokens: ViewerToken[][] })[];
  themePinned: boolean;
  canRefresh: boolean;
};

export interface ThemeTokens {
  theme: string;
  fg: string;
  bg: string;
  accent: string;
  /** tokens[fileIndex] — aligned with the files array */
  tokens: ViewerToken[][][];
}

/** Every file's Shiki tokens in one theme. */
export async function highlightFiles(files: ViewerFile[], theme: string): Promise<ThemeTokens> {
  const results = await Promise.all(
    files.map((f) => highlightSource(f.source, f.language ?? shikiLangForFile(f.file), theme)),
  );
  // the theme's own colors, not a file's: with no files, the page still follows the theme
  const swatch = await themeSwatch(theme);
  return {
    theme,
    accent: swatch.accent,
    fg: results[0]?.fg ?? swatch.fg,
    bg: results[0]?.bg ?? swatch.bg,
    tokens: results.map((r) => r.tokens),
  };
}

/** The page's payload: the analysis, made serializable, with one theme's tokens. */
export function viewerPayload(
  input: ViewerInput, t: ThemeTokens, themes: ThemeSwatch[], opts: { themePinned: boolean; canRefresh: boolean },
): ViewerPayload {
  const { root: _root, cwd: _cwd, latestSummary: _latest, ...data } = input;
  return {
    ...data,
    theme: t.theme,
    themes,
    fg: t.fg,
    bg: t.bg,
    accent: t.accent,
    files: input.files.map((f, i) => ({ ...f, tokens: t.tokens[i] })),
    ...opts,
  };
}

/**
 * The page for a payload. The theme's colors go on the <html> element too (as main.tsx sets them),
 * so the page's first paint, before its script has run, is already in the theme.
 */
export function renderPage(template: string, payload: ViewerPayload): string {
  const colors = `--code-fg:${payload.fg};--code-bg:${payload.bg};--theme-accent:${payload.accent}`;
  const root = ` data-appearance="${isLightColor(payload.bg) ? "light" : "dark"}" style="${escapeHtml(colors)}"`;
  const data = JSON.stringify(payload).replace(/</g, "\\u003c");
  // Function replacements: plain strings would expand $-sequences in the payload.
  return template.replace("/*__LENS_ROOT__*/", () => root).replace("/*__LENS_DATA__*/", () => data);
}

const webDir = dirname(fileURLToPath(import.meta.url));

/** viewer.html with the bundled viewer's stylesheet and script inlined: one self-contained page. */
async function loadTemplate(): Promise<string> {
  const { script, css } = await bundleViewer();
  // Function replacements: plain strings would expand $-sequences in the code.
  return readFileSync(join(webDir, "viewer.html"), "utf8")
    .replace("/*__LENS_CSS__*/", () => css)
    .replace("/*__LENS_JS__*/", () => script);
}

export async function serveViewer(
  input: ViewerInput,
  opts: ViewerOptions,
  reanalyze?: () => Promise<ViewerInput>,
): Promise<void> {
  let current = input;
  const ask = createAskRoutes(() => current, opts.port);
  // the root of the analysis that wrote server.json — a refresh can't move it
  const infoRoot = input.root;
  const stop = () => {
    removeServerInfo(infoRoot);
    process.exit(0);
  };

  // Caches keyed by what they were made from: a ↻ refresh (new files) or a newer summary
  // (a new ViewerInput) starts fresh ones, and work that was under way fills the old ones.
  const tokenCache = new WeakMap<ViewerFile[], Map<string, ThemeTokens>>();
  // pages are cached per theme: payloads can be MBs, and stringifying them on every reload is waste
  const htmlCache = new WeakMap<ViewerInput, Map<string, string>>();
  const cacheFor = <K extends object, V>(caches: WeakMap<K, Map<string, V>>, key: K) => {
    let cache = caches.get(key);
    if (!cache) caches.set(key, (cache = new Map()));
    return cache;
  };

  async function tokensFor(files: ViewerFile[], theme: string): Promise<ThemeTokens> {
    const cache = cacheFor(tokenCache, files);
    const cached = cache.get(theme);
    if (cached) return cached;
    const entry = await highlightFiles(files, theme);
    cache.set(theme, entry);
    return entry;
  }

  const themes = await Promise.all(
    (SUGGESTED_THEMES.includes(opts.theme) ? SUGGESTED_THEMES : [opts.theme, ...SUGGESTED_THEMES]).map(themeSwatch),
  );

  async function payloadFor(input: ViewerInput, theme: string): Promise<ViewerPayload> {
    const t = await tokensFor(input.files, theme);
    return viewerPayload(input, t, themes, { themePinned: opts.themePinned, canRefresh: reanalyze !== undefined });
  }

  // Warm the initial theme before accepting requests.
  await tokensFor(current.files, opts.theme);
  const template = await loadTemplate();

  /** A submit since the summary was read: take the new one (the units stay those of the last analysis). */
  function syncSummary(): void {
    const summary = current.latestSummary?.() ?? null;
    if (summary !== current.summary) current = { ...current, summary };
  }

  async function htmlFor(theme: string): Promise<string> {
    // the page opens with the summary as it is now, not as it was when the server started
    syncSummary();
    const input = current;
    const cache = cacheFor(htmlCache, input);
    const cached = cache.get(theme);
    if (cached) return cached;
    const html = renderPage(template, await payloadFor(input, theme));
    cache.set(theme, html);
    return html;
  }

  const server = createServer(async (req, res) => {
    try {
      if (!isLocalRequest(req, opts.port)) {
        sendJson(res, 403, { error: "lens only answers its own viewer page" });
        return;
      }
      const url = new URL(req.url ?? "/", "http://localhost");
      const themeParam = url.searchParams.get("theme");
      const theme = themeParam && isBundledTheme(themeParam) ? themeParam : opts.theme;

      if (url.pathname === "/" || url.pathname === "/index.html") {
        // the theme the reader picked (the viewer keeps it in a cookie), unless --theme pinned this run's
        const picked = themeParam || opts.themePinned ? null : readCookie(req, THEME_COOKIE);
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(await htmlFor(picked && isBundledTheme(picked) ? picked : theme));
      } else if (url.pathname === "/api/tokens") {
        if (themeParam && !isBundledTheme(themeParam)) {
          sendJson(res, 400, { error: `unknown theme "${themeParam}"` });
          return;
        }
        sendJson(res, 200, await tokensFor(current.files, theme));
      } else if (url.pathname === "/api/refresh") {
        if (!reanalyze) {
          sendJson(res, 404, { error: "refresh not available" });
          return;
        }
        current = await reanalyze();
        ask.refresh();
        sendJson(res, 200, await payloadFor(current, theme));
      } else if (url.pathname === "/api/summary") {
        // A submit since the page loaded: take the stored summary (↻ refresh recomputes the units).
        syncSummary();
        sendJson(res, 200, current.summary);
      } else if (url.pathname === "/api/summary/stamp") {
        syncSummary();
        sendJson(res, 200, { stamp: current.summary?.stamp ?? null });
      } else if (url.pathname === "/api/shutdown" && req.method === "POST") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true }), () => {
          console.log("lens viewer stopped from the viewer");
          server.close(stop);
          server.closeAllConnections();
        });
      } else if (!(url.pathname.startsWith("/api/ask") && await ask.handle(req, res, url))) {
        sendJson(res, 404, { error: "not found" });
      }
    } catch (err) {
      sendJson(res, 500, { error: (err as Error).message });
    }
  });

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.error(`lens: port ${opts.port} is in use — a lens viewer is probably already running ` +
        `(refresh it with ↻), or pick another port with --port`);
      process.exit(1);
    }
    throw err;
  });
  server.listen(opts.port, "127.0.0.1", () => {
    const url = `http://127.0.0.1:${opts.port}/`;
    writeServerInfo(infoRoot, opts.port); // before the banner: whoever waits for it can `lens ask` right away
    console.log(`lens viewer on ${url}  (ctrl-c to stop)`);
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
    if (opts.open) {
      const target = url + (opts.openSummary ? "#summary" : "");
      // `start` is a cmd builtin, not a program; its first quoted argument is a window title
      const [opener, args] = process.platform === "darwin" ? ["open", [target]]
        : process.platform === "win32" ? ["cmd", ["/c", "start", "", target]] : ["xdg-open", [target]];
      const child = spawn(opener, args, { stdio: "ignore", detached: true, windowsHide: true });
      // no browser opener (e.g. a headless box): the URL is printed above, keep serving
      child.on("error", () => console.log(`lens: couldn't open a browser — open ${target} yourself`));
      child.unref();
    }
  });
}
