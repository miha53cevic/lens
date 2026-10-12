// The viewer page itself: the real bundle (bundle.ts) running in happy-dom on a real
// analysis of a fixture repo, driven like a reader would — clicks, keys, typing.
// Type-checked by tsconfig.viewer.json (it needs the DOM types).

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { fireEvent, within } from '@testing-library/dom';
import { analyze } from '../src/cli-app/analyze.ts';
import { loadConfig } from '../src/cli-app/config.ts';
import { bundleViewer } from '../src/cli-app/render/web/bundle.ts';
import { highlightFiles, renderPage, viewerPayload, type ViewerPayload } from '../src/cli-app/render/web/server.ts';
import { themeSwatch } from '../src/cli-app/render/highlight.ts';
import { writeStored, type StoredSummary } from '../src/cli-app/summary/store.ts';
import type { AskQuestion, AskState } from '../src/cli-app/ask/session.ts';
import { makeViewerRepo } from './fixtures/viewerRepo.ts';

let repo = '';
let bundle = '';
let payload: ViewerPayload;
let lightTokens: unknown;

before(async () => {
  repo = makeViewerRepo();
  bundle = (await bundleViewer()).script;
  const input = await analyze('diff', [], repo, loadConfig(repo));
  const unit = (name: string) => input.summary!.units.find((candidate) => candidate.name === name)!;
  const findOrders = unit('findOrders'),
    legacy = unit('legacyTotal');
  const stored: StoredSummary = {
    version: 1,
    updatedAt: '',
    flows: [],
    units: {
      [findOrders.id]: {
        hash: findOrders.hash,
        headline: 'findOrders skips deleted orders',
        gist: 'skips deleted orders',
        needsLook: true,
        changes: [{ when: 'an order is deleted', before: 'it was returned', now: "it's skipped", line: 'N10' }],
        breaks: [],
        concerns: [{ kind: 'bug', text: 'deleted is a string column', line: 'N10' }],
      },
      [legacy.id]: {
        hash: legacy.hash,
        headline: 'legacyTotal is gone',
        gist: 'removed',
        needsLook: false,
        changes: [],
        breaks: [],
        concerns: [{ kind: 'question', text: 'did anything still call it?', line: 'O17' }],
      },
    },
  };
  writeStored(repo, 'diff', stored);
  input.summary = input.latestSummary!();
  const themes = await Promise.all(['github-dark', 'github-light'].map(themeSwatch));
  payload = viewerPayload(input, await highlightFiles(input.files, 'github-dark'), themes, {
    themePinned: true,
    canRefresh: true,
    analysis: 'run:1',
  });
  lightTokens = await highlightFiles(input.files, 'github-light');
});

after(() => rmSync(repo, { recursive: true, force: true }));

// ---- the page harness ----

interface Page {
  /** Every request the page made: "GET /api/ask", "POST /api/ask/prompt" … */
  requests: { method: string; path: string; body: unknown }[];
  /** What GET /api/ask answers */
  ask: AskState;
  /** The analysis GET /api/tokens says its tokens are from; null: the page's own */
  tokensAnalysis: string | null;
}

/** Opens the viewer on the payload, with these localStorage entries (and this cookie) already there. */
async function open(prefs: Record<string, string> = {}, hash = '', cookie = ''): Promise<Page> {
  GlobalRegistrator.register({ url: 'http://127.0.0.1:5326/' + hash, width: 1400, height: 900 });
  const page: Page = { requests: [], ask: { listening: false, questions: [] }, tokensAnalysis: null };
  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://127.0.0.1:5326');
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
    page.requests.push({ method, path: url.pathname, body });
    const reply = (value: unknown) =>
      new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
    switch (method + ' ' + url.pathname) {
      case 'GET /api/ask':
        return reply(page.ask);
      case 'POST /api/ask':
        return reply({ ok: true });
      case 'POST /api/ask/prompt':
        return reply({ text: 'the prompt' });
      case 'GET /api/stamp':
        return reply({ summary: payload.summary!.stamp, change: payload.changeStamp });
      case 'GET /api/summary':
        return reply(payload.summary);
      case 'GET /api/refresh':
        return reply(payload);
      case 'GET /api/tokens':
        return reply({ ...(lightTokens as object), analysis: page.tokensAnalysis ?? payload.analysis });
      case 'POST /api/shutdown':
        return reply({ ok: true });
    }
    return new Response('{}', { status: 404 });
  }) as typeof fetch;
  for (const [key, value] of Object.entries(prefs)) localStorage.setItem(key, value);
  if (cookie) document.cookie = cookie;
  document.body.innerHTML = '<div id="root"></div><script id="lens-data" type="application/json"></script>';
  document.getElementById('lens-data')!.textContent = JSON.stringify(payload);
  new Function(bundle)();
  await settle();
  return page;
}

async function close() {
  await GlobalRegistrator.unregister();
}

/** Lets React render and effects run. */
async function settle() {
  for (let round = 0; round < 3; round++) await new Promise((resolve) => setTimeout(resolve, 0));
}

async function key(name: string, options: KeyboardEventInit = {}) {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, ...options }));
  await settle();
}

async function click(element: Element) {
  fireEvent.click(element);
  await settle();
}

async function type(element: Element, text: string) {
  fireEvent.input(element, { target: { value: text } });
  await settle();
}

function $(selector: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(selector);
  assert.ok(element, 'no element matches ' + selector);
  return element;
}
const $$ = (selector: string) => [...document.querySelectorAll<HTMLElement>(selector)];

/** The code rows on screen: "12" a line, "−9" a removed line (old side), "⋯" a gap, "R6-8" a fold */
function rows(root = '#code'): string[] {
  return $$(root + ' > .row, ' + root + ' > .region').map((row) =>
    row.classList.contains('region')
      ? 'R' + row.querySelector<HTMLElement>('.body .row[data-line]')!.dataset.line
      : (row.dataset.line ?? (row.dataset.old ? '−' + row.dataset.old : '⋯')),
  );
}

function treeFiles(): string[] {
  return $$('#tree .file').map((file) => file.querySelector('.fname')!.textContent!);
}

