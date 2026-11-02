/// <reference types="bun" />
// The harness of the viewer page tests (test/viewer-page.*.test.ts): the real bundle (bundle.ts)
// running in happy-dom on a real analysis of a fixture repo (viewerRepo.ts), driven like a reader
// would — clicks, keys, typing. A test file calls usePage() once, then opens pages with pageTest / open.

import { test, beforeAll, afterAll } from 'bun:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { fireEvent } from '@testing-library/dom';
import { bundleViewer } from '../../src/cli-app/render/web/bundle.ts';
import { highlightFiles, viewerPayload, type ViewerPayload } from '../../src/cli-app/render/web/server.ts';
import type { ClearInfoResponse, ClearResponse } from '../../src/cli-app/api/contract.ts';
import { themeSwatch } from '../../src/cli-app/render/highlight.ts';
import type { AskState } from '../../src/cli-app/ask/session.ts';
import type { ReaderNote } from '../../src/cli-app/notes/store.ts';
import { analyzeViewerRepo, makeViewerRepo } from './viewerRepo.ts';

export let repo = '';
export let bundle = '';
export let payload: ViewerPayload;
export let lightTokens: unknown;

export interface Page {
  /** Every request the page made: "GET /api/ask", "POST /api/ask/prompt" … */
  requests: { method: string; path: string; body: unknown }[];
  /** What GET /api/ask answers */
  ask: AskState;
  /** The analysis GET /api/tokens says its tokens are from; null: the page's own */
  tokensAnalysis: string | null;
  /** What GET /api/clear answers */
  clearInfo: ClearInfoResponse;
  /** The notes the server keeps: what /api/notes changes and answers */
  notes: ReaderNote[];
}

/** The payload, with these of the review's marks kept (.lens/marks/<review>.json) */
export function withMarks(marks: Partial<ViewerPayload['marks']>): ViewerPayload {
  return { ...payload, marks: { files: [], units: [], concerns: {}, ...marks } };
}

export const findOrdersId = () => payload.summary!.units.find((unit) => unit.name === 'findOrders')!.id;

/** The mark changes the page posted, in order */
export function postedMarks(page: Page): unknown[] {
  return page.requests.filter((request) => request.path === '/api/marks').map((request) => request.body);
}

