import { createServer } from 'node:http';
import { performance } from 'node:perf_hooks';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import type { FileFoldModel, LensConfig } from '../../model.ts';
import type { ConfigProblem } from '../../config.ts';
import type { SummaryView } from '../../summary/view.ts';
import { removeServerInfo, writeServerInfo } from '../../ask/discovery.ts';
import { createAskRoutes } from '../../ask/routes.ts';
import { createNoteRoutes } from '../../notes/routes.ts';
import { notesFor, type ReaderNote } from '../../notes/store.ts';
import { createMarkRoutes } from '../../marks/routes.ts';
import { createPlanRoutes, plansNow } from '../../plan/routes.ts';
import { createLspRoutes } from '../../lsp/routes.ts';
import { hostEnv } from '../../plan/lavish.ts';
import { startPlanProxy } from '../../plan/proxy.ts';
import { marksFor, type ReviewMarks } from '../../marks/store.ts';
import { isLocalRequest, readCookie, sendJson } from './http.ts';
import type {
  ClearRequest,
  SettingsRequest,
  StampResponse,
  TimingsRequest,
  TokensResponse,
  ViewSettings,
} from '../../api/contract.ts';
import { createRouter, HttpError, noBody, type RouteContext } from '../../api/router.ts';
import { previewResponse } from '../../summary/previews.ts';
import { checkView, revealSettings, settingsPath, viewSettings, writeSettings } from '../../summary/settings.ts';
import { buildProgressReader, type BuildProgress } from '../../summary/progress.ts';
import { clearKinds, describeKinds, type ClearContext, type ClearPlan } from '../../clear.ts';
import { escapeHtml } from '../../text.ts';
import { record, setTimings, sinceStart, timed } from '../../timings.ts';
import { isLightColor, THEME_COOKIE } from '../../theme.ts';
import { parsedZoom, UI_ZOOM_COOKIE, UI_ZOOM_DEFAULT, zoomStyle } from '../../zoom.ts';
import { bundleViewer } from './bundle.ts';
import { highlightAll, type HighlightJob } from '../highlightPool.ts';
// Imported as text, so the compiled `lens` carries it. bun-types types every .html import as an
// HTML bundle (what Bun.serve takes), which an import as text isn't.
import viewerTemplate from './viewer.html' with { type: 'text' };
import {
  themeSwatch,
  type ThemeSwatch,
  isBundledTheme,
  shikiLangForFile,
  SUGGESTED_THEMES,
  type ViewerToken,
} from '../highlight.ts';

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
  files: ViewerFile[];
  deleted: string[];
  /** Changed files skipped via exclude patterns — listed, not loaded */
  excluded: string[];
  /** Pure renames — listed, nothing to analyze */
  renamed: { from: string; to: string }[];
  /** Changed binary files (an image, a font) — listed with their status, nothing of theirs to show */
  binary: { file: string; status: 'added' | 'modified' | 'deleted' }[];
  /** The effective merged config, shown in the viewer's settings modal */
  config: LensConfig;
  configSource: string | null;
  /** What in .lens.json was skipped, and why: the status bar says so, Settings lists them */
  configProblems: ConfigProblem[];
  /** Build previews, as summary mode follows it: the reader's switch (~/.lens/settings.json), else the config's */
  buildPreviews: boolean;
  /** Check yourself, the same way */
  selfChecks: boolean;
  /** The Plan tab, the same way: a feature still behind its switch */
  planTab: boolean;
  /** TypeScript's hover and go to definition (lsp/), the same way: a feature still behind its switch */
  typescriptLsp: boolean;
  /** Timings (src/cli-app/timings.ts), the same way: the viewer measures its steps too while they're on */
  timings: boolean;
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
export type ViewerPayload = Omit<ViewerInput, 'root' | 'cwd' | 'files' | 'latestSummary' | 'latestChange'> & {
  theme: string;
  /** The theme menu's themes, each with its colors */
  themes: ThemeSwatch[];
  fg: string;
  bg: string;
  /** The theme's function-name color: the viewer's accent */
  accent: string;
  /** `removedTokens[block][line]`: the removed lines' tokens, by the file's `removals` */
  files: (ViewerFile & { tokens: ViewerToken[][]; removedTokens: ViewerToken[][][] })[];
  themePinned: boolean;
  canRefresh: boolean;
  /** Which analysis the files are from: tokens fetched later are applied only when theirs is the same */
  analysis: string;
  /** The reader's notes on the review's files (.lens/notes/<review>.json) */
  notes: ReaderNote[];
  /** The reader's viewed marks and verdicts in this review (.lens/marks/<review>.json) */
  marks: ReviewMarks;
  /** How the reader left the viewer (~/.lens/settings.json, the same in every repository) */
  view: ViewSettings;
  /** Where that file is, as Settings shows it: the whole path, for this machine */
  settingsFile: string;
};

