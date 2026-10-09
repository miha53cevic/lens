// The viewer page itself: the real bundle (bundle.ts) running in happy-dom on a real
// analysis of a fixture repo, driven like a reader would — clicks, keys, typing.
// Type-checked by tsconfig.viewer.json (it needs the DOM types).

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { fireEvent, within } from '@testing-library/dom';
import { analyze } from '../src/analyze.ts';
import { loadConfig } from '../src/config.ts';
import { bundleViewer } from '../src/render/web/bundle.ts';
import { highlightFiles, viewerPayload, type ViewerPayload } from '../src/render/web/server.ts';
import { themeSwatch } from '../src/render/highlight.ts';
import { writeStored, type StoredSummary } from '../src/summary/store.ts';
import type { AskState } from '../src/ask/session.ts';
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
}

/** Opens the viewer on the payload, with these localStorage entries already there. */
async function open(prefs: Record<string, string> = {}, hash = ''): Promise<Page> {
  GlobalRegistrator.register({ url: 'http://127.0.0.1:5326/' + hash, width: 1400, height: 900 });
  const page: Page = { requests: [], ask: { listening: false, questions: [] } };
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
      case 'GET /api/summary/stamp':
        return reply({ stamp: payload.summary!.stamp });
      case 'GET /api/summary':
        return reply(payload.summary);
      case 'GET /api/refresh':
        return reply(payload);
      case 'GET /api/tokens':
        return reply(lightTokens);
      case 'POST /api/shutdown':
        return reply({ ok: true });
    }
    return new Response('{}', { status: 404 });
  }) as typeof fetch;
  for (const [key, value] of Object.entries(prefs)) localStorage.setItem(key, value);
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
    $$('.key-tab').map((tab) => tab.textContent + (tab.getAttribute('aria-selected') === 'true' ? '*' : ''));
  const keys = () => $$('#keys-modal tr td:first-child').map((cell) => cell.textContent);
  assert.deepEqual(tabs(), ['Global*', 'Code', 'Summary']);
  // each key its own keycap: ⌘P is ⌘ and P
  const search = $$('#keys-modal tr td:first-child').find((cell) => cell.textContent!.includes('Ctrl'))!;
  assert.deepEqual(
    [...search.querySelectorAll('kbd')].map((cap) => cap.textContent),
    ['⌘', 'P', 'Ctrl', 'P'],
  );
  await click($('.key-tab[data-tab="summary"]'));
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

test('a summary submitted after the page loaded: the tab doesn\'t say "No summary yet" while it fetches it', async () => {
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
      if (String(input).includes('/api/summary/stamp')) await held;
      return realFetch(input, init);
    }) as typeof fetch;
    await key('v');
    assert.equal($$('#summary-pane .sum-empty').length, 0, 'no "No summary yet" while the stamp is checked');
    release();
    await settle();
    assert.equal($$('#summary-pane .sum-empty').length, 0);
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
  range.setEnd($('#code .row[data-line="11"]'), 1);
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

pageTest('⏻ end stops the server and leaves a note', async (page) => {
  await click($('#end-session'));
  assert.ok(page.requests.some((request) => request.method === 'POST' && request.path === '/api/shutdown'));
  // (screen binds to the document at import, before happy-dom is there)
  assert.equal(within(document.body).getByText(/Session ended/).className, 'ended');
});