/** A test on a freshly opened page. */
function pageTest(name: string, run: (page: Page) => Promise<void>, prefs?: Record<string, string>, hash?: string) {
  test(name, async () => {
    const page = await open(prefs, hash);
    try {
      await run(page);
    } finally {
      await close();
    }
  });
}

// hunks only (on by default): 1–5, 14 and 21–27 are far from every change
const HUNKS = [
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

// ---- the Code view ----

pageTest('the page opens on the first file of the tree, folded, hunks only', async () => {
  assert.deepEqual(treeFiles(), ['orders.ts'], 'hide tests is on by default');
  assert.equal($('.tab.active .tab-name').textContent, 'orders.ts');
  assert.deepEqual(rows(), HUNKS);
  assert.deepEqual(
    $$('#code .row.gap').map((gap) => gap.lastElementChild!.textContent),
    ['⋯ 5 unchanged lines', '⋯ 1 unchanged line', '⋯ 7 unchanged lines'],
  );
  // the code card's header: the file's status, its path, the lines the diff added and removed
  assert.equal($('.code-head .status-badge').textContent, 'MModified');
  assert.equal($('.code-head .code-path').textContent, 'src/orders.ts');
  assert.equal($('.code-head .counts').textContent, '+2−5');
  assert.equal($('#tree .file .status-letter').textContent, 'M');
  assert.equal($('#nav .progress-count').textContent, '0 of 1');
});

pageTest('a fold opens on a click; expand all, collapse all and a fold chip act on all of them', async () => {
  const fold = (category: string) => $(`#code .region[data-cat="${category}"]`);
  const chip = (category: string) =>
    $$('#toggles .chip')
      .find((candidate) => candidate.textContent === category)!
      .querySelector('input')!;
  await click(fold('guard').querySelector('.pill-row')!);
  assert.ok(fold('guard').classList.contains('open'));
  assert.ok(!fold('logging').classList.contains('open'));

  await key('e');
  assert.ok(fold('guard').classList.contains('open') && fold('logging').classList.contains('open'));
  assert.deepEqual(
    $$('#toggles .chip input').map((box) => (box as HTMLInputElement).checked),
    [true, true, true],
    "every chip, import's too",
  );

  await key('c');
  assert.equal($$('#code .region.open').length, 0);
  await click(chip('logging'));
  assert.ok(fold('logging').classList.contains('open'));
  assert.ok(!fold('guard').classList.contains('open'));
});

pageTest('the fold level pins the regions scored above it', async () => {
  await click($('#threshold [data-value="0"]'));
  assert.deepEqual(
    $$('#code .region.pinned').map((region) => region.dataset.cat),
    ['guard', 'logging'],
    'both score 1',
  );
  await key(']');
  assert.equal($$('#code .region.pinned').length, 0);
  assert.equal($('#threshold [aria-checked="true"]').dataset.value, '1');
  assert.equal($('#threshold-hint').textContent, 'Level 1 folds import, guard, logging. [ ]');
});

pageTest('the code size: the stepper sets it, the cookie keeps it, and the default keeps none', async () => {
  const codeSize = () => document.documentElement.style.getPropertyValue('--text-code');
  const [smaller, larger] = $$('#code-size .icon-btn');
  assert.equal($('#code-size output').textContent, '12px');
  assert.equal(codeSize(), '', 'at the default the token rules');

  await click(larger);
  await click(larger);
  assert.equal($('#code-size output').textContent, '14px');
  assert.equal(codeSize(), '14px');
  assert.ok(document.cookie.includes('lens-code-size=14'));
  assert.equal($('#code-size-hint').textContent, 'default 12px');

  await click(smaller);
  await click(smaller);
  assert.equal(codeSize(), '');
  assert.ok(!document.cookie.includes('lens-code-size'), 'the default keeps no cookie');

  for (let step = 0; step < 5; step++) await click(smaller);
  assert.ok(document.cookie.includes('lens-code-size=10'));
  assert.equal($('#code-size output').textContent, '10px', 'it stops at the smallest size');
  assert.equal((smaller as HTMLButtonElement).disabled, true);
  await click(larger);
  await click(larger);
});

test('the code size comes back from its cookie', async () => {
  await open({}, '', 'lens-code-size=18; path=/');
  try {
    assert.equal(document.documentElement.style.getPropertyValue('--text-code'), '18px');
    assert.equal($('#code-size output').textContent, '18px');
  } finally {
    await close();
  }
});

pageTest('hunks only: a click shows a hidden stretch, h shows the whole file', async () => {
  await click($$('#code .row.gap')[0]);
  assert.deepEqual(rows().slice(0, 4), ['R1', '4', '5', 'R6']);
  await key('h');
  assert.equal($$('#code .row.gap').length, 0);
  assert.equal($$('#code .row[data-line]').length, 27);
});

pageTest('removed lines show where they were removed; x hides them', async () => {
  await key('x');
  assert.deepEqual(
    rows().filter((row) => row.startsWith('−')),
    [],
  );
  await key('x');
  assert.deepEqual(rows(), HUNKS);
});

pageTest('word diff (d, off by default) marks the words a replaced line changed, in both views', async () => {
  const added = () => $$('#code .row[data-line="10"] .w-add').map((word) => word.textContent);
  assert.deepEqual(added(), [], 'off by default');
  await key('d');
  assert.equal($('#word-diff').getAttribute('aria-checked'), 'true', 'the ⋯ menu switch follows the key');
  assert.equal(localStorage.getItem('lens.wordDiff'), '1', 'remembered');
  // the inserted log line (9) doesn't shift the pair: the old query pairs with the new one
  assert.deepEqual(added(), ['and deleted = 0']);
  assert.equal($$('#code .row[data-line="9"] .w-add').length, 0);
  assert.equal($$('#code .row.removed .w-del').length, 0, 'the old query only gained words');
  await key('x');
  assert.deepEqual(added(), [], 'with the removed lines hidden there is no pair to show');
  await key('x');
  await key('v');
  await key('j');
  assert.deepEqual(
    $$('.unit-code .row[data-line="10"] .w-add').map((word) => word.textContent),
    ['and deleted = 0'],
  );
});

/** The overview ruler's ticks: "add N9" a run of changes from line 9, "del O17" removed lines, "bug N10" a concern */
function ticks(card = '.code-pane'): string[] {
  return $$(card + ' .ruler .tick').map((tick) => tick.className.match(/tick-(\w+)/)![1] + ' ' + tick.dataset.label);
}

pageTest('the ruler ticks the changes by row; a click opens the fold around one and flashes it', async () => {
  // the changed log line (9) is folded: its tick sits at the fold's pill, one run with line 10
  assert.deepEqual(ticks(), ['del O9', 'add N9', 'del O17']);
  const tick = $$('.code-pane .ruler .tick')[1];
  // rows: ⋯ R6 −9 R9 10 … (20 on screen): the run is rows 3–4
  assert.equal(tick.style.top, (3 / 20) * 100 + '%');
  assert.equal(tick.style.height, (2 / 20) * 100 + '%');
  await click(tick);
  assert.ok($('#code .row[data-line="9"]').closest('.region')!.classList.contains('open'));
  assert.ok($('#code .row[data-line="9"]').classList.contains('flash'));
});

pageTest("a unit's ruler ticks its open concerns too; a dismissed one drops off", async () => {
  await key('v');
  await key('j');
  assert.deepEqual(ticks('.unit-card'), ['del O9', 'add N9', 'bug N10']);
  // only a concern's tick takes the concern color (a class match, so "tick-add" can't catch it)
  assert.deepEqual(
    $$('.unit-card .ruler .tick.concern').map((tick) => tick.dataset.label),
    ['N10'],
  );
  await click($('.concern .vbtn.v-dismissed'));
  assert.deepEqual(ticks('.unit-card'), ['del O9', 'add N9']);
});

pageTest('hide tests: t shows the test file, and hiding it again leaves it', async () => {
  await key('t');
  assert.deepEqual(treeFiles(), ['orders.test.ts', 'orders.ts']);
  await click($$('#tree .file').find((file) => file.textContent!.includes('orders.test.ts'))!);
  assert.equal($('.tab.active .tab-name').textContent, 'orders.test.ts');
  await key('t');
  assert.deepEqual(treeFiles(), ['orders.ts']);
  assert.equal($('.tab.active .tab-name').textContent, 'orders.ts', 'the open test file gives way');
});

test('a viewed mark sticks, and survives a reload', async () => {
  await open();
  let saved = '';
  try {
    await key('m');
    assert.ok($('#tree .file').classList.contains('viewed'));
    assert.equal($('#nav .progress-count').textContent, '1 of 1');
    saved = localStorage.getItem('lens.viewedFiles')!;
    assert.match(saved, /src\/orders\.ts@/);
  } finally {
    await close();
  }
  await open({ 'lens.viewedFiles': saved });
  try {
    assert.ok($('#tree .file').classList.contains('viewed'));
  } finally {
    await close();
  }
});

pageTest('the review pill marks the file viewed and opens the next one, stopping at the ends of the tree', async () => {
  const pill = () => $('#review-next').textContent!.trim();
  const open = () => $('.tab.active .tab-name').textContent;
  const prev = () => $('#review-prev') as HTMLButtonElement;
  await key('t'); // the test file shows too, first in the tree: orders.ts is now the last file
  assert.equal($('#nav .progress-count').textContent, '0 of 2');
  assert.equal(pill(), 'Mark viewed', 'the last file: nothing after it to open');
  await key('j');
  assert.equal(open(), 'orders.ts', 'j stops at the last file');
  await click(prev());
  assert.equal(open(), 'orders.test.ts');
  assert.ok(prev().disabled, 'the first file: no Prev');
  await key('k');
  assert.equal(open(), 'orders.test.ts', 'k stops at the first file');
  assert.equal(pill(), 'Viewed · next file');
  await click($('#review-next'));
  assert.equal(open(), 'orders.ts', 'the next file not viewed yet');
  assert.equal($('#nav .progress-count').textContent, '1 of 2');
  assert.equal(pill(), 'Mark viewed');
  await click($('#review-next'));
  assert.equal(pill(), 'All 2 files viewed');
  await click($('#review-undo'));
  await click(prev());
  assert.equal(open(), 'orders.test.ts');
  assert.equal(pill(), 'Viewed', 'already viewed: no mark, Undo and Next instead');
  assert.deepEqual(
    $$('#review-pill button').map((button) => button.textContent!.trim()),
    ['Prev', 'Undo', 'Next'],
  );
});

pageTest('the ⋯ menu holds the view settings', async () => {
  await click($('#hunks-only'));
  assert.equal($('#hunks-only').getAttribute('aria-checked'), 'false');
  assert.equal($$('#code .row.gap').length, 0, 'the whole file');
  await click($('#word-diff'));
  assert.equal($('#word-diff').getAttribute('aria-checked'), 'true');
  assert.equal($$('#code .w-add').length, 1, 'the replaced query marks its new words');
  await click($('#keys-btn'));
  assert.ok(($('#keys-modal') as HTMLDialogElement).open);
});

pageTest("a light theme from the theme menu turns the page light, with the theme's accent", async (page) => {
  assert.equal(document.documentElement.dataset.appearance, 'dark');
  await click($('#theme-github-light'));
  await settle();
  assert.ok(page.requests.some((request) => request.path === '/api/tokens'));
  assert.equal(document.documentElement.dataset.appearance, 'light');
  assert.equal(
    document.documentElement.style.getPropertyValue('--theme-accent'),
    (lightTokens as { accent: string }).accent,
  );
  // kept where the server reads it: the next launch's page arrives in this theme
  assert.ok(document.cookie.includes('lens-theme=github-light'));
});

pageTest(
  "tokens from another analysis aren't put under this page's files: it takes that analysis whole",
  async (page) => {
    // another tab refreshed, or the server restarted: its files aren't this page's anymore
    page.tokensAnalysis = 'run:2';
    const firstLine = $('#code .row[data-line]').textContent;
    await click($('#theme-github-light'));
    await settle();
    assert.ok(page.requests.some((request) => request.path === '/api/tokens'));
    assert.ok(
      page.requests.some((request) => request.path === '/api/refresh'),
      'a refresh instead',
    );
    // the stub's refresh answers the dark payload: the light tokens were never applied
    assert.equal(document.documentElement.dataset.appearance, 'dark');
    assert.equal($('#code .row[data-line]').textContent, firstLine);
  },
);

// ---- the status bar ----

/** What the status bar says: its kind, its label and the detail after it. */
function status(): { kind: string; label: string; detail: string } {
  return {
    kind: $('#status').className.replace('status status-', ''),
    label: $('#status .status-label').textContent!,
    detail: document.querySelector('#status .status-detail')?.textContent ?? '',
  };
}
const REST = { kind: 'idle', label: 'Ready', detail: '' };
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Answers the requests `answer` returns something for; the page's stub answers the rest. Returns the undo. */
function answering(answer: (path: string) => Response | Promise<Response> | undefined): () => void {
  const stub = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
    const reply = answer(new URL(String(input), 'http://127.0.0.1:5326').pathname);
    return reply === undefined ? stub(input, init) : reply;
  }) as typeof fetch;
  return () => (globalThis.fetch = stub);
}