export interface ThemeTokens {
  theme: string;
  fg: string;
  bg: string;
  accent: string;
  /** tokens[fileIndex] — aligned with the files array */
  tokens: ViewerToken[][][];
  /** removed[fileIndex][block][line]: the removed lines' tokens, colored in the old file around them */
  removed: ViewerToken[][][][];
}

/**
 * The old side of a file, up to its last removed line, rebuilt from the new side: the diff has no
 * context lines, so every line that isn't added was there before, in the same order, and the
 * removed lines fill the rest. No blob is read for it.
 */
export function oldSideLines(file: Pick<ViewerFile, 'source' | 'changedLines' | 'removals'>): string[] {
  return oldSide(file).lines;
}

/** oldSideLines, and for each line the new side's line (0-based) it is, or null for a removed one. */
function oldSide(file: Pick<ViewerFile, 'source' | 'changedLines' | 'removals'>): {
  lines: string[];
  keptAt: (number | null)[];
} {
  const old: (string | undefined)[] = [];
  for (const block of file.removals ?? []) {
    block.lines.forEach((text, lineIndex) => (old[block.oldStart - 1 + lineIndex] = text));
  }
  const keptAt: (number | null)[] = old.map(() => null);
  const added = new Set(file.changedLines ?? []);
  const newLines = file.source.split('\n');
  const kept = newLines.flatMap((_, index) => (added.has(index + 1) ? [] : [index]));
  let next = 0;
  for (let index = 0; index < old.length; index++) {
    if (old[index] !== undefined) continue;
    const at = kept[next++];
    old[index] = at === undefined ? '' : newLines[at];
    if (at !== undefined) keptAt[index] = at;
  }
  return { lines: old as string[], keptAt };
}

/**
 * Every file's Shiki tokens in one theme, and its removed lines' tokens. `previous` is the last
 * analysis in the same theme (a ↻ refresh): a file whose path, language, text and removed lines
 * are all the same (its added lines too) takes its tokens over, so only the files that changed are tokenized again. The
 * text is compared whole, not by a hash.
 *
 * Removed lines are colored as the old file colors them (`oldSideLines`): alone, a block that
 * starts inside a comment, a string, JSX or a type is colored as code of another kind.
 */
export async function highlightFiles(
  files: ViewerFile[],
  theme: string,
  previous?: { files: ViewerFile[]; tokens: ThemeTokens },
): Promise<ThemeTokens> {
  const reusable = new Map<string, { file: ViewerFile; tokens: ViewerToken[][]; removed: ViewerToken[][][] }>();
  if (previous && previous.tokens.theme === theme) {
    previous.files.forEach((file, index) =>
      reusable.set(file.file, { file, tokens: previous.tokens.tokens[index], removed: previous.tokens.removed[index] }),
    );
  }
  // the removed lines' colors come from the old side, which the added lines place too
  const sameRemovals = (a: ViewerFile, b: ViewerFile) =>
    JSON.stringify([a.removals ?? [], a.changedLines ?? []]) ===
    JSON.stringify([b.removals ?? [], b.changedLines ?? []]);
  // the files to tokenize: those that didn't keep their tokens
  const jobs: HighlightJob[] = [];
  const planned = files.map((f) => {
    const same = reusable.get(f.file);
    if (same && same.file.language === f.language && same.file.source === f.source && sameRemovals(same.file, f)) {
      return { reused: same, job: -1 };
    }
    const side = (f.removals ?? []).length > 0 ? oldSide(f) : null;
    const old = side && { text: side.lines.join('\n'), keptAt: side.keptAt };
    return {
      reused: null,
      job: jobs.push({ source: f.source, language: f.language ?? shikiLangForFile(f.file), theme, old }) - 1,
    };
  });
  const highlighted = await highlightAll(jobs);
  const results = files.map((f, index) => {
    const plan = planned[index];
    if (plan.reused) {
      return {
        tokens: plan.reused.tokens,
        removed: plan.reused.removed,
        fg: previous!.tokens.fg,
        bg: previous!.tokens.bg,
      };
    }
    const { oldTokens, ...result } = highlighted[plan.job];
    const removed = (f.removals ?? []).map((block) =>
      block.lines.map(
        (text, lineIndex) => oldTokens?.[block.oldStart - 1 + lineIndex] ?? [[text, null] as ViewerToken],
      ),
    );
    return { ...result, removed };
  });
  // the theme's own colors, not a file's: with no files, the page still follows the theme
  const swatch = await themeSwatch(theme);
  return {
    theme,
    accent: swatch.accent,
    fg: results[0]?.fg ?? swatch.fg,
    bg: results[0]?.bg ?? swatch.bg,
    tokens: results.map((r) => r.tokens),
    removed: results.map((r) => r.removed),
  };
}

