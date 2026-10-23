import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import type { FileFoldModel, LensConfig } from "../../model.ts";
import type { SummaryView } from "../../summary/view.ts";
import { removeServerInfo, writeServerInfo } from "../../ask/discovery.ts";
import { createAskRoutes } from "../../ask/routes.ts";
import { createNoteRoutes } from "../../notes/routes.ts";
import { notesFor, type ReaderNote } from "../../notes/store.ts";
import { createMarkRoutes } from "../../marks/routes.ts";
import { marksFor, type ReviewMarks } from "../../marks/store.ts";
import { isLocalRequest, readBody, readCookie, sendJson } from "./http.ts";
import { previewResponse } from "../../summary/previews.ts";
import { writeSettings } from "../../summary/settings.ts";
import { buildProgressReader, type BuildProgress } from "../../summary/progress.ts";
import {
  clearKinds, describeKinds, type ClearContext, type ClearKindInfo, type ClearPlan, type ClearScope,
} from "../../clear.ts";
import { escapeHtml } from "../../text.ts";
import { isLightColor, THEME_COOKIE } from "../../theme.ts";
import { bundleViewer } from "./bundle.ts";
// Imported as text, so the compiled `lens` carries it. bun-types types every .html import as an
// HTML bundle (what Bun.serve takes), which an import as text isn't.
import viewerTemplate from "./viewer.html" with { type: "text" };
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
  /** The review's key (reviewKey): the reader's marks and notes are kept under it, and the summary in diff/PR mode */
  review: string;
  threshold: number;
  files: ViewerFile[];
  deleted: string[];
  /** Changed files skipped via exclude patterns — listed, not loaded */
  excluded: string[];
  /** Pure renames — listed, nothing to analyze */
  renamed: { from: string; to: string }[];
  /** Changed binary files (an image, a font) — listed with their status, nothing of theirs to show */
  binary: { file: string; status: "added" | "modified" | "deleted" }[];
  /** The effective merged config, shown in the viewer's settings modal */
  config: LensConfig;
  configSource: string | null;
  /** Build previews, as summary mode follows it: the reader's switch (.lens/settings.json), else the config's */
  buildPreviews: boolean;
  /** PR mode: "owner/repo#N — title", shown in the viewer header */
  label: string | null;
  /** PR mode: the default branch it was diffed against, when GitHub no longer says the PR's base */
  guessedBase: string | null;
  /** Diff/PR mode: data for the Summary tab */
  summary: SummaryView | null;
  /** The summary as stored now: the same object until a submit changes summary.json */
  latestSummary: (() => SummaryView) | null;
  /** Diff mode: the change's fingerprint when this analysis read it (changeFingerprint in git.ts) */
  changeStamp: string | null;
  /** The change's fingerprint as it is on disk now: another one than `changeStamp` means the code moved on */
  latestChange: (() => Promise<string>) | null;
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
export type ViewerPayload = Omit<ViewerInput, "root" | "cwd" | "files" | "latestSummary" | "latestChange"> & {
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
  /** Which analysis the files are from: tokens fetched later are applied only when theirs is the same */
  analysis: string;
  /** The reader's notes on the review's files (.lens/notes/<review>.json) */
  notes: ReaderNote[];
  /** The reader's viewed marks and verdicts in this review (.lens/marks/<review>.json) */
  marks: ReviewMarks;
};

export interface ThemeTokens {
  theme: string;
  fg: string;
  bg: string;
  accent: string;
  /** tokens[fileIndex] — aligned with the files array */
  tokens: ViewerToken[][][];
}

/**
 * What /api/stamp answers, everything the page watches for in one request: the stored summary's
 * stamp and the key it's read under (another branch checked out moves it), the change's
 * fingerprint as it is on disk now (null when this review has none), and the agent's summary run
 * while one is going.
 */
export interface StampResponse {
  summary: number | null;
  key: string | null;
  change: string | null;
  building: BuildProgress | null;
}

/** What GET /api/clear answers: what each kind would remove */
export interface ClearInfoResponse {
  kinds: ClearKindInfo[];
}

/** What POST /api/clear takes: each kind to clear, with its scope */
export interface ClearRequest {
  picks: Record<string, ClearScope>;
}

/** What POST /api/clear answers: what it removed, and the summary as it is now */
export interface ClearResponse {
  cleared: Record<string, ClearPlan>;
  summary: SummaryView | null;
}

/** What /api/tokens answers: a theme's tokens, and the analysis whose files they are. */
export type TokensResponse = ThemeTokens & { analysis: string };

/**
 * Every file's Shiki tokens in one theme. `previous` is the last analysis in the same theme (a ↻
 * refresh): a file whose path, language and text are all the same takes its tokens over, so only
 * the files that changed are tokenized again. The text is compared whole, not by a hash.
 */
