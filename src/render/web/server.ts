import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import type { FileFoldModel, LensConfig } from "../../model.ts";
import type { SummaryView } from "../../summary/view.ts";
import { removeServerInfo, writeServerInfo } from "../../ask/discovery.ts";
import { createAskRoutes } from "../../ask/routes.ts";
import {
  highlightSource,
  isBundledTheme,
  shikiLangForFile,
  SUGGESTED_THEMES,
  type ViewerToken,
} from "../highlight.ts";

export type ViewerFile = FileFoldModel & { source: string };

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
  testFilePatterns: string[];
  /** The effective merged config, shown in the viewer's settings modal */
  config: LensConfig;
  configSource: string | null;
  /** PR mode: "owner/repo#N — title", shown in the viewer header */
  label: string | null;
  /** Diff/PR mode: data for the Summary tab */
  summary: SummaryView | null;
  /** Re-reads the stored summary for the current units (after a submit) */
  reloadSummary: (() => SummaryView | null) | null;
  /** summary.json mtime, cheap: polled on window focus */
  summaryStamp: (() => number | null) | null;
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

/** What the page gets as DATA (viewer.js) — ViewerInput made serializable, plus tokens. */
export interface ViewerPayload {
  threshold: number;
  theme: string;
  themes: string[];
  fg: string;
  bg: string;
  files: (ViewerFile & { tokens: ViewerToken[][] })[];
  deleted: string[];
  excluded: string[];
  renamed: { from: string; to: string }[];
  testFilePatterns: string[];
  config: LensConfig;
  configSource: string | null;
  label: string | null;
  summary: SummaryView | null;
  themePinned: boolean;
  canRefresh: boolean;
}

interface ThemeTokens {
  theme: string;
  fg: string;
  bg: string;
  /** tokens[fileIndex] — aligned with the files array */
  tokens: ViewerToken[][][];
}

const webDir = dirname(fileURLToPath(import.meta.url));

/** viewer.html with its stylesheet and scripts inlined: one self-contained page. */
function loadTemplate(): string {
  const read = (name: string) => readFileSync(join(webDir, name), "utf8");
  // Function replacements: plain strings would expand $-sequences in the code.
  return read("viewer.html")
    .replace("/*__LENS_CSS__*/", () => read("viewer.css"))
    .replace("/*__LENS_JS__*/", () => read("viewer.js") + "\n" + read("summary.js") + "\n" + read("ask.js"));
}

export async function serveViewer(
  input: ViewerInput,
  opts: ViewerOptions,
  reanalyze?: () => Promise<ViewerInput>,
): Promise<void> {
  let current = input;
  const themeCache = new Map<string, ThemeTokens>();
  const ask = createAskRoutes(() => current, opts.port);
  // the root of the analysis that wrote server.json — a refresh can't move it
  const infoRoot = input.root;
  const stop = () => {
    removeServerInfo(infoRoot);
    process.exit(0);
  };

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

  async function payloadFor(theme: string): Promise<ViewerPayload> {
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
      label: current.label,
      summary: current.summary,
      themePinned: opts.themePinned,
      canRefresh: reanalyze !== undefined,
    };
  }

  // Warm the initial theme before accepting requests.
  await tokensFor(opts.theme);
  const template = loadTemplate();

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
        ask.refresh();
        themeCache.clear();
        htmlCache.clear();
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(await payloadFor(theme)));
      } else if (url.pathname === "/api/summary") {
        // A submit since the page loaded: re-read the stored summary; the
        // units stay those of the last analysis (↻ refresh recomputes them).
        const summary = current.reloadSummary ? current.reloadSummary() : null;
        if (summary) {
          current = { ...current, summary };
          htmlCache.clear();
        }
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(summary));
      } else if (url.pathname === "/api/summary/stamp") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ stamp: current.summaryStamp ? current.summaryStamp() : null }));
      } else if (url.pathname === "/api/shutdown" && req.method === "POST") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true }), () => {
          console.log("lens viewer stopped from the viewer");
          server.close(stop);
          server.closeAllConnections();
        });
      } else if (url.pathname.startsWith("/api/ask/") || url.pathname === "/api/ask") {
        if (!(await ask.handle(req, res, url))) {
          res.writeHead(404);
          res.end("not found");
        }
      } else {
        res.writeHead(404);
        res.end("not found");
      }
    } catch (err) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: (err as Error).message }));
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