/** The page's payload: the analysis, made serializable, with one theme's tokens. */
export function viewerPayload(
  input: ViewerInput,
  t: ThemeTokens,
  themes: ThemeSwatch[],
  opts: {
    themePinned: boolean;
    canRefresh: boolean;
    analysis: string;
    notes?: ReaderNote[];
    marks?: ReviewMarks;
    view?: ViewSettings;
  },
): ViewerPayload {
  const { root: _root, cwd: _cwd, latestSummary: _latest, latestChange: _change, ...data } = input;
  return {
    ...data,
    theme: t.theme,
    themes,
    fg: t.fg,
    bg: t.bg,
    accent: t.accent,
    files: input.files.map((f, i) => ({ ...f, tokens: t.tokens[i], removedTokens: t.removed[i] })),
    ...opts,
    notes: opts.notes ?? [],
    marks: opts.marks ?? { files: [], units: [], concerns: {} },
    view: opts.view ?? {},
    settingsFile: settingsPath(),
  };
}

/**
 * The page for a payload. The theme's colors and the UI's zoom go on the <html> element too (as main.tsx
 * sets them), so the page's first paint, before its script has run, is already in the theme and at its size.
 */
export function renderPage(template: string, payload: ViewerPayload, zoom = UI_ZOOM_DEFAULT): string {
  const colors = `--code-fg:${payload.fg};--code-bg:${payload.bg};--theme-accent:${payload.accent}${zoomStyle(zoom)}`;
  const root = ` data-appearance="${isLightColor(payload.bg) ? 'light' : 'dark'}" style="${escapeHtml(colors)}"`;
  const data = JSON.stringify(payload).replace(/</g, '\\u003c');
  // Function replacements: plain strings would expand $-sequences in the payload.
  return template.replace('/*__LENS_ROOT__*/', () => root).replace('/*__LENS_DATA__*/', () => data);
}

/** viewer.html with the bundled viewer's stylesheet and script inlined: one self-contained page. */
async function loadTemplate(): Promise<string> {
  const { script, css } = await bundleViewer();
  // Function replacements: plain strings would expand $-sequences in the code.
  return (viewerTemplate as unknown as string)
    .replace('/*__LENS_CSS__*/', () => css)
    .replace('/*__LENS_JS__*/', () => script);
}