pageTest('the status bar says what is running once it has run a moment, then rests again', async () => {
  assert.deepEqual(status(), REST);
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  const stub = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
    if (String(input).includes('/api/tokens')) await held;
    return stub(input, init);
  }) as typeof fetch;
  await click($('#theme-github-light'));
  assert.deepEqual(status(), REST, 'a quick action never shows');
  assert.equal(($('#theme-github-light') as HTMLButtonElement).disabled, true, 'its control waits at once');
  await pause(220);
  assert.deepEqual(status(), { kind: 'working', label: 'Applying github-light…', detail: '' });
  release();
  await settle();
  await settle();
  assert.deepEqual(status(), REST, 'the page turning light is the confirmation');
  assert.equal(document.documentElement.dataset.appearance, 'light');
});

pageTest("a failed refresh stays in the status bar, with the server's reason, until it's dismissed", async () => {
  const undo = answering((path) =>
    path === '/api/refresh'
      ? new Response(JSON.stringify({ error: "fatal: bad revision 'main...feature'" }), { status: 500 })
      : undefined,
  );
  await key('r');
  await settle();
  const failed = { kind: 'failed', label: 'Refresh failed', detail: "fatal: bad revision 'main...feature'" };
  assert.deepEqual(status(), failed);
  await pause(120);
  assert.deepEqual(status(), failed, "a failure doesn't fade");
  assert.equal(($('#refresh') as HTMLButtonElement).disabled, false, 'refresh can be tried again');
  assert.equal($('#status-action').textContent, 'Dismiss');
  await click($('#status-action'));
  assert.deepEqual(status(), REST);
  // the next action clears a failure too
  await key('r');
  await settle();
  assert.equal(status().kind, 'failed');
  undo();
  await key('r');
  await settle();
  assert.deepEqual(status(), { kind: 'done', label: 'Refreshed', detail: 'nothing changed' });
});