export async function highlightFiles(
  files: ViewerFile[],
  theme: string,
  previous?: { files: ViewerFile[]; tokens: ThemeTokens },
): Promise<ThemeTokens> {
  const reusable = new Map<string, { file: ViewerFile; tokens: ViewerToken[][] }>();
  if (previous && previous.tokens.theme === theme) {
    previous.files.forEach((file, index) => reusable.set(file.file, { file, tokens: previous.tokens.tokens[index] }));
  }
  const results = await Promise.all(
    files.map((f) => {
      const same = reusable.get(f.file);
      if (same && same.file.language === f.language && same.file.source === f.source) {
        return { tokens: same.tokens, fg: previous!.tokens.fg, bg: previous!.tokens.bg };
      }
      return highlightSource(f.source, f.language ?? shikiLangForFile(f.file), theme);
    }),
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
  input: ViewerInput, t: ThemeTokens, themes: ThemeSwatch[],
  opts: { themePinned: boolean; canRefresh: boolean; analysis: string; notes?: ReaderNote[]; marks?: ReviewMarks },
): ViewerPayload {
  const { root: _root, cwd: _cwd, latestSummary: _latest, latestChange: _change, ...data } = input;
  return {
    ...data,
    theme: t.theme,
    themes,
    fg: t.fg,
    bg: t.bg,
    accent: t.accent,
    files: input.files.map((f, i) => ({ ...f, tokens: t.tokens[i] })),
    ...opts,
    notes: opts.notes ?? [],
    marks: opts.marks ?? { files: [], units: [], concerns: {} },
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

/** viewer.html with the bundled viewer's stylesheet and script inlined: one self-contained page. */
async function loadTemplate(): Promise<string> {
  const { script, css } = await bundleViewer();
  // Function replacements: plain strings would expand $-sequences in the code.
  return (viewerTemplate as unknown as string)
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
  // the page carries the notes and the marks: once they change, the page held for a reload has the old ones
  let savedVersion = 0;
  const notes = createNoteRoutes(() => current, () => savedVersion++);
  const marks = createMarkRoutes(() => current, () => savedVersion++);
  // the root of the analysis that wrote server.json — a refresh can't move it
  const infoRoot = input.root;
  const stop = () => {
    removeServerInfo(infoRoot);
    process.exit(0);
  };

  // Each analysis has an id, unique to this server run too: the page says which one its files are
  // from, and takes tokens only for that one (a ↻ refresh elsewhere, or a restart, makes another).
  const run = randomUUID();
  const analysisIds = new WeakMap<ViewerFile[], string>();
  let analysisCount = 0;
  const analysisOf = (files: ViewerFile[]): string => {
    let id = analysisIds.get(files);
    if (!id) analysisIds.set(files, (id = run + ":" + ++analysisCount));
    return id;
  };

  // One theme's tokens of one analysis are kept, and one page: they are MBs each on a big diff, so
  // another theme or a ↻ refresh replaces them instead of adding to them. The promise is what's
  // kept, so requests that arrive while it tokenizes wait for the same work.
  let heldTokens: { files: ViewerFile[]; theme: string; tokens: Promise<ThemeTokens> } | null = null;
  let heldPage: { input: ViewerInput; theme: string; saved: number; html: string } | null = null;

  function tokensFor(files: ViewerFile[], theme: string): Promise<ThemeTokens> {
    if (heldTokens && heldTokens.files === files && heldTokens.theme === theme) return heldTokens.tokens;
    const previous = heldTokens;
    const tokens = (async () => {
      // a ↻ refresh in the same theme: the files that didn't change keep their tokens
      const reuse = previous && previous.theme === theme
        ? await previous.tokens.then((done) => ({ files: previous.files, tokens: done }), () => undefined)
        : undefined;
      return highlightFiles(files, theme, reuse);
    })();
    const entry = { files, theme, tokens };
    heldTokens = entry;
    // a failure isn't kept: the next request tries again
    tokens.catch(() => { if (heldTokens === entry) heldTokens = null; });
    return tokens;
  }

  const themes = await Promise.all(
    (SUGGESTED_THEMES.includes(opts.theme) ? SUGGESTED_THEMES : [opts.theme, ...SUGGESTED_THEMES]).map(themeSwatch),
  );

  async function payloadFor(input: ViewerInput, theme: string): Promise<ViewerPayload> {
    const t = await tokensFor(input.files, theme);
    return viewerPayload(input, t, themes, {
      themePinned: opts.themePinned, canRefresh: reanalyze !== undefined, analysis: analysisOf(input.files),
      notes: notesFor(input, input.files.map((file) => file.file)),
      marks: marksFor(input),
    });
  }

  // Warm the initial theme before accepting requests.
  await tokensFor(current.files, opts.theme);
  const template = await loadTemplate();

  // the reader keeps its last read, so it's made again only for another review's summary
  let progress: { at: string; read: ReturnType<typeof buildProgressReader> } | null = null;
  function buildingNow(): BuildProgress | null {
    const key = current.summary?.key;
    if (!key) return null;
    const at = current.root + "\n" + key;
    if (progress?.at !== at) progress = { at, read: buildProgressReader(current.root, key) };
    return progress.read();
  }

  /** A submit or another branch since the summary was read: take the new one (the units stay those of the last analysis). */
  function syncSummary(): void {
    const summary = current.latestSummary?.() ?? null;
    if (summary !== current.summary) current = { ...current, summary };
  }

  // Polls that arrive while git answers share its answer. One that fails (the folder is gone)
  // says null: nothing is known, so nothing is claimed.
  let pendingChange: Promise<string | null> | null = null;
  function changeNow(): Promise<string | null> {
    const latest = current.latestChange;
    if (!latest) return Promise.resolve(null);
    return (pendingChange ??= latest().catch(() => null).finally(() => { pendingChange = null; }));
  }

  /** What Clear saved data clears in: the summary under its key as it is now, the marks and notes the page shows */
  function clearContext(): ClearContext {
    return { root: current.root, key: current.summary?.key ?? null, review: current.review };
  }

  async function htmlFor(theme: string): Promise<string> {
    // the page opens with the summary as it is now, not as it was when the server started
    syncSummary();
    const input = current;
    // stringifying an MBs payload on every reload is waste
    if (heldPage && heldPage.input === input && heldPage.theme === theme && heldPage.saved === savedVersion) {
      return heldPage.html;
    }
    const version = savedVersion;
    const html = renderPage(template, await payloadFor(input, theme));
    heldPage = { input, theme, saved: version, html };
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
        // the page first: once the headers are out, a failure can't be answered with a 500
        const html = await htmlFor(picked && isBundledTheme(picked) ? picked : theme);
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(html);
      } else if (url.pathname === "/api/tokens") {
        if (themeParam && !isBundledTheme(themeParam)) {
          sendJson(res, 400, { error: `unknown theme "${themeParam}"` });
          return;
        }
        // the files as they are now, named: tokens made for them must not land on another analysis's
        const { files } = current;
        const tokens: TokensResponse = { ...(await tokensFor(files, theme)), analysis: analysisOf(files) };
        sendJson(res, 200, tokens);
      } else if (url.pathname === "/api/refresh") {
        if (!reanalyze) {
          sendJson(res, 404, { error: "refresh not available" });
          return;
        }
        const input = await reanalyze();
        current = input;
        ask.refresh();
        sendJson(res, 200, await payloadFor(input, theme));
      } else if (url.pathname === "/api/summary") {
        // A submit since the page loaded: take the stored summary (↻ refresh recomputes the units).
        syncSummary();
        sendJson(res, 200, current.summary);
      } else if (url.pathname === "/api/stamp") {
        syncSummary();
        const stamp: StampResponse = {
          summary: current.summary?.stamp ?? null,
          key: current.summary?.key ?? null,
          change: await changeNow(),
          building: buildingNow(),
        };
        sendJson(res, 200, stamp);
      } else if (url.pathname.startsWith("/api/preview/")) {
        // a preview the agent drew, alone in its sandboxed frame (summary/previews.ts)
        const preview = previewResponse(current.root, current.summary?.key ?? null, url.pathname.slice("/api/preview/".length));
        res.writeHead(preview.status, preview.headers);
        res.end(preview.body);
      } else if (url.pathname === "/api/settings" && req.method === "POST") {
        const body = JSON.parse(await readBody(req)) as { buildPreviews?: unknown };
        if (typeof body?.buildPreviews !== "boolean") {
          sendJson(res, 400, { error: "buildPreviews must be true or false" });
          return;
        }
        writeSettings(current.root, { buildPreviews: body.buildPreviews });
        current = { ...current, buildPreviews: body.buildPreviews };
        sendJson(res, 200, { buildPreviews: body.buildPreviews });
      } else if (url.pathname === "/api/clear" && req.method === "GET") {
        // the summary's key as it is now: it names the branch checked out
        syncSummary();
        const info: ClearInfoResponse = { kinds: describeKinds(clearContext()) };
        sendJson(res, 200, info);
      } else if (url.pathname === "/api/clear" && req.method === "POST") {
        const body = JSON.parse(await readBody(req)) as Partial<ClearRequest> | null;
        const picks = body?.picks;
        if (typeof picks !== "object" || picks === null || Object.keys(picks).length === 0) {
          sendJson(res, 400, { error: "pick something to clear" });
          return;
        }
        let cleared: Record<string, ClearPlan>;
        syncSummary();
        try {
          cleared = clearKinds(clearContext(), picks);
        } catch (err) {
          sendJson(res, 400, { error: (err as Error).message });
          return;
        }
        // the stored summary is gone: the view is made again, with no unit summarized
        syncSummary();
        if (cleared.notes || cleared.marks) savedVersion++;
        const answer: ClearResponse = { cleared, summary: current.summary };
        sendJson(res, 200, answer);
      } else if (url.pathname === "/api/shutdown" && req.method === "POST") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true }), () => {
          console.log("lens viewer stopped from the viewer");
          server.close(stop);
          server.closeAllConnections();
        });
      } else if (!(url.pathname.startsWith("/api/notes") && await notes.handle(req, res, url)) &&
        !(url.pathname === "/api/marks" && await marks.handle(req, res, url)) &&
        !(url.pathname.startsWith("/api/ask") && await ask.handle(req, res, url))) {
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