export async function serveViewer(
  input: ViewerInput,
  opts: ViewerOptions,
  reanalyze?: (previous: ViewerInput) => Promise<ViewerInput>,
): Promise<void> {
  let current = input;
  setTimings(current.root, current.timings);
  const ask = createAskRoutes(() => current, opts.port);
  // the page carries the notes and the marks: once they change, the page held for a reload has the old ones
  let savedVersion = 0;
  const notes = createNoteRoutes(
    () => current,
    () => savedVersion++,
  );
  const marks = createMarkRoutes(
    () => current,
    () => savedVersion++,
  );
  // the Plan tab's frame loads Lavish's page through this (plan/proxy.ts)
  const planProxy = await startPlanProxy(opts.port);
  const plans = createPlanRoutes(() => current.root, planProxy);
  // the root of the analysis that wrote server.json — a refresh can't move it
  const infoRoot = input.root;
  const stop = () => {
    removeServerInfo(infoRoot);
    lsp.stop();
    process.exit(0);
  };

  // Each analysis has an id, unique to this server run too: the page says which one its files are
  // from, and takes tokens only for that one (a ↻ refresh elsewhere, or a restart, makes another).
  const run = randomUUID();
  const analysisIds = new WeakMap<ViewerFile[], string>();
  let analysisCount = 0;
  const analysisOf = (files: ViewerFile[]): string => {
    let id = analysisIds.get(files);
    if (!id) analysisIds.set(files, (id = run + ':' + ++analysisCount));
    return id;
  };

  // One theme's tokens of one analysis are kept, and one page: they are MBs each on a big diff, so
  // another theme or a ↻ refresh replaces them instead of adding to them. The promise is what's
  // kept, so requests that arrive while it tokenizes wait for the same work.
  let heldTokens: { files: ViewerFile[]; theme: string; tokens: Promise<ThemeTokens> } | null = null;
  let heldPage: { input: ViewerInput; theme: string; zoom: number; saved: number; html: string } | null = null;

  function tokensFor(files: ViewerFile[], theme: string): Promise<ThemeTokens> {
    if (heldTokens && heldTokens.files === files && heldTokens.theme === theme) return heldTokens.tokens;
    const previous = heldTokens;
    const tokens = (async () => {
      // a ↻ refresh in the same theme: the files that didn't change keep their tokens
      const reuse =
        previous && previous.theme === theme
          ? await previous.tokens.then(
              (done) => ({ files: previous.files, tokens: done }),
              () => undefined,
            )
          : undefined;
      return timed(
        'server',
        'tokens',
        () => highlightFiles(files, theme, reuse),
        () => theme,
      );
    })();
    const entry = { files, theme, tokens };
    heldTokens = entry;
    // a failure isn't kept: the next request tries again
    tokens.catch(() => {
      if (heldTokens === entry) heldTokens = null;
    });
    return tokens;
  }

  const themes = await Promise.all(
    (SUGGESTED_THEMES.includes(opts.theme) ? SUGGESTED_THEMES : [opts.theme, ...SUGGESTED_THEMES]).map(themeSwatch),
  );

  async function payloadFor(input: ViewerInput, theme: string): Promise<ViewerPayload> {
    const t = await tokensFor(input.files, theme);
    return viewerPayload(input, t, themes, {
      themePinned: opts.themePinned,
      canRefresh: reanalyze !== undefined,
      analysis: analysisOf(input.files),
      notes: notesFor(
        input,
        input.files.map((file) => file.file),
      ),
      marks: marksFor(input),
      view: viewSettings(),
    });
  }

  // Warm the initial theme before accepting requests, and bundle the page's script meanwhile.
  const [, template] = await Promise.all([
    tokensFor(current.files, opts.theme),
    timed('server', 'bundle', loadTemplate),
  ]);

  // the reader keeps its last read, so it's made again only for another review's summary
  let progress: { at: string; read: ReturnType<typeof buildProgressReader> } | null = null;
  function buildingNow(): BuildProgress | null {
    const key = current.summary?.key;
    if (!key) return null;
    const at = current.root + '\n' + key;
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
    return (pendingChange ??= latest()
      .catch(() => null)
      .finally(() => {
        pendingChange = null;
      }));
  }

  /** What Clear saved data clears in: the summary under its key as it is now, the marks and notes the page shows */
  function clearContext(): ClearContext {
    return { root: current.root, key: current.summary?.key ?? null, review: current.review };
  }

  async function htmlFor(theme: string, zoom: number): Promise<string> {
    // the page opens with the summary as it is now, not as it was when the server started
    syncSummary();
    const input = current;
    // stringifying an MBs payload on every reload is waste
    if (
      heldPage &&
      heldPage.input === input &&
      heldPage.theme === theme &&
      heldPage.zoom === zoom &&
      heldPage.saved === savedVersion
    ) {
      return heldPage.html;
    }
    const version = savedVersion;
    const html = renderPage(template, await payloadFor(input, theme), zoom);
    heldPage = { input, theme, zoom, saved: version, html };
    return html;
  }

  /** The theme a request asks for (`?theme=`), else this run's */
  const themeOf = (url: URL): string => {
    const asked = url.searchParams.get('theme');
    return asked && isBundledTheme(asked) ? asked : opts.theme;
  };

  // the page's theme, for a hover's code
  const lsp = createLspRoutes(() => current, themeOf);

  const page = async ({ req, res, url }: RouteContext) => {
    // the theme the reader picked (the viewer keeps it in a cookie), unless --theme pinned this run's
    const picked = url.searchParams.get('theme') || opts.themePinned ? null : readCookie(req, THEME_COOKIE);
    // the page first: once the headers are out, a failure can't be answered with a 500
    const zoom = parsedZoom(readCookie(req, UI_ZOOM_COOKIE));
    const html = await htmlFor(picked && isBundledTheme(picked) ? picked : themeOf(url), zoom);
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(html);
  };

  const router = createRouter()
    .raw('* /', page)
    .raw('* /index.html', page)
    .json('GET /api/tokens', noBody, async (_, { url }) => {
      const asked = url.searchParams.get('theme');
      if (asked && !isBundledTheme(asked)) throw new HttpError(400, `unknown theme "${asked}"`);
      // the files as they are now, named: tokens made for them must not land on another analysis's
      const { files } = current;
      const tokens: TokensResponse = { ...(await tokensFor(files, themeOf(url))), analysis: analysisOf(files) };
      return tokens;
    })
    .json('GET /api/refresh', noBody, async (_, { url }) => {
      if (!reanalyze) throw new HttpError(404, 'refresh not available');
      const input = await timed('server', 'analyze', () => reanalyze(current));
      current = input;
      // the config or the switch may have changed with it
      setTimings(input.root, input.timings);
      ask.refresh();
      return payloadFor(input, themeOf(url));
    })
    .json('GET /api/summary', noBody, () => {
      // A submit since the page loaded: take the stored summary (↻ refresh recomputes the units).
      syncSummary();
      return current.summary;
    })
    .json('GET /api/stamp', noBody, async (_, { url }) => {
      syncSummary();
      const stamp: StampResponse = {
        summary: current.summary?.stamp ?? null,
        key: current.summary?.key ?? null,
        change: await changeNow(),
        building: buildingNow(),
        // only the Plan tab asks: the list reads Lavish's state and asks its server
        plans: url.searchParams.has('plans') ? (await plansNow(current.root, hostEnv())).stamp : null,
        lsp: lsp.status(),
      };
      return stamp;
    })
    .raw('GET /api/preview/*', ({ res, params }) => {
      // a preview the agent drew, alone in its sandboxed frame (summary/previews.ts)
      const preview = previewResponse(current.root, current.summary?.key ?? null, params['*']);
      res.writeHead(preview.status, preview.headers);
      res.end(preview.body);
    })
    .json('POST /api/settings', parseSettings, (settings) => {
      writeSettings(settings);
      current = { ...current, ...settings };
      if (settings.timings !== undefined) setTimings(current.root, settings.timings);
      return settings;
    })
    .json('POST /api/view', parseView, (view) => {
      writeSettings({ view });
      // the page held for a reload carries the view as it was
      savedVersion++;
      return { ok: true };
    })
    .json('POST /api/settings/reveal', noBody, () => {
      revealSettings();
      return { ok: true };
    })
    .json('POST /api/timings', parseTimings, ({ timings }) => {
      for (const timing of timings) record('viewer', timing.name, timing.ms, timing.detail);
      return { ok: true };
    })
    .json('GET /api/clear', noBody, () => {
      // the summary's key as it is now: it names the branch checked out
      syncSummary();
      return { kinds: describeKinds(clearContext()) };
    })
    .json('POST /api/clear', parseClear, ({ picks }) => {
      let cleared: Record<string, ClearPlan>;
      syncSummary();
      try {
        cleared = clearKinds(clearContext(), picks);
      } catch (err) {
        throw new HttpError(400, (err as Error).message);
      }
      // the stored summary is gone: the view is made again, with no unit summarized
      syncSummary();
      if (cleared.notes || cleared.marks) savedVersion++;
      return { cleared, summary: current.summary };
    })
    .raw('POST /api/shutdown', ({ res }) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true }), () => {
        console.log('lens viewer stopped from the viewer');
        server.close(stop);
        server.closeAllConnections();
      });
    })
    .use(notes)
    .use(marks)
    .use(plans)
    .use(lsp.router)
    .use(ask);

  const server = createServer(async (req, res) => {
    try {
      if (!isLocalRequest(req, opts.port)) {
        sendJson(res, 403, { error: 'lens only answers its own viewer page' });
        return;
      }
      const url = new URL(req.url ?? '/', 'http://localhost');
      const start = performance.now();
      const route = await router.handle(req, res, url);
      if (!route) sendJson(res, 404, { error: 'not found' });
      // the viewer's own timings aren't a step to measure
      else if (route !== 'POST /api/timings') record('server', route, performance.now() - start);
    } catch (err) {
      sendJson(res, 500, { error: (err as Error).message });
    }
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(
        `lens: port ${opts.port} is in use — a lens viewer is probably already running ` +
          `(refresh it with ↻), or pick another port with --port`,
      );
      process.exit(1);
    }
    throw err;
  });
  server.listen(opts.port, '127.0.0.1', () => {
    const url = `http://127.0.0.1:${opts.port}/`;
    writeServerInfo(infoRoot, opts.port, planProxy.port); // before the banner: whoever waits for it can `lens ask` right away
    console.log(`lens viewer on ${url}  (ctrl-c to stop)`);
    record('cli', 'ready', sinceStart());
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
    if (opts.open) {
      const target = url + (opts.openSummary ? '#summary' : '');
      // `start` is a cmd builtin, not a program; its first quoted argument is a window title
      const [opener, args] =
        process.platform === 'darwin'
          ? ['open', [target]]
          : process.platform === 'win32'
            ? ['cmd', ['/c', 'start', '', target]]
            : ['xdg-open', [target]];
      const child = spawn(opener, args, { stdio: 'ignore', detached: true, windowsHide: true });
      // no browser opener (e.g. a headless box): the URL is printed above, keep serving
      child.on('error', () => console.log(`lens: couldn't open a browser — open ${target} yourself`));
      child.unref();
    }
  });
}