pageTest('a server that stopped shows in the status bar until a request gets through', async () => {
  const undo = answering(() => Promise.reject(new TypeError('fetch failed')));
  await key('r');
  await settle();
  assert.equal(status().kind, 'gone');
  assert.equal(status().label, 'Server stopped');
  assert.equal($('#status-action').textContent, 'Retry');
  await click($('#status-action'));
  await settle();
  assert.equal(status().kind, 'gone', 'still not there');
  undo();
  await click($('#status-action'));
  await settle();
  assert.deepEqual(status(), REST, 'lens is back');
});

pageTest('a refresh says how many files it changed', async () => {
  const edited = structuredClone(payload);
  edited.files[0].source += '\n// edited';
  const undo = answering((path) => (path === '/api/refresh' ? new Response(JSON.stringify(edited)) : undefined));
  await key('r');
  await settle();
  assert.deepEqual(status(), { kind: 'done', label: 'Refreshed', detail: '1 file changed' });
  undo();
});

pageTest('a standing notice shows only while it has something to say, and leads to it', async () => {
  const notices = () => $$('#status-bar .status-notices > *').map((notice) => notice.textContent);
  assert.deepEqual(notices(), []);
  // the agent submitted a summary while the reader was away
  const undo = answering((path) =>
    path === '/api/stamp'
      ? new Response(JSON.stringify({ summary: payload.summary!.stamp! + 1, change: payload.changeStamp }))
      : undefined,
  );
  window.dispatchEvent(new Event('focus'));
  await settle();
  undo();
  assert.deepEqual(notices(), ['New summary waiting']);
  await click($('#status-bar .status-notice'));
  await settle();
  assert.ok($('#summary-pane .sum-headline'), 'the Summary tab, with the summary loaded');
  assert.deepEqual(notices(), []);
  assert.deepEqual(status(), { kind: 'done', label: 'New summary loaded', detail: '' });
});

pageTest(
  'code that changed on disk shows as a notice: undoing the change takes it back, a click refreshes',
  async () => {
    const notices = () => $$('#status-bar .status-notices > *').map((notice) => notice.textContent);
    assert.ok(payload.changeStamp, 'a diff has a fingerprint');
    let change = 'the fingerprint after an edit';
    const undo = answering((path) =>
      path === '/api/stamp' ? new Response(JSON.stringify({ summary: payload.summary!.stamp, change })) : undefined,
    );
    // the page asks when its window gets the focus, as it does every few seconds while in sight
    window.dispatchEvent(new Event('focus'));
    await settle();
    assert.deepEqual(notices(), ['Code changed on disk · Refresh']);
    change = payload.changeStamp!; // the edit was undone
    window.dispatchEvent(new Event('focus'));
    await settle();
    assert.deepEqual(notices(), [], 'the notice is only there while it is true');
    change = 'the fingerprint after another edit';
    window.dispatchEvent(new Event('focus'));
    await settle();
    undo();
    await click($('#status-bar .status-notice'));
    await settle();
    assert.deepEqual(notices(), []);
    assert.deepEqual(status(), { kind: 'done', label: 'Refreshed', detail: 'nothing changed' });
  },
);