/** Opens the viewer on the payload (or `data`), with these localStorage entries (and this cookie) already there. */
export async function open(prefs: Record<string, string> = {}, hash = '', cookie = '', data = payload): Promise<Page> {
  // a preview's frame isn't loaded, and says nothing about it: there is no server, and what it shows is the agent's, not the page's
  GlobalRegistrator.register({
    url: 'http://127.0.0.1:5326/' + hash,
    width: 1400,
    height: 900,
    settings: { navigation: { disableChildFrameNavigation: true } },
  });
  const page: Page = {
    requests: [],
    ask: { listening: false, questions: [] },
    tokensAnalysis: null,
    clearInfo: {
      kinds: [
        {
          id: 'summaries',
          label: 'Summaries',
          unit: ['review', 'reviews'],
          plans: {
            this: { count: 1, paths: ['.lens/summary/diff@main/'] },
            all: { count: 2, paths: ['.lens/summary/diff@main/', '.lens/summary/pr-87/'] },
          },
          warning: null,
        },
      ],
    },
    notes: [],
  };
  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://127.0.0.1:5326');
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
    page.requests.push({ method, path: url.pathname, body });
    const reply = (value: unknown) =>
      new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
    if (url.pathname.startsWith('/api/notes')) {
      const id = url.pathname.slice('/api/notes/'.length);
      if (method === 'POST' && !id)
        page.notes = [...page.notes, { ...body, id: 'n' + (page.notes.length + 1), at: '' }];
      else if (method === 'POST') page.notes = page.notes.map((note) => (note.id === id ? { ...note, ...body } : note));
      else if (method === 'DELETE') page.notes = page.notes.filter((note) => note.id !== id);
      return reply({ notes: page.notes });
    }
    switch (method + ' ' + url.pathname) {
      case 'POST /api/marks':
        return reply({ ok: true });
      case 'POST /api/rounds':
        return reply({ round: null });
      case 'GET /api/ask':
        return reply(page.ask);
      case 'POST /api/ask':
        return reply({ ok: true });
      case 'POST /api/ask/prompt':
        return reply({ text: 'the prompt' });
      case 'GET /api/stamp':
        return reply({ summary: payload.summary!.stamp, key: payload.summary!.key, change: payload.changeStamp });
      case 'GET /api/summary':
        return reply(payload.summary);
      case 'GET /api/refresh':
        return reply(payload);
      case 'GET /api/tokens':
        return reply({ ...(lightTokens as object), analysis: page.tokensAnalysis ?? payload.analysis });
      case 'POST /api/shutdown':
        return reply({ ok: true });
      case 'POST /api/settings':
        return reply(body);
      case 'GET /api/clear':
        return reply(page.clearInfo);
      case 'POST /api/clear': {
        const picks = body.picks as Record<string, 'this' | 'all'>;
        const cleared = Object.fromEntries(
          Object.entries(picks).map(([id, scope]) => [
            id,
            page.clearInfo.kinds.find((kind) => kind.id === id)!.plans[scope]!,
          ]),
        );
        // the summary as the server makes it again once summary.json is gone: no unit summarized
        const summary = payload.summary!;
        const answer: ClearResponse = {
          cleared,
          summary: picks.summaries
            ? { ...summary, stamp: null, units: summary.units.map((unit) => ({ ...unit, summary: null })) }
            : summary,
        };
        return reply(answer);
      }
    }
    return new Response('{}', { status: 404 });
  }) as typeof fetch;
  for (const [key, value] of Object.entries(prefs)) localStorage.setItem(key, value);
  if (cookie) document.cookie = cookie;
  document.body.innerHTML = '<div id="root"></div><script id="lens-data" type="application/json"></script>';
  document.getElementById('lens-data')!.textContent = JSON.stringify(data);
  new Function(bundle)();
  await settle();
  return page;
}

export async function close() {
  await GlobalRegistrator.unregister();
}

/** Lets React render and effects run. */
export async function settle() {
  for (let round = 0; round < 3; round++) await new Promise((resolve) => setTimeout(resolve, 0));
}

export async function key(name: string, options: KeyboardEventInit = {}) {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, ...options }));
  await settle();
}

export async function click(element: Element) {
  fireEvent.click(element);
  await settle();
}

export async function type(element: Element, text: string) {
  fireEvent.input(element, { target: { value: text } });
  await settle();
}

export function $(selector: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(selector);
  assert.ok(element, 'no element matches ' + selector);
  return element;
}
export const $$ = (selector: string) => [...document.querySelectorAll<HTMLElement>(selector)];

/** The code rows on screen: "12" a line, "−9" a removed line (old side), "⋯" a gap, "R6-8" a fold */
export function rows(root = '#code'): string[] {
  return $$(root + ' > .row, ' + root + ' > .region').map((row) =>
    row.classList.contains('region')
      ? 'R' + row.querySelector<HTMLElement>('.body .row[data-line]')!.dataset.line
      : (row.dataset.line ?? (row.dataset.old ? '−' + row.dataset.old : '⋯')),
  );
}

export function treeFiles(): string[] {
  return $$('#tree [data-part="file"]').map((file) => file.querySelector('[data-part="fname"]')!.textContent!);
}

/** A test on a freshly opened page. */
export function pageTest(
  name: string,
  run: (page: Page) => Promise<void>,
  prefs?: Record<string, string>,
  hash?: string,
  /** The payload to open on, made once the analysis is there */
  data?: () => ViewerPayload,
) {
  test(name, async () => {
    const page = await open(prefs, hash, '', data?.());
    try {
      await run(page);
    } finally {
      await close();
    }
  });
}

// hunks only (on by default): 1–5, 14 and 21–27 are far from every change
export const HUNKS = [
  '⋯',
  'R6',
  '−9',
  'R9',
  '10',
  '11',
  '12',
  '13',
  '⋯',
  '15',
  '16',
  '17',
  '−17',
  '−18',
  '−19',
  '−20',
  '18',
  '19',
  '20',
  '⋯',
];