function parseSettings(raw: unknown): SettingsRequest | { error: string } {
  const { buildPreviews, selfChecks, planTab, typescriptLsp, timings } = (
    raw && typeof raw === 'object' ? raw : {}
  ) as Record<string, unknown>;
  const given = {
    ...(buildPreviews !== undefined && { buildPreviews }),
    ...(selfChecks !== undefined && { selfChecks }),
    ...(planTab !== undefined && { planTab }),
    ...(typescriptLsp !== undefined && { typescriptLsp }),
    ...(timings !== undefined && { timings }),
  };
  if (Object.keys(given).length === 0)
    return { error: 'name buildPreviews, selfChecks, planTab, typescriptLsp or timings' };
  if (Object.values(given).some((on) => typeof on !== 'boolean')) return { error: 'a switch must be true or false' };
  return given as SettingsRequest;
}

function parseView(raw: unknown): ViewSettings | { error: string } {
  const { view, bad } = checkView(raw);
  if (bad.length > 0) return { error: 'not a view setting it can be: ' + bad.join(', ') };
  if (Object.keys(view).length === 0) return { error: 'name a view setting' };
  return view;
}

const TIMINGS_MAX = 100;

function parseTimings(raw: unknown): TimingsRequest | { error: string } {
  const { timings } = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  if (!Array.isArray(timings) || timings.length > TIMINGS_MAX)
    return { error: `timings: a list of at most ${TIMINGS_MAX}` };
  const valid = timings.every(
    (timing) =>
      typeof timing?.name === 'string' &&
      timing.name.length <= 80 &&
      typeof timing.ms === 'number' &&
      Number.isFinite(timing.ms) &&
      (timing.detail === undefined || (typeof timing.detail === 'string' && timing.detail.length <= 200)),
  );
  if (!valid) return { error: 'a timing is { name, ms, detail? }' };
  return { timings: timings.map(({ name, ms, detail }) => ({ name, ms, ...(detail !== undefined && { detail }) })) };
}

function parseClear(raw: unknown): ClearRequest | { error: string } {
  const { picks } = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  if (typeof picks !== 'object' || picks === null || Object.keys(picks).length === 0) {
    return { error: 'pick something to clear' };
  }
  return { picks: picks as ClearRequest['picks'] };
}