pageTest('a refresh brings the newest summary: none is left waiting', async () => {
  const notices = () => $$('#status-bar .status-notices > *').map((notice) => notice.textContent);
  const undo = answering((path) =>
    path === '/api/stamp'
      ? new Response(JSON.stringify({ summary: payload.summary!.stamp! + 1, change: payload.changeStamp }))
      : undefined,
  );
  window.dispatchEvent(new Event('focus'));
  await settle();
  undo();
  assert.deepEqual(notices(), ['New summary waiting']);
  await key('r');
  await settle();
  assert.deepEqual(notices(), []);
  assert.equal(document.querySelector('#summary-dot'), null);
});

test("the page the server sends carries its theme's colors on <html>, before any script runs", () => {
  const light = lightTokens as { fg: string; bg: string; accent: string };
  const html = renderPage('<html lang="en"/*__LENS_ROOT__*/><script>/*__LENS_DATA__*/</script>', {
    ...payload,
    ...{ fg: light.fg, bg: light.bg, accent: light.accent },
  });
  assert.ok(
    html.startsWith(
      `<html lang="en" data-appearance="light" style="--code-fg:${light.fg};--code-bg:${light.bg};--theme-accent:${light.accent}">`,
    ),
  );
  assert.ok(renderPage('<html/*__LENS_ROOT__*/>', payload).startsWith('<html data-appearance="dark"'));
});

pageTest(
  '/ shows a collapsed sidebar, remembers it, and focuses the filter',
  async () => {
    assert.equal($('#nav').style.display, 'none');
    await key('/');
    assert.equal($('#nav').style.display, '');
    assert.equal(localStorage.getItem('lens.navCollapsed'), '0');
    assert.equal(document.activeElement, $('#file-filter'));
  },
  { 'lens.navCollapsed': '1' },
);

pageTest('? opens the shortcuts in tabs: Global, Code and Summary', async () => {
  await key('?');
  assert.ok(($('#keys-modal') as HTMLDialogElement).open);
  const tabs = () =>
    $$('#key-tabs [role="tab"]').map(
      (tab) => tab.textContent + (tab.getAttribute('aria-selected') === 'true' ? '*' : ''),
    );
  const keys = () => $$('#keys-modal tr td:first-child').map((cell) => cell.textContent);
  assert.deepEqual(tabs(), ['Global*', 'Code', 'Summary']);
  // each key its own keycap: ⌘P is ⌘ and P
  const search = $$('#keys-modal tr td:first-child').find((cell) => cell.textContent!.includes('Ctrl'))!;
  assert.deepEqual(
    [...search.querySelectorAll('kbd')].map((cap) => cap.textContent),
    ['⌘', 'P', 'Ctrl', 'P'],
  );
  await click($('#key-tabs [data-value="summary"]'));
  assert.deepEqual(tabs(), ['Global', 'Code', 'Summary*']);
  assert.deepEqual(keys(), ['g', 'j / k', 'o', 'm', '/']);
});

pageTest('search lists where a name is defined, then its usages; Enter jumps, even into a hidden stretch', async () => {
  await key('p', { ctrlKey: true });
  assert.ok(($('#search-modal') as HTMLDialogElement).open);
  await type($('#search-input'), 'toOrder');
  assert.deepEqual(
    $$('#search-results > div').map((row) => row.textContent),
    [
      'Defined at · 1',
      '14function · src/orders.tsfunction toOrder(row: any): Order {',
      'src/orders.ts · 1',
      '11return rows.map(toOrder);',
    ],
    'the declaring line is a definition, not also a usage',
  );
  fireEvent.keyDown($('#search-input'), { key: 'Enter' });
  await settle();
  assert.ok(!($('#search-modal') as HTMLDialogElement).open);
  assert.ok($('#code .row[data-line="14"]').classList.contains('flash'), 'line 14 was hidden: its stretch opened');
});

pageTest('the row a jump lands on stays marked after the flash, until the next jump', async () => {
  const landed = () => $$('#code .row.landed').map((row) => row.dataset.line ?? '−' + row.dataset.old);
  await key('p', { ctrlKey: true });
  await type($('#search-input'), 'toOrder');
  fireEvent.keyDown($('#search-input'), { key: 'Enter' });
  await settle();
  assert.deepEqual(landed(), ['14']);
  await key('e'); // the rows re-render: the mark is state, so it stays
  assert.deepEqual(landed(), ['14']);
  await click($$('.code-pane .ruler .tick')[0]);
  assert.deepEqual(landed(), ['−9'], 'a ruler jump moves it');
  await key('v');
  await key('j');
  assert.equal($$('.unit-code .row.landed').length, 1, 'the unit shows the same file: the mark is there too');
  await click($('.cite'));
  assert.equal($$('.unit-code .row.landed').length, 1, 'a cite moves it');
});

pageTest('tabs: a double-click keeps a tab, w closes the active one, and a refresh keeps them', async (page) => {
  await key('t');
  fireEvent.dblClick($$('#tree .file').find((file) => file.textContent!.includes('orders.test.ts'))!);
  await settle();
  assert.deepEqual(
    $$('.tab .tab-name').map((tab) => tab.textContent),
    ['orders.ts', 'orders.test.ts'],
  );
  await click($('#refresh'));
  await settle();
  assert.ok(page.requests.some((request) => request.path === '/api/refresh'));
  assert.deepEqual(
    $$('.tab .tab-name').map((tab) => tab.textContent),
    ['orders.ts', 'orders.test.ts'],
  );
  assert.equal($('.tab.active .tab-name').textContent, 'orders.test.ts');
  await key('w');
  assert.deepEqual(
    $$('.tab .tab-name').map((tab) => tab.textContent),
    ['orders.ts'],
  );
});

// ---- the Summary tab ----

pageTest(
  'the Summary tab lists the changes, flagged first, and opens on the overview',
  async () => {
    assert.equal($('#summary-pane').style.display, '');
    assert.deepEqual(
      $$('.sum-item .name').map((name) => name.textContent),
      ['findOrders', 'legacyTotal'],
      "the test file's unit hides with the tests",
    );
    assert.equal($('.progress .legend').textContent, '2 flagged');
    assert.ok($('.sum-overview-item').classList.contains('active'));
    assert.deepEqual(
      $$('.ov-stat').map((stat) => stat.textContent),
      ['1 possible bug', '1 question'],
    );
  },
  {},
  '#summary',
);

