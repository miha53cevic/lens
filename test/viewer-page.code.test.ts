/// <reference types="bun" />
// The viewer page: the Code view: folds, hunks, side by side, the tree, tabs, keys.
// The harness is test/fixtures/viewerPage.ts.

import { test } from 'bun:test';
import { fireEvent } from '@testing-library/dom';
import assert from 'node:assert/strict';
import {
  payload,
  lightTokens,
  withMarks,
  postedMarks,
  postedView,
  open,
  close,
  settle,
  key,
  click,
  type,
  $,
  $$,
  rows,
  treeFiles,
  pageTest,
  HUNKS,
  splitRows,
  selectRows,
  ticks,
  usePage,
} from './fixtures/viewerPage.ts';

usePage();

pageTest('the page opens on the first file of the tree, folded, hunks only', async () => {
  assert.deepEqual(treeFiles(), ['orders.ts'], 'hide tests is on by default');
  assert.equal($('[data-part="tab"][data-active] [data-part="tab-name"]').textContent, 'orders.ts');
  assert.deepEqual(rows(), HUNKS);
  assert.deepEqual(
    $$('#code .row.gap').map((gap) => gap.lastElementChild!.textContent),
    ['⋯ 5 unchanged lines', '⋯ 1 unchanged line', '⋯ 7 unchanged lines'],
  );
  // the code card's header: the file's status, its path, the lines the diff added and removed
  assert.equal($('[data-part="code-head"] [data-part="status-badge"]').textContent, 'MModified');
  assert.equal($('[data-part="code-head"] [data-part="code-path"]').textContent, 'src/orders.ts');
  assert.equal($('[data-part="code-head"] [data-part="counts"]').textContent, '+2−5');
  assert.equal($('#tree [data-part="file"] [data-part="status-letter"]').textContent, 'M');
  assert.equal($('#nav [data-part="progress-count"]').textContent, '0 of 1');
});

pageTest('a shortcut drops the focus a click left, so no ring stays on it; other keys keep it', async () => {
  const file = $('#tree [data-part="file"]');
  file.focus();
  await key('Enter');
  assert.equal(document.activeElement, file, 'Enter still presses what has the focus');
  await key('e');
  assert.equal(document.activeElement, document.body);
});