export function splitRows(root = '#code'): string[] {
  const half = (row: Element, side: string) => {
    const element = row.querySelector<HTMLElement>(':scope > .' + side)!;
    if (element.classList.contains('none')) return '·';
    return (element.classList.contains('removed') ? '−' : '') + element.querySelector('.num')!.textContent!.trim();
  };
  return $$(root + ' > .srow, ' + root + ' > .region, ' + root + ' > .row').map((row) =>
    row.classList.contains('gap-row')
      ? '⋯'
      : row.classList.contains('srow')
        ? half(row, 'left') + '|' + half(row, 'right')
        : row.classList.contains('region')
          ? 'R' + row.querySelector<HTMLElement>('.body .row[data-line]')!.dataset.line
          : '⋯',
  );
}

export async function selectRows(from: HTMLElement, to: HTMLElement) {
  const range = document.createRange();
  range.setStart(from, 0);
  range.setEnd(to.lastElementChild!, 1);
  document.getSelection()!.removeAllRanges();
  document.getSelection()!.addRange(range);
  document.dispatchEvent(new Event('selectionchange'));
  await settle();
}

export function ticks(card = '[data-part="code-pane"]'): string[] {
  return $$(card + ' [data-part="ruler"] [data-part="tick"]').map(
    (tick) => tick.dataset.kind + ' ' + tick.dataset.label,
  );
}

/** What the status bar says: its kind, its label and the detail after it. */
export function status(): { kind: string; label: string; detail: string } {
  return {
    kind: $('#status').dataset.kind!,
    label: $('#status [data-part="status-label"]').textContent!,
    detail: document.querySelector('#status [data-part="status-detail"]')?.textContent ?? '',
  };
}
export const REST = { kind: 'idle', label: 'Ready', detail: '' };
export const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Answers the requests `answer` returns something for; the page's stub answers the rest. Returns the undo. */
export function answering(answer: (path: string) => Response | Promise<Response> | undefined): () => void {
  const stub = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
    const reply = answer(new URL(String(input), 'http://127.0.0.1:5326').pathname);
    return reply === undefined ? stub(input, init) : reply;
  }) as typeof fetch;
  return () => (globalThis.fetch = stub);
}

export const LINE_10 =
  '  const rows = await db.query("select * from orders where user = ? and deleted = 0", [userId]);';

/** A right-click on an element, as the mouse's right button gives it. */
export async function rightClick(element: Element) {
  fireEvent.contextMenu(element, { button: 2, clientX: 300, clientY: 200 });
  await settle();
}

/** A note the server already keeps on src/orders.ts. */
export function storedNote(patch: Partial<ReaderNote> = {}): ReaderNote {
  return {
    id: 'n1',
    file: 'src/orders.ts',
    side: 'new',
    start: 10,
    end: 10,
    lines: [LINE_10],
    kind: 'risk',
    text: 'deleted is a string column',
    at: '',
    ...patch,
  };
}

/** Opens the page with the server keeping these notes (and maybe no summary). */
export async function openWithNotes(notes: ReaderNote[], data: Partial<ViewerPayload> = {}): Promise<Page> {
  const page = await open({}, '', '', { ...payload, ...data, notes });
  page.notes = notes;
  return page;
}

/** The analysis, the bundle and the payload, made once for the test file that calls it. */
export function usePage(): void {
  beforeAll(async () => {
    repo = makeViewerRepo();
    bundle = (await bundleViewer()).script;
    const input = await analyzeViewerRepo(repo);
    const themes = await Promise.all(['github-dark', 'github-light'].map(themeSwatch));
    payload = viewerPayload(input, await highlightFiles(input.files, 'github-dark'), themes, {
      themePinned: true,
      canRefresh: true,
      analysis: 'run:1',
    });
    lightTokens = await highlightFiles(input.files, 'github-light');
  });

  afterAll(() => rmSync(repo, { recursive: true, force: true }));
}