test('with nothing summarized, the Summary tab opens on the overview: what to run, the list and the pill', async () => {
  const fresh = payload.summary!;
  payload.summary = { ...fresh, units: fresh.units.map((unit) => ({ ...unit, summary: null })) };
  try {
    await open();
    await key('v');
    await settle();
    assert.equal($('#summary-pane .sum-headline').textContent, 'The changes');
    const how = $('#no-summary');
    assert.equal(how.querySelector('.ov-what-label')!.textContent, 'Agent summary');
    assert.deepEqual(
      [...how.querySelectorAll('.copy-cmd-text')].map((command) => command.textContent),
      [fresh.command, fresh.cli],
      'the skill, and the same for an agent without it',
    );
    // the changes can be read without a summary, right away
    assert.equal($('#review-next').textContent!.trim(), 'Start review');
    await click($('#review-next'));
    assert.ok($('#summary-pane').dataset.unit, 'a change is open');
    await key('g');
    assert.ok($('#no-summary'), 'back on the overview, the same page');
  } finally {
    payload.summary = fresh;
    await close();
  }
});

test('a summary submitted after the page loaded: the overview doesn\'t say "not written yet" while it fetches it', async () => {
  const fresh = payload.summary!;
  // the page loaded before the agent's submit: no unit summarized yet
  payload.summary = { ...fresh, stamp: 1, units: fresh.units.map((unit) => ({ ...unit, summary: null })) };
  try {
    await open();
    payload.summary = { ...fresh, stamp: 2 }; // the server now has the submit
    const realFetch = globalThis.fetch;
    let release = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
      if (String(input).includes('/api/stamp')) await held;
      return realFetch(input, init);
    }) as typeof fetch;
    await key('v');
    assert.equal($('#summary-pane .sum-headline').textContent, 'The changes', 'the overview is there already');
    assert.equal($$('#no-summary').length, 0, 'no "not written yet" while the stamp is checked');
    release();
    await settle();
    assert.equal($$('#no-summary').length, 0);
    assert.equal($('#summary-pane .sum-headline').textContent, 'The changes', 'the overview, with the new summary');
  } finally {
    payload.summary = fresh;
    await close();
  }
});

pageTest('on the Summary tab the pill starts the review, and marks each change reviewed on the way', async () => {
  const pill = () => $('#review-next').textContent!.trim();
  await key('v');
  assert.equal(pill(), 'Start review');
  await click($('#review-next'));
  assert.equal($('.sum-headline').textContent, 'findOrders skips deleted orders');
  assert.equal(pill(), 'Reviewed · next change');
  await click($('#review-next'));
  assert.equal($('.sum-item.active .name').textContent, 'legacyTotal');
  assert.equal($('#nav .progress-count').textContent, '1 of 2');
  assert.equal($('.sum-item:not(.active) .viewed-box').getAttribute('aria-checked'), 'true');
});

test('a flow is its name: the priority only orders it, and a P3 flow starts folded', async () => {
  const summary = payload.summary!;
  const id = (name: string) => summary.units.find((unit) => unit.name === name)!.id;
  summary.flows = [
    {
      title: 'Order cleanup',
      path: 'repo',
      priority: 3,
      units: { [id('findOrders')]: 'repo', [id('legacyTotal')]: 'repo' },
    },
  ];
  await open();
  try {
    await key('v');
    const title = () => $('.sum-section-title.flow .t').textContent;
    const count = () => $$('.sum-section-title.flow .sub')[0]?.textContent?.trim() ?? null;
    assert.deepEqual([title(), count()], ['Order cleanup', '2 changes'], 'folded: the name and its count');
    assert.equal($$('.sum-section-title .prio').length, 0, 'no P3 tag');
    await click($('.sum-section-title.flow'));
    assert.deepEqual([title(), count()], ['Order cleanup', null]);
    assert.equal($$('.sum-section:not(.folded) .sum-item').length, 2);
    assert.equal($$('.sum-section:not(.folded) .sum-item .side').length, 0, 'no layer labels');
  } finally {
    summary.flows = [];
    await close();
  }
});

pageTest("a unit's code has the Code view's folds, hunks and toolbar keys", async () => {
  await key('v');
  await key('j');
  assert.equal($('.sum-headline').textContent, 'findOrders skips deleted orders');
  // the card's header says where the unit is: no path line over the headline
  assert.equal($$('.sum-inner .kicker').length, 0);
  assert.equal($('.unit-card .code-path').textContent, 'src/orders.tsfindOrders');
  const code = '.unit-code .code';
  // hunks only: line 5 is far from the changes and the cited line
  assert.deepEqual(rows(code), ['⋯', 'R6', '−9', 'R9', '10', '11', '12']);
  assert.deepEqual(
    $$('#toggles .chip').map((chip) => chip.textContent),
    ['guard', 'logging'],
    "the chips are the unit's folds",
  );
  await key('e');
  assert.equal($$(code + ' .region.open').length, 2);
  await key('h');
  assert.deepEqual(rows(code), ['5', 'R6', '−9', 'R9', '10', '11', '12']);
  await key('x');
  assert.deepEqual(rows(code), ['5', 'R6', 'R9', '10', '11', '12']);
});

pageTest("a concern sits under its line; dismissing it drops the note and the unit's flag", async () => {
  await key('v');
  await key('j');
  const line = $('.unit-code .row[data-line="10"]');
  assert.ok(line.classList.contains('cited') && line.classList.contains('flagged') && line.classList.contains('k-bug'));
  assert.ok(line.nextElementSibling!.classList.contains('inline-note'));
  assert.ok($('.sum-item.active .sig-bug'));

  await click($('.concern .vbtn.v-dismissed'));
  assert.equal($$('.inline-note').length, 0);
  assert.ok($('.concern').classList.contains('dismissed'));
  assert.equal($('.progress .legend').textContent, '1 flagged');
  assert.equal($$('.sum-item.active .sig').length, 0);
  assert.match(localStorage.getItem('lens.concernMarks')!, /dismissed/);
});