pageTest('a fold opens on a click; expand all, collapse all and a fold chip act on all of them', async () => {
  const fold = (category: string) => $(`#code .region[data-cat="${category}"]`);
  const chip = (category: string) =>
    $$('#toggles [data-part="chip"]')
      .find((candidate) => candidate.textContent === category)!
      .querySelector('input')!;
  await click(fold('guard').querySelector('.pill-row')!);
  assert.ok(fold('guard').classList.contains('open'));
  assert.ok(!fold('logging').classList.contains('open'));

  await key('e');
  assert.ok(fold('guard').classList.contains('open') && fold('logging').classList.contains('open'));
  assert.deepEqual(
    $$('#toggles [data-part="chip"] input').map((box) => (box as HTMLInputElement).checked),
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
  await click($('#threshold [data-value="1"]'));
  assert.equal($$('#code .region.pinned').length, 0);
  assert.equal($('#threshold [aria-checked="true"]').dataset.value, '1');
  assert.equal($('#threshold-hint').textContent, 'Level 1 folds import, guard, logging.');
});

pageTest(
  "the fold level is kept with the config's it was picked over, and the config's keeps nothing",
  async (page) => {
    assert.equal(payload.config.foldLevel, 1);
    await click($('#threshold [data-value="0"]'));
    assert.deepEqual(postedView(page).at(-1), { foldLevel: { level: 0, base: 1 } });
    await click($('#threshold [data-value="1"]'));
    assert.deepEqual(postedView(page).at(-1), { foldLevel: null });
  },
);

pageTest(
  'a reopened viewer comes back at the fold level the reader picked',
  async () => {
    assert.equal($('#threshold [aria-checked="true"]').dataset.value, '0');
    assert.deepEqual(
      $$('#code .region.pinned').map((region) => region.dataset.cat),
      ['guard', 'logging'],
    );
  },
  { foldLevel: { level: 0, base: 1 } },
);

pageTest(
  'a fold level picked over another config is dropped: the new config wins',
  async () => {
    assert.equal($('#threshold [aria-checked="true"]').dataset.value, '1');
    assert.equal($$('#code .region.pinned').length, 0);
  },
  { foldLevel: { level: 0, base: 2 } },
);

pageTest('the code size: the stepper sets it, the cookie keeps it, and the default keeps none', async () => {
  const codeSize = () => document.documentElement.style.getPropertyValue('--text-code');
  const [smaller, larger] = $$('#code-size [data-part="icon-btn"]');
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

pageTest('the UI size: the stepper zooms the whole page, the cookie keeps it, and the default keeps none', async () => {
  const root = document.documentElement;
  const [smaller, larger] = $$('#ui-zoom [data-part="icon-btn"]');
  assert.equal($('#ui-zoom output').textContent, '100%');
  assert.equal(root.style.getPropertyValue('zoom'), '', 'at the default the page is as it is');
  assert.equal($('#ui-zoom-hint').textContent, 'default 100%');

  await click(larger);
  await click(larger);
  assert.equal($('#ui-zoom output').textContent, '125%');
  assert.equal(root.style.getPropertyValue('zoom'), '1.25');
  assert.equal(root.style.getPropertyValue('--ui-zoom'), '1.25', 'for what the zoom gets wrong (ui/zoom.ts)');
  assert.ok(document.cookie.includes('lens-ui-zoom=125'));
  assert.equal($('#code-size output').textContent, '12px', 'the code size is its own');

  await click(larger);
  assert.equal($('#ui-zoom output').textContent, '150%', 'it stops at the largest');
  assert.equal((larger as HTMLButtonElement).disabled, true);

  for (let step = 0; step < 3; step++) await click(smaller);
  assert.equal(root.style.getPropertyValue('zoom'), '');
  assert.equal(root.style.getPropertyValue('--ui-zoom'), '');
  assert.ok(!document.cookie.includes('lens-ui-zoom'), 'the default keeps no cookie');

  await click(smaller);
  await click(smaller);
  assert.equal($('#ui-zoom output').textContent, '80%', 'it stops at the smallest');
  assert.equal((smaller as HTMLButtonElement).disabled, true);
  await click(larger);
  await click(larger);
});

test('the UI size comes back from its cookie', async () => {
  await open({}, '', 'lens-ui-zoom=110; path=/');
  try {
    assert.equal(document.documentElement.style.getPropertyValue('zoom'), '1.1');
    assert.equal($('#ui-zoom output').textContent, '110%');
  } finally {
    await close();
  }
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

pageTest('word diff (d, on by default) marks the words a replaced line changed, in both views', async (page) => {
  const added = () => $$('#code .row[data-line="10"] .w-add').map((word) => word.textContent);
  assert.equal($('#word-diff').getAttribute('aria-checked'), 'true', 'on by default');
  await key('d');
  assert.deepEqual(added(), [], 'd turns it off');
  assert.equal($('#word-diff').getAttribute('aria-checked'), 'false', 'the ⋯ menu switch follows the key');
  assert.deepEqual(postedView(page).at(-1), { wordDiff: false }, 'kept by the server');
  await key('d');
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
    $$('[data-part="unit-code"] .row[data-line="10"] .w-add').map((word) => word.textContent),
    ['and deleted = 0'],
  );
});

/** Side by side's rows: "10|11" old|new numbers, "−9|·" a removed line beside nothing, "R6" a fold, "⋯" a gap */

pageTest(
  'side by side (l, on by default) puts each removed line beside what replaced it, in both views',
  async (page) => {
    assert.ok($$('#code .srow').length > 0, 'on by default');
    await key('l');
    assert.equal($$('#code .srow').length, 0, 'l turns it off');
    assert.deepEqual(postedView(page).at(-1), { sideBySide: false });
    await key('l');
    assert.equal($('#side-by-side').getAttribute('aria-checked'), 'true', 'the ⋯ menu switch follows the key');
    assert.deepEqual(postedView(page).at(-1), { sideBySide: true }, 'kept by the server');
    // unchanged lines on both sides, numbered on each; the old query sits apart from the new one, past the log fold
    assert.deepEqual(splitRows(), [
      '⋯',
      'R6',
      '−9|·',
      'R9',
      '·|10',
      '10|11',
      '11|12',
      '12|13',
      '⋯',
      '14|15',
      '15|16',
      '16|17',
      '−17|·',
      '−18|·',
      '−19|·',
      '−20|·',
      '21|18',
      '22|19',
      '23|20',
      '⋯',
    ]);
    // a fold's pill sits on the new side, over the code it quotes; the old side says what it folds
    const foldHalves = (row: Element) =>
      [...row.children].map((half) => (half.classList.contains('none') ? '·' : half.textContent!.trim()));
    assert.deepEqual($$('#code .region > .srow.pill-row').map(foldHalves), [
      ['6guard1 guard → throw Error (3 lines)', '63 lines folded'],
      ['9logginglog.info — "finding orders"', '·'],
    ]);
    assert.ok($$('#code .region .pill-row > .left .pill').length === 0, 'no pill on the old side');
    // hidden lines: each side numbers its own
    assert.deepEqual(
      $$('#code .gap-row').map((row) => [...row.children].map((half) => half.textContent!.replace('⋯', '').trim())),
      [
        ['5 unchanged lines · 1–5', '5 unchanged lines · 1–5'],
        ['1 unchanged line · 14', '1 unchanged line · 13'],
        ['7 unchanged lines · 21–27', '7 unchanged lines · 24–30'],
      ],
    );
    await click($('#code .region > .srow.pill-row > .left'));
    assert.ok($('#code .region[data-cat="guard"]').classList.contains('open'), 'either half opens the fold');
    await click($('#code .region > .srow.pill-row > .left'));
    // a lookup by line finds the new side
    assert.ok($('#code .row[data-line="11"]').classList.contains('right'));
    assert.equal($$('[data-part="code-pane"] [data-part="ruler"]').length, 0, 'no overview ruler');
    const removed = $('#show-removed') as HTMLButtonElement;
    assert.ok(removed.disabled, 'the removed lines are its left side');
    assert.equal(removed.getAttribute('aria-checked'), 'true');
    await key('x');
    assert.equal($$('#code .half.removed').length, 5, 'x leaves them');
    await key('x');
    // word diff, on by default
    assert.deepEqual(
      $$('#code .half.right[data-line="10"] .w-add').map((word) => word.textContent),
      ['and deleted = 0'],
    );
    await key('v');
    await key('j');
    assert.ok($('[data-part="unit-code"] .code').classList.contains('split'), 'the Summary tab too');
    assert.ok($$('[data-part="unit-code"] .srow').length > 0);
    assert.equal($$('[data-card="unit-card"] [data-part="ruler"]').length, 0);
    await key('l');
    assert.equal($$('[data-part="unit-code"] .srow').length, 0, 'l works on the Summary tab');
    assert.deepEqual(postedView(page).at(-1), { sideBySide: false });
  },
  // the viewer's own default, not the harness's
  { sideBySide: undefined },
);

/** Selects from the start of one row to the first character of another, as a drag would. */

pageTest(
  'side by side: an Ask selection takes the lines of the side it started on, and only that side shows it',
  async (page) => {
    page.ask = { listening: true, questions: [] };
    await key('l');
    await key('\\');
    const half = (side: string, line: number) => $('#code .half.' + side + '[data-line="' + line + '"]');
    // from the old side of line 11 to the old side of line 12: the new side of 12 is in between in the markup
    await selectRows(half('left', 11), half('left', 12));
    assert.equal($('#ask-chips').textContent, 'orders.tssrc/orders.ts:11–12');
    assert.ok(half('left', 11).classList.contains('ask-sel'));
    assert.ok(!half('right', 11).classList.contains('ask-sel'), "the unchanged line's other half isn't tinted");
    // and the other way round
    await selectRows(half('right', 11), half('right', 12));
    assert.equal($('#ask-chips').textContent, 'orders.tssrc/orders.ts:11–12');
    assert.ok(half('right', 12).classList.contains('ask-sel'));
    assert.ok(!half('left', 12).classList.contains('ask-sel'));
    await type($('#ask-input'), 'why?');
    await click($('#ask-send'));
    const sent = page.requests.find((request) => request.method === 'POST' && request.path === '/api/ask')!;
    const body = sent.body as { selection: { lines: { n: number; side: string }[] } };
    assert.deepEqual(
      body.selection.lines.map((line) => line.side + line.n),
      ['new11', 'new12'],
    );
  },
);

/** The overview ruler's ticks: "add N9" a run of changes from line 9, "del O17" removed lines, "bug N10" a concern */

pageTest('the ruler ticks the changes by row; a click opens the fold around one and flashes it', async () => {
  // the changed log line (9) is folded: its tick sits at the fold's pill, one run with line 10
  assert.deepEqual(ticks(), ['del O9', 'add N9', 'del O17']);
  const tick = $$('[data-part="code-pane"] [data-part="ruler"] [data-part="tick"]')[1];
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
  assert.deepEqual(ticks('[data-card="unit-card"]'), ['del O9', 'add N9', 'bug N10']);
  // only a concern's tick takes the concern color
  assert.deepEqual(
    $$('[data-card="unit-card"] [data-part="ruler"] [data-part="tick"]:not([data-kind="add"], [data-kind="del"])').map(
      (tick) => tick.dataset.label,
    ),
    ['N10'],
  );
  await click($('[data-part="concern"] [data-part="vbtn"][data-mark="dismissed"]'));
  assert.deepEqual(ticks('[data-card="unit-card"]'), ['del O9', 'add N9']);
});

pageTest('hide tests: t shows the test file, and hiding it again leaves it', async () => {
  await key('t');
  assert.deepEqual(treeFiles(), ['orders.test.ts', 'orders.ts']);
  await click($$('#tree [data-part="file"]').find((file) => file.textContent!.includes('orders.test.ts'))!);
  assert.equal($('[data-part="tab"][data-active] [data-part="tab-name"]').textContent, 'orders.test.ts');
  await key('t');
  assert.deepEqual(treeFiles(), ['orders.ts']);
  assert.equal(
    $('[data-part="tab"][data-active] [data-part="tab-name"]').textContent,
    'orders.ts',
    'the open test file gives way',
  );
});

test('a viewed mark is kept by the server, and comes back with the review', async () => {
  const page = await open();
  let saved = '';
  try {
    await key('m');
    assert.ok($('#tree [data-part="file"]').hasAttribute('data-viewed'));
    assert.equal($('#nav [data-part="progress-count"]').textContent, '1 of 1');
    const [tick] = postedMarks(page) as { list: string; key: string; on: boolean }[];
    assert.equal(tick.list, 'files');
    assert.match(tick.key, /^src\/orders\.ts@/);
    assert.equal(tick.on, true);
    saved = tick.key;
    assert.equal(localStorage.getItem('lens.viewedFiles'), null, 'not in the browser');

    await key('m');
    assert.deepEqual(postedMarks(page).at(-1), { list: 'files', key: saved, on: false });
  } finally {
    await close();
  }
  await open({}, '', '', withMarks({ files: [saved] }));
  try {
    assert.ok($('#tree [data-part="file"]').hasAttribute('data-viewed'));
  } finally {
    await close();
  }
});

test('↻ takes the marks the review has now: another branch is another review', async () => {
  await open();
  try {
    await key('m');
    assert.ok($('#tree [data-part="file"]').hasAttribute('data-viewed'));
    // the refresh's payload has no marks: the review checked out now has none
    await click($('#refresh'));
    assert.ok(!$('#tree [data-part="file"]').hasAttribute('data-viewed'));
  } finally {
    await close();
  }
});

pageTest(
  'a file viewed before its code changed says so, until it is viewed again',
  async () => {
    const box = () => $('#tree [data-part="file"] [data-part="viewed-box"]');
    assert.equal(box().getAttribute('aria-checked'), 'false', 'not viewed: the code is new');
    assert.ok(box().hasAttribute('data-changed'));
    assert.match($('#tree [data-part="file"]').getAttribute('title')!, /changed since you viewed it/);
    assert.equal($('#nav [data-part="progress-count"]').textContent, '0 of 1');
    assert.equal($('#nav [data-part="legend"][data-changed]').textContent, '1 changed since viewed');

    // its folder: each file viewed, one changed since: the dot, not the tick
    const folder = () => $('#tree [data-part="dir"]');
    assert.ok(folder().dataset.through === 'changed');
    assert.match(folder().getAttribute('title')!, /a file changed since you viewed it/);

    await key('m');
    assert.equal(box().getAttribute('aria-checked'), 'true');
    assert.ok(!box().hasAttribute('data-changed'));
    assert.equal($$('#nav [data-part="legend"][data-changed]').length, 0);
    assert.ok(folder().dataset.through === 'done', 'every file in it viewed: the tick');
    await key('m');
    assert.ok(!box().hasAttribute('data-changed'), 'unticked now: never viewed, as far as it shows');
    assert.ok(folder().dataset.through !== 'done' && folder().dataset.through !== 'changed');
    await key('t');
    await key('m');
    assert.ok(folder().dataset.through !== 'done', 'the test file shows now, and is not viewed');
  },
  {},
  '',
  () => withMarks({ files: ['src/orders.ts@old'] }),
);

test('a change reviewed before its code changed says so in the Summary list', async () => {
  const unit = payload.summary!.units.find((candidate) => candidate.name === 'findOrders')!;
  await open({}, '', '', withMarks({ units: [unit.id + '@old'] }));
  try {
    await key('v');
    const item = $$('[data-part="inbox-card"]').find(
      (candidate) => candidate.querySelector('[data-part="caption-unit"]')!.textContent === 'findOrders',
    )!;
    assert.ok(item.textContent!.includes('changed since you read it'));
  } finally {
    await close();
  }
});

pageTest('the review pill marks the file viewed and opens the next one, stopping at the ends of the tree', async () => {
  const pill = () => $('#review-next').textContent!.trim();
  const open = () => $('[data-part="tab"][data-active] [data-part="tab-name"]').textContent;
  const prev = () => $('#review-prev') as HTMLButtonElement;
  await key('t'); // the test file shows too, first in the tree: orders.ts is now the last file
  assert.equal($('#nav [data-part="progress-count"]').textContent, '0 of 2');
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
  assert.equal($('#nav [data-part="progress-count"]').textContent, '1 of 2');
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
  assert.equal($$('#code .w-add').length, 1, 'word diff: the replaced query marks its new words');
  await click($('#word-diff'));
  assert.equal($('#word-diff').getAttribute('aria-checked'), 'false');
  assert.equal($$('#code .w-add').length, 0);
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
  const close = $('#tabbar [data-part="tab"] [data-part="tab-close"]');
  assert.ok(close.getAttribute('aria-label'));
  assert.equal(close.getAttribute('aria-label'), 'Close orders.ts', 'it names the tab it closes');
  await click(close);
  assert.equal($$('#tabbar [data-part="tab"]').length, 0);
});

pageTest('Collapse All closes every folder, and a file opened from its tab opens its folders again', async () => {
  const folder = () => $('#tree [data-part="dir"]');
  assert.equal(folder().getAttribute('aria-expanded'), 'true');
  assert.ok($('#tree [data-dir-files] [data-part="guide"]'), 'an open folder draws its indent guide');
  await click($('#collapse-folders'));
  assert.equal(folder().getAttribute('aria-expanded'), 'false');
  assert.deepEqual(treeFiles(), []);
  await click($('#tabbar [data-part="tab"] [data-part="tab-main"]'));
  assert.equal(folder().getAttribute('aria-expanded'), 'true', 'revealed: its folder opened');
  assert.deepEqual(treeFiles(), ['orders.ts']);
  assert.ok($('#tree [data-part="file"][data-active] [data-part="kind-icon"]'));
});

pageTest('the tabs close as in VS Code: others, to the right, viewed, all', async () => {
  const tabNames = () => $$('#tabbar [data-part="tab-name"]').map((name) => name.textContent);
  const activeTab = () => $('#tabbar [data-part="tab"][data-active] [data-part="tab-name"]').textContent;
  const tab = (name: string) =>
    $$('#tabbar [data-part="tab"]').find((candidate) => candidate.textContent!.includes(name))!;
  const treeFile = (name: string) =>
    $$('#tree [data-part="file"]').find((file) => file.querySelector('[data-part="fname"]')!.textContent === name)!;
  const openBoth = async () => {
    fireEvent.dblClick(treeFile('orders.test.ts'));
    await settle();
    await click(treeFile('orders.ts'));
  };
  const fromMenu = async (name: string, item: string) => {
    fireEvent.contextMenu(tab(name), { button: 2 });
    await settle();
    await click($(item));
  };
  await key('t');
  await openBoth();
  assert.deepEqual(tabNames(), ['orders.ts', 'orders.test.ts']);
  assert.equal(activeTab(), 'orders.ts');

  await fromMenu('orders.test.ts', '#tab-menu-others');
  assert.deepEqual(tabNames(), ['orders.test.ts']);
  assert.equal(activeTab(), 'orders.test.ts', 'the one in front closed: the one kept shows');

  await openBoth();
  assert.deepEqual(tabNames(), ['orders.test.ts', 'orders.ts']);
  await fromMenu('orders.test.ts', '#tab-menu-right');
  assert.deepEqual(tabNames(), ['orders.test.ts']);

  await key('m');
  await click($('#tabs-close-viewed'));
  assert.deepEqual(tabNames(), [], 'the viewed file closed');

  await openBoth();
  await click($('#tabs-close-all'));
  assert.deepEqual(tabNames(), []);
});

pageTest("the shortcuts' tabs sit above the scrolling keys, not in them", async () => {
  await key('?');
  assert.equal($('[data-part="key-tabs"]').closest('[data-part="modal-body"]'), null);
  assert.ok($('#keys-modal [data-part="modal-body"] [data-part="set-table"]'));
});

test('a changed binary file is a row of the tree: its status, dimmed, and nothing to open', async () => {
  try {
    await open({}, '', '', { ...payload, binary: [{ file: 'src/logo.png', status: 'modified' }] });
    const row = $('#tree [data-part="file"][data-binary]');
    assert.equal(row.querySelector('[data-part="fname"]')!.firstChild!.textContent, 'logo.png');
    assert.equal(row.querySelector('[data-part="kind"]')!.textContent, 'binary');
    assert.ok(
      row.dataset.status === 'modified' && row.querySelector('[data-part="status-letter"][data-status="modified"]'),
    );
    assert.ok((row as HTMLButtonElement).disabled, "it can't be opened");
    assert.match(row.title, /^src\/logo\.png — modified, a binary file/);
    assert.equal(
      $$('#tree [data-part="file"] [data-part="viewed-box"]:not(.placeholder)').length,
      1,
      'no viewed box: it is not a file to read',
    );

    // j / k walk the files that open, and the filter finds the row by its name
    const active = () => $('#tree [data-part="file"][data-active] [data-part="fname"]').textContent;
    const first = active();
    await key('j');
    await key('k');
    assert.equal(active(), first);
    await type($('#file-filter'), 'logo');
    assert.deepEqual(
      $$('#tree [data-part="file"]').map(
        (file) => file.dataset.status === 'modified' && file.hasAttribute('data-binary'),
      ),
      [true],
    );
  } finally {
    await close();
  }
});

pageTest('j / k keep the open file in sight in the tree', async () => {
  await key('t');
  assert.deepEqual(treeFiles(), ['orders.test.ts', 'orders.ts']);
  const scrolled: string[] = [];
  const original = HTMLElement.prototype.scrollIntoView;
  HTMLElement.prototype.scrollIntoView = function (this: HTMLElement) {
    if (this.matches('#tree [data-part="file"]'))
      scrolled.push(this.querySelector('[data-part="fname"]')!.textContent!);
  };
  try {
    await key('k');
    assert.deepEqual(scrolled, ['orders.test.ts']);
    await key('j');
    assert.deepEqual(scrolled, ['orders.test.ts', 'orders.ts']);
  } finally {
    HTMLElement.prototype.scrollIntoView = original;
  }
});

pageTest('the code clears the review pill, as the ruler does', async () => {
  assert.ok($('#code').classList.contains('pb-[64px]'));
});

pageTest('removed lines keep their syntax colors, in both views', async () => {
  const colored = (selector: string) => $$(selector).filter((row) => row.querySelector('span[style*="color"]'));
  // the blank one has nothing to color
  const removed = $$('#code .row.removed').filter((row) => row.lastElementChild!.textContent!.trim() !== '');
  assert.equal(removed.length, 4);
  assert.equal(colored('#code .row.removed').length, 4, 'every removed line is highlighted');
  assert.equal(
    removed[0].lastElementChild!.textContent,
    '  const rows = await db.query("select * from orders where user = ?", [userId]);',
  );
  await key('v');
  await key('j');
  assert.ok(colored('[data-part="unit-code"] .row.removed').length > 0, 'the Summary tab too');
});