pageTest("a verdict doesn't move the list: the order stays, and a signal filter keeps the open unit", async () => {
  // the list's names, the open unit marked ">"
  const listed = () =>
    $$('.sum-item').map(
      (item) => (item.classList.contains('active') ? '>' : '') + item.querySelector('.name')!.textContent,
    );
  await key('v');
  await key('j');
  assert.deepEqual(listed(), ['>findOrders', 'legacyTotal']);
  await click($('.concern .vbtn.v-dismissed'));
  assert.deepEqual(listed(), ['>findOrders', 'legacyTotal'], 'no longer flagged, but it keeps its place');

  await click($('.concern .vbtn.v-dismissed')); // restore
  await click($('.sig-chip[data-sig="any"]'));
  await click($('.concern .vbtn.v-dismissed'));
  assert.equal($('.sig-chip[data-sig="any"]').getAttribute('aria-pressed'), 'true', 'legacyTotal keeps the filter on');
  assert.deepEqual(listed(), ['>findOrders', 'legacyTotal'], 'the open unit stays listed under it');
});

pageTest('a dismissed chip lists the changes whose concerns the reader dismissed', async () => {
  await key('v');
  await key('j');
  assert.equal($$('.sig-chip[data-sig="dismissed"]').length, 0, 'nothing dismissed yet');
  await click($('.concern .vbtn.v-dismissed'));
  assert.equal($('.sig-chip[data-sig="dismissed"] .n').textContent, '1');
  await click($('.sig-chip[data-sig="dismissed"]'));
  assert.deepEqual(
    $$('.sum-item .name').map((name) => name.textContent),
    ['findOrders'],
  );
  await click($('.concern .vbtn.v-dismissed')); // restore: nothing is dismissed, the filter lifts
  assert.equal($$('.sig-chip[data-sig="dismissed"]').length, 0);
  assert.deepEqual(
    $$('.sum-item .name').map((name) => name.textContent),
    ['findOrders', 'legacyTotal'],
  );
});

pageTest('hovering a When row tints the line it cites, until the pointer leaves the row or the tab', async () => {
  await key('v');
  await key('j');
  const cited = () => $('.unit-code .row[data-line="10"]').classList.contains('hover-cite');
  fireEvent.mouseOver($('.scn'));
  await settle();
  assert.ok(cited());
  fireEvent.mouseOut($('.scn'));
  await settle();
  assert.ok(!cited());
  fireEvent.mouseOver($('.scn'));
  await settle();
  await key('v');
  await key('v');
  assert.ok(!cited(), 'the unit page starts afresh');
});

pageTest('a deleted unit is its removed lines; o opens a unit in the code view', async () => {
  await key('v');
  await key('j');
  await key('j');
  assert.equal($('.sum-item.active .name').textContent, 'legacyTotal');
  assert.deepEqual(rows('.unit-code .code'), ['−17', '−18', '−19', '−20']);
  await key('k');
  await key('o');
  assert.equal($('main').style.display, '', 'back on the code view');
  assert.ok($('#code .row[data-line="9"]').classList.contains('flash'), "at the unit's first changed line");
});

// ---- the Ask rail ----

pageTest('Ask without an agent copies the question as a prompt', async (page) => {
  await key('\\');
  assert.equal($('#ask-rail').style.display, '');
  assert.equal($('#ask-chips').textContent, 'orders.ts');
  assert.equal($('#ask-send').textContent, 'Copy as prompt');
  await type($('#ask-input'), 'why the deleted column?');
  await click($('#ask-send'));
  const sent = page.requests.find((request) => request.path === '/api/ask/prompt')!;
  assert.deepEqual(sent.body, {
    text: 'why the deleted column?',
    file: 'src/orders.ts',
    unitId: null,
    label: 'orders.ts',
    selection: null,
    concerns: [],
  });
  assert.equal($('#ask-send').textContent!.trim(), 'Copied');
  assert.equal(($('#ask-input') as HTMLTextAreaElement).value, 'why the deleted column?', 'the question stays');
});

pageTest('a command to run copies on click, and its icon turns into a check', async () => {
  await key('\\');
  const command = $('.ask-empty .copy-cmd');
  assert.equal(command.textContent, '/lens-ask');
  await click(command);
  assert.equal(await navigator.clipboard.readText(), '/lens-ask');
  assert.ok(command.classList.contains('copied'));
  assert.ok(command.querySelector('.lucide-check'));
});

pageTest('Ask with an agent listening sends the question with the selected lines', async (page) => {
  page.ask = { listening: true, questions: [] };
  await key('\\');
  const range = document.createRange();
  range.setStart($('#code .row[data-line="10"]'), 0);
  range.setEnd($('#code .row[data-line="11"]').lastElementChild!, 1);
  document.getSelection()!.removeAllRanges();
  document.getSelection()!.addRange(range);
  document.dispatchEvent(new Event('selectionchange'));
  await settle();
  assert.equal($('#ask-chips').textContent, 'orders.tssrc/orders.ts:10–11');
  assert.ok($('#code .row[data-line="10"]').classList.contains('ask-sel'));
  assert.equal($('#ask-send').textContent, 'Ask');
  await type($('#ask-input'), 'what if userId is empty?');
  await click($('#ask-send'));
  const sent = page.requests.find((request) => request.method === 'POST' && request.path === '/api/ask')!;
  const body = sent.body as { selection: { lines: { n: number }[] } };
  assert.deepEqual(
    body.selection.lines.map((line) => line.n),
    [10, 11],
  );
  assert.equal(($('#ask-input') as HTMLTextAreaElement).value, '', "the input clears once it's sent");
});

pageTest('the Ask selection takes the lines it holds text of, not the rows its ends sit in', async () => {
  await key('\\');
  const select = async (start: Node, startOffset: number, end: Node, endOffset: number) => {
    const range = document.createRange();
    range.setStart(start, startOffset);
    range.setEnd(end, endOffset);
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
    await settle();
  };
  const row = (selector: string) => $('#code ' + selector);
  const code = (selector: string) => row(selector).lastElementChild!;
  const line10 = code('.row[data-line="10"]');

  // a double-click past line 10's end selects its line break, which ends at the start of row 11
  await select(line10, line10.childNodes.length, row('.row[data-line="11"]'), 0);
  assert.equal($('#ask-chips').textContent, 'orders.tssrc/orders.ts:10');
  // a triple-click: the line and its break
  await select(line10, 0, row('.row[data-line="11"]'), 0);
  assert.equal($('#ask-chips').textContent, 'orders.tssrc/orders.ts:10');
  assert.deepEqual(
    $$('#code .row.ask-sel').map((selected) => selected.dataset.line),
    ['10'],
  );

  // a slipped click on a fold's pill selects some of its text: that is no code
  const pill = $('#code .region .pill').lastChild!;
  await select(pill, 0, pill, 3);
  assert.equal($('#ask-chips').textContent, 'orders.ts');
  assert.equal($$('#code .row.ask-sel').length, 0);

  // a drag over a closed fold takes its lines, and so does one that ends on its pill
  const removed = code('.row[data-old="9"]');
  await select(removed, 0, line10, 1);
  assert.equal($('#ask-chips').textContent, 'orders.tssrc/orders.ts:9–10');
  const logPill = row('.row[data-old="9"]').nextElementSibling!.querySelector('.pill')!.lastChild!;
  await select(removed, 0, logPill, 2);
  assert.equal($('#ask-chips').textContent, 'orders.tssrc/orders.ts:9');
});

pageTest('a question about a unit takes its open concerns along; a dismissed one stays behind', async (page) => {
  page.ask = { listening: true, questions: [] };
  await key('v');
  await key('j');
  await key('\\');
  assert.equal($('#ask-chips').textContent, 'findOrders1 concern');
  const sentConcerns = () =>
    (
      page.requests.filter((request) => request.method === 'POST' && request.path === '/api/ask').at(-1)!
        .body as AskQuestion
    ).concerns;
  await type($('#ask-input'), 'is the risk real?');
  await click($('#ask-send'));
  assert.deepEqual(sentConcerns(), [{ kind: 'bug', text: 'deleted is a string column', line: 'N10' }]);

  await click($('.concern .vbtn.v-dismissed'));
  assert.equal($('#ask-chips').textContent, 'findOrders');
  await type($('#ask-input'), 'and now?');
  await click($('#ask-send'));
  assert.deepEqual(sentConcerns(), []);
});

pageTest('Code | Summary is one switch: the picked view is checked, and a click or v moves it', async () => {
  const picked = () => $('#view-switch [aria-checked="true"]').id;
  assert.equal($('#view-switch').getAttribute('role'), 'radiogroup');
  assert.equal(picked(), 'view-code');
  await click($('#view-summary'));
  assert.equal(picked(), 'view-summary');
  await key('v');
  assert.equal(picked(), 'view-code');
});

pageTest('the tree filter offers its clear button only while there is text, and it empties the filter', async () => {
  const files = treeFiles().length;
  assert.equal(document.querySelector('#filter-clear'), null);
  await type($('#file-filter'), 'no such file');
  assert.equal(treeFiles().length, 0);
  await click($('#filter-clear'));
  assert.equal(($('#file-filter') as HTMLInputElement).value, '');
  assert.equal(treeFiles().length, files);
  assert.equal(document.querySelector('#filter-clear'), null);
});

pageTest("a tab closes from its button, which is the design system's icon button", async () => {
  const close = $('#tabbar .tab .tab-close');
  assert.ok(close.classList.contains('icon-btn'));
  assert.equal(close.getAttribute('aria-label'), 'close');
  await click(close);
  assert.equal($$('#tabbar .tab').length, 0);
});

pageTest("the shortcuts' tabs sit above the scrolling keys, not in them", async () => {
  await key('?');
  assert.equal($('.key-tabs').closest('.modal-body'), null);
  assert.ok($('#keys-modal .modal-body .set-table'));
});

pageTest(
  "a refresh that changes the file drops the selection kept in it: its lines aren't the code's anymore",
  async () => {
    await key('\\');
    const range = document.createRange();
    range.setStart($('#code .row[data-line="10"]'), 0);
    range.setEnd($('#code .row[data-line="11"]').lastElementChild!, 1);
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
    await settle();
    // the same code again: the selection stays
    await key('r');
    await settle();
    assert.equal($('#ask-chips').textContent, 'orders.tssrc/orders.ts:10–11');
    const edited = structuredClone(payload);
    const orders = edited.files.find((file) => file.file === 'src/orders.ts')!;
    orders.source = '// edited\n' + orders.source;
    const undo = answering((path) => (path === '/api/refresh' ? new Response(JSON.stringify(edited)) : undefined));
    await key('r');
    await settle();
    undo();
    assert.equal($('#ask-chips').textContent, 'orders.ts');
    assert.equal($$('#code .row.ask-sel').length, 0);
  },
);

pageTest('a question with no agent to answer it says so, instead of counting the wait', async (page) => {
  const question = {
    id: 'q1',
    text: 'why the deleted column?',
    file: 'src/orders.ts',
    unitId: null,
    label: 'orders.ts',
    hash: 'h1',
    selection: null,
    concerns: [],
    askedAt: Date.now() - 90_000,
    handedAt: null,
    answer: null,
    stale: false,
  };
  page.ask = { listening: false, questions: [question] };
  await key('\\');
  assert.equal(
    $('.ask-noagent').textContent,
    'No agent is listening. Run /lens-ask in your agent to get this answered.',
  );
  assert.equal(document.querySelector('.ask-wait'), null, 'no spinner and no wait time');
  assert.equal(document.querySelector('.ask-lines'), null, 'and no answer on its way');
  assert.deepEqual(status(), {
    kind: 'waiting',
    label: 'No agent for your question',
    detail: 'run /lens-ask in your agent',
  });

  // an agent starts listening: the next poll (here, the rail opening again) shows the wait
  page.ask = { listening: true, questions: [question] };
  await key('\\');
  await key('\\');
  assert.match($('.ask-wait').textContent!, /^waiting for agent · \d+s$/);
  assert.equal(document.querySelectorAll('.ask-lines .skeleton').length, 3, "the answer's place, while one is written");
  assert.equal(document.querySelector('.ask-noagent'), null);
  assert.equal(status().label, 'Waiting for your agent');
});

pageTest('⏻ end stops the server and leaves a note', async (page) => {
  await click($('#end-session'));
  assert.ok(page.requests.some((request) => request.method === 'POST' && request.path === '/api/shutdown'));
  // (screen binds to the document at import, before happy-dom is there)
  assert.equal(within(document.body).getByText(/Session ended/).className, 'ended');
});
