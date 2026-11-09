/// <reference types="bun" />
// The viewer page: the Summary tab: the overview, flows, units, previews.
// The harness is test/fixtures/viewerPage.ts.

import { test } from 'bun:test';
import assert from 'node:assert/strict';
import type { ViewerPayload } from '../src/cli-app/render/web/server.ts';
import { fireEvent } from '@testing-library/dom';
import {
  payload,
  findOrdersId,
  withMarks,
  postedMarks,
  postedView,
  open,
  close,
  settle,
  key,
  click,
  $,
  $$,
  rows,
  pageTest,
  ticks,
  status,
  usePage,
} from './fixtures/viewerPage.ts';

usePage();

pageTest(
  'the Summary tab lists the changes, flagged first, and opens on the overview',
  async () => {
    assert.equal($('#summary-pane').style.display, '');
    assert.deepEqual(
      $$('[data-part="inbox-card"] [data-part="caption-unit"]').map((name) => name.textContent),
      ['findOrders', 'legacyTotal'],
      "the test file's unit hides with the tests",
    );
    assert.equal($('[data-part="progress"] [data-part="legend"]').textContent, '2 flagged');
    assert.ok($('[data-part="sum-overview-item"]').hasAttribute('data-active'));
    assert.deepEqual(
      $$('[data-part="ov-stat"]').map((stat) => stat.textContent),
      ['1 possible bug', '1 question', '1 may break callers'],
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
    assert.equal($('#summary-pane [data-part="sum-headline"]').textContent, 'The changes');
    const how = $('#no-summary');
    assert.equal(how.querySelector('[data-part="ov-what-label"]')!.textContent, 'Agent summary');
    assert.deepEqual(
      [...how.querySelectorAll('[data-part="copy-cmd-text"]')].map((command) => command.textContent),
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

test('a diff that ends at a branch not checked out says to check it out, instead of what to run', async () => {
  const fresh = payload.summary!;
  payload.summary = { ...fresh, checkout: 'feature', units: fresh.units.map((unit) => ({ ...unit, summary: null })) };
  try {
    await open();
    await key('v');
    await settle();
    const how = $('#no-summary');
    assert.match(how.textContent!, /this diff ends at feature\. Check it out first/);
    assert.deepEqual(
      [...how.querySelectorAll('[data-part="copy-cmd-text"]')].map((command) => command.textContent),
      ['git checkout feature'],
    );
    await click($('#review-next'));
    const note = $('#summary-pane [data-part="sum-note"]');
    assert.match(note.textContent!, /^Not summarized yet\. A summary is written from the checked-out code/);
    assert.deepEqual(
      [...note.querySelectorAll('[data-part="copy-cmd-text"]')].map((command) => command.textContent),
      ['git checkout feature'],
    );

    // the reader checks it out: the server reads the summary under that branch's key, and the page follows
    const unsummarized = payload.summary;
    payload.summary = { ...unsummarized, key: unsummarized.key + '-feature', checkout: null };
    window.dispatchEvent(new Event('focus'));
    await settle();
    const after = $('#summary-pane [data-part="sum-note"]');
    assert.match(after.textContent!, /^Not summarized yet\. Run .* in your agent\./);
    assert.deepEqual(
      [...after.querySelectorAll('[data-part="copy-cmd-text"]')].map((command) => command.textContent),
      [fresh.command],
    );
    assert.deepEqual(status(), {
      kind: 'done',
      label: 'Another branch is checked out: the summary is read for it',
      detail: '',
    });
    assert.equal(document.querySelector('#summary-dot'), null, 'nothing new is waiting');
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
    assert.equal(
      $('#summary-pane [data-part="sum-headline"]').textContent,
      'The changes',
      'the overview is there already',
    );
    assert.equal($$('#no-summary').length, 0, 'no "not written yet" while the stamp is checked');
    release();
    await settle();
    assert.equal($$('#no-summary').length, 0);
    assert.equal(
      $('#summary-pane [data-part="sum-headline"]').textContent,
      'The changes',
      'the overview, with the new summary',
    );
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
  assert.equal($('[data-part="sum-headline"]').textContent, 'findOrders skips deleted orders');
  assert.equal(pill(), 'Reviewed · next change');
  await click($('#review-next'));
  assert.equal($('[data-part="inbox-card"][data-selected] [data-part="caption-unit"]').textContent, 'legacyTotal');
  assert.equal($('#nav [data-part="progress-count"]').textContent, '1 of 2');
  assert.equal($('[data-part="inbox-read-toggle"]').textContent, 'Read 1', 'the reviewed change moved to Read');
  // the last one: nothing is left to read, and the overview's pill says so instead of starting again
  await click($('#review-next'));
  await key('g');
  await settle();
  assert.equal($('#nav [data-part="progress-count"]').textContent, '2 of 2');
  assert.equal(pill(), 'All 2 changes reviewed');
  assert.equal($$('#review-prev, #review-undo').length, 0, 'no change open on the overview');
});

test("the agent's previews and sequences: all on the overview, a unit's own on its page, each step opening its unit", async () => {
  const summary = payload.summary!;
  const id = (name: string) => summary.units.find((unit) => unit.name === name)!.id;
  const find = id('findOrders'),
    legacy = id('legacyTotal');
  summary.previews = [
    {
      title: 'Orders page',
      units: [find, legacy],
      now: '/api/preview/0123456789abcdef.html',
      before: null,
      stale: false,
    },
  ];
  summary.sequences = [
    {
      title: 'List orders',
      lanes: ['route', 'repo'],
      units: [find, legacy],
      stale: true,
      steps: [
        {
          from: 'route',
          to: 'repo',
          label: 'findOrders(user)',
          was: 'findOrders(all)',
          change: 'changed',
          unit: find,
          line: 'N10',
        },
        { from: 'repo', to: 'route', label: 'legacyTotal()', change: 'removed', unit: legacy, line: 'O17' },
        { from: 'repo', to: 'repo', label: 'skip deleted', change: 'added', unit: find, line: 'N10' },
        { from: 'repo', to: 'route', label: 'orders' },
      ],
    },
  ];
  const steps = () => $$('[data-part="sequence-card"] [data-part="seq-step"] text').map((label) => label.textContent);
  try {
    const page = await open();
    await key('v');
    // the overview: every drawing, and the list marks the units they show
    assert.equal($$('#drawings [data-part="preview-card"]').length, 1);
    const frame = $('[data-part="preview-card"] iframe') as HTMLIFrameElement;
    assert.equal(frame.getAttribute('src'), '/api/preview/0123456789abcdef.html');
    // a unit's chip outlines it in the preview, and the overview stays; again, and it's off
    const chip = (unitId: string) =>
      $$('[data-part="preview-card"] [data-part="drawing-unit"]').find((button) =>
        button.textContent!.includes(unitId === find ? 'findOrders' : 'legacyTotal'),
      )!;
    await click(chip(legacy));
    assert.equal($('#summary-pane').dataset.unit, undefined, 'still the overview');
    assert.equal(frame.getAttribute('src'), '/api/preview/0123456789abcdef.html#' + encodeURIComponent(legacy));
    assert.equal(chip(legacy).getAttribute('aria-pressed'), 'true');
    await click(chip(legacy));
    assert.equal(frame.getAttribute('src'), '/api/preview/0123456789abcdef.html');
    assert.equal(frame.getAttribute('sandbox'), 'allow-scripts', 'scripts, but never its own origin');
    assert.equal($$('[data-part="preview-card"] [data-part="seg"]').length, 0, 'a new screen: no Before');
    assert.deepEqual(steps(), ['findOrders(user)', 'skip deleted', 'orders'], 'now: every step but the removed one');
    assert.equal($('[data-part="sequence-card"] [data-part="drawing-stale"]').textContent, 'code changed since');
    assert.deepEqual(
      $$('[data-part="sequence-card"] [data-part="step-kind"]').map((kind) => kind.textContent),
      ['added', 'changed', 'removed'],
    );
    assert.equal($$('[data-part="inbox-card"] [data-part="drawn"]').length, 2);

    await click($('[data-part="sequence-card"] [data-value="before"]'));
    assert.deepEqual(
      steps(),
      ['findOrders(all)', 'legacyTotal()', 'orders'],
      'before: as it was, without the added one',
    );
    assert.equal($$('[data-part="seq-step"][data-opens]').length, 2, 'the plain step names no unit: it opens nothing');

    // a step opens its unit; that unit's page shows the drawings that show it
    fireEvent.click($('[data-part="seq-step"][data-kind="removed"]'));
    await settle();
    assert.equal($('#summary-pane').dataset.unit, legacy);
    assert.equal($$('#drawings [data-part="preview-card"]').length, 1);
    assert.equal($$('#drawings [data-part="sequence-card"]').length, 1);

    // on a unit's page, a chip opens its unit
    await click(chip(find));
    assert.equal($('#summary-pane').dataset.unit, find);
    const own = $('[data-part="preview-card"] iframe') as HTMLIFrameElement;
    assert.equal(
      own.getAttribute('src'),
      '/api/preview/0123456789abcdef.html#' + encodeURIComponent(find),
      'its elements outlined',
    );
    assert.ok($('[data-part="preview-card"] [data-part="drawing-unit"][data-on]'), "the page's own unit, picked");

    // the frame tells the page its height, and nothing else
    // (its frame isn't loaded here: a stand-in window is the one it posts from)
    const frameWindow = new EventTarget() as unknown as Window;
    const post = async (data: unknown, source: Window = frameWindow) => {
      Object.defineProperty($('iframe'), 'contentWindow', { value: frameWindow, configurable: true });
      window.dispatchEvent(new MessageEvent('message', { data, source }));
      await settle();
    };
    await post({ lens: true, type: 'size', height: 5000 });
    assert.equal(own.style.height, '900px', 'as tall as its screen, up to a limit');
    await post({ lens: false, type: 'size', height: 200 });
    await post({ lens: true, type: 'size', height: 200 }, new EventTarget() as unknown as Window);
    assert.equal(own.style.height, '900px', 'another window, or not lens: not heard');
    await post({ lens: true, type: 'open-unit', unit: legacy });
    assert.equal($('#summary-pane').dataset.unit, find, 'a click in the frame opens nothing');
    await click(chip(legacy));
    assert.equal(
      ($('[data-part="preview-card"] iframe') as HTMLIFrameElement).style.height,
      '900px',
      "the next unit's frame keeps the height, so the preview stays in place",
    );

    // the switch: off hides them all, and the server keeps it for the next summary
    await click($('#build-previews'));
    assert.deepEqual(
      page.requests.filter((request) => request.path === '/api/settings'),
      [{ method: 'POST', path: '/api/settings', body: { buildPreviews: false } }],
    );
    assert.equal(document.querySelector('#drawings'), null);
    assert.equal($$('[data-part="inbox-card"] [data-part="drawn"]').length, 0);
    assert.equal($('#build-previews').getAttribute('aria-checked'), 'false');
  } finally {
    summary.previews = [];
    summary.sequences = [];
    await close();
  }
});

pageTest("a unit's code has the Code view's folds and toolbar keys, but shows whole", async () => {
  await key('v');
  await key('j');
  assert.equal($('[data-part="sum-headline"]').textContent, 'findOrders skips deleted orders');
  // the card's header says where the unit is: no path line over the headline
  assert.equal($$('[data-part="sum-inner"] [data-part="kicker"]').length, 0);
  assert.equal($('[data-card="unit-card"] [data-part="code-path"]').textContent, 'src/orders.tsfindOrders');
  const code = '[data-part="unit-code"] .code';
  // hunks only is on, but the unit shows whole: line 5 is far from the changes and the cited line, and still there
  assert.deepEqual(rows(code), ['5', 'R6', '−9', 'R9', '10', '11', '12']);
  assert.deepEqual(
    $$('#toggles [data-part="chip"]').map((chip) => chip.textContent),
    ['guard', 'logging'],
    "the chips are the unit's folds",
  );
  await key('e');
  assert.equal($$(code + ' .region.open').length, 2);
  await key('h');
  assert.deepEqual(rows(code), ['5', 'R6', '−9', 'R9', '10', '11', '12'], 'h changes nothing here');
  await key('x');
  assert.deepEqual(rows(code), ['5', 'R6', 'R9', '10', '11', '12']);
});

test("the agent's title heads the overview; its backticks read as code, and stay out of what goes to the agent", async () => {
  const summary = payload.summary!;
  const units = summary.units.map((unit) =>
    unit.summary?.concerns.length
      ? {
          ...unit,
          summary: {
            ...unit.summary,
            headline: 'Calls `fetchPage` first',
            concerns: [{ ...unit.summary.concerns[0], text: 'Empty `ids` <b>throws</b>' }],
          },
        }
      : unit,
  );
  const overview = { what: 'Adds `limit`.', title: 'Orders page by default', stale: false };
  const data = { ...payload, summary: { ...summary, units, overview } };
  await open({}, '', '', data);
  try {
    await key('v');
    await settle();
    const headline = $('#summary-pane [data-part="sum-headline"]');
    assert.equal(headline.textContent, 'Orders page by default');
    const code = [...$('#summary-pane').querySelectorAll('p code')].map((part) => part.textContent);
    assert.deepEqual(code, ['limit']);
    assert.ok(!$('#summary-pane').textContent!.includes('`limit`'));
    await key('j');
    await settle();
    const text = $('[data-part="concern"] [data-part="text"]');
    assert.equal(text.querySelector('code')?.textContent, 'ids');
    assert.equal(text.querySelector('b'), null, "the agent's text stays text");
    assert.match(text.textContent!, /<b>throws<\/b>/);
    assert.equal($('[data-part="sum-headline"] code').textContent, 'fetchPage');
  } finally {
    await close();
  }
});

function withChecks(): ViewerPayload {
  const summary = payload.summary!;
  const unit = findOrdersId();
  return {
    ...payload,
    selfChecks: true,
    summary: {
      ...summary,
      checks: [
        {
          flow: 'Orders',
          question: 'What does a bigger limit get?',
          answer: 'The first 50.',
          unit,
          line: 'N10',
          stale: false,
        },
      ],
      flows: [{ title: 'Orders', path: 'a', units: { [unit]: 'a' }, priority: 1, why: 'x' }, ...summary.flows],
    },
  };
}

test('Check yourself: on the overview while on, the answer behind a click; off, none', async () => {
  await open({}, '', '', withChecks());
  try {
    await key('v');
    await settle();
    assert.match($('[data-part="self-check"]').textContent!, /What does a bigger limit get\?/);
    assert.equal($$('[data-part="self-check-answer"]').length, 0, 'the answer is hidden');
    await click($('[data-part="self-check"] [data-part="disclosure"]'));
    assert.match($('[data-part="self-check-answer"]').textContent!, /The first 50\./);
    assert.doesNotMatch(
      $('[data-part="self-check-answer"] [data-part="tag"]').textContent!,
      /\b[NO]\d+\b/,
      'no line label',
    );
  } finally {
    await close();
  }
  await open({}, '', '', { ...withChecks(), selfChecks: false });
  try {
    await key('v');
    await settle();
    assert.equal($$('[data-part="self-checks"]').length, 0);
  } finally {
    await close();
  }
});

test("a flow's steps head its cards to read; one step over every change has none", async () => {
  const summary = payload.summary!;
  const id = (name: string) => summary.units.find((unit) => unit.name === name)!.id;
  const steps = () => $$('[data-part="inbox-step"]').map((heading) => heading.textContent);
  const flow = { path: 'a', priority: 1 as const, why: 'x' };
  const units = { [id('findOrders')]: 'repo', [id('legacyTotal')]: 'cleanup' };
  await open({}, '', '', { ...payload, summary: { ...summary, flows: [{ ...flow, title: 'Orders', units }] } });
  try {
    await key('v');
    await settle();
    assert.deepEqual(steps(), ['repo', 'cleanup']);
    const firstCard = $(`[data-inbox-unit="${id('findOrders')}"]`);
    await click(firstCard.querySelector('[data-part="inbox-read-btn"]')!);
    await settle();
    assert.deepEqual(steps(), ['cleanup'], 'a read card takes its heading along, and the flow still has two steps');
  } finally {
    await close();
  }
  const oneStep = { [id('findOrders')]: 'repo', [id('legacyTotal')]: 'repo' };
  await open({}, '', '', { ...payload, summary: { ...summary, flows: [{ ...flow, title: 'Twice', units: oneStep }] } });
  try {
    await key('v');
    await settle();
    assert.deepEqual(steps(), []);
  } finally {
    await close();
  }
});

pageTest("a concern sits under its line; dismissing it drops the note and the unit's flag", async (page) => {
  await key('v');
  await key('j');
  const line = $('[data-part="unit-code"] .row[data-line="10"]');
  assert.ok(line.classList.contains('cited') && line.classList.contains('flagged') && line.classList.contains('k-bug'));
  assert.ok((line.nextElementSibling as HTMLElement).dataset.note === 'inline');
  assert.ok($('[data-part="inbox-card"][data-selected] .sig-bug'));

  await click($('[data-part="concern"] [data-part="vbtn"][data-mark="dismissed"]'));
  assert.equal($$('[data-note="inline"]').length, 0);
  assert.ok($('[data-part=\"concern\"]').dataset.mark === 'dismissed');
  assert.equal($('[data-part="progress"] [data-part="legend"]').textContent, '1 flagged');
  assert.equal($$('[data-part="inbox-card"][data-selected] .sig').length, 0);
  assert.deepEqual(
    postedMarks(page).map((change) => (change as { mark: string }).mark),
    ['dismissed'],
    'kept by the server',
  );
});

pageTest("a verdict doesn't move the list: the order stays, and a signal filter keeps the open unit", async () => {
  // the list's names, the open unit marked ">"
  const listed = () =>
    $$('[data-part="inbox-card"]').map(
      (item) =>
        (item.hasAttribute('data-selected') ? '>' : '') + item.querySelector('[data-part="caption-unit"]')!.textContent,
    );
  await key('v');
  await key('j');
  assert.deepEqual(listed(), ['>findOrders', 'legacyTotal']);
  await click($('[data-part="concern"] [data-part="vbtn"][data-mark="dismissed"]'));
  assert.deepEqual(listed(), ['>findOrders', 'legacyTotal'], 'no longer flagged, but it keeps its place');

  await click($('[data-part="concern"] [data-part="vbtn"][data-mark="dismissed"]')); // restore
  await click($('#sig-filter [data-value="any"]'));
  await click($('[data-part="concern"] [data-part="vbtn"][data-mark="dismissed"]'));
  assert.equal(
    $('#sig-filter [data-value="any"]').getAttribute('aria-checked'),
    'true',
    'legacyTotal keeps the filter on',
  );
  assert.deepEqual(listed(), ['>findOrders', 'legacyTotal'], 'the open unit stays listed under it');
});

pageTest('a caller it may break takes a verdict: dismissed drops the flag, real goes to the agent', async () => {
  await key('v');
  await key('j');
  await key('j');
  assert.equal($('#sig-filter [data-value="breaks"] [data-part="n"]').textContent, '1');
  assert.ok($('#sig-filter [data-value="breaks"] [data-part="sig-icon"]'), "the signal's color goes on its icon");
  assert.ok(!document.querySelector('#sig-filter [data-value="any"] [data-part="sig-icon"]'), 'not on a count');

  await click($('[data-part="brk"] [data-part="vbtn"][data-mark="dismissed"]'));
  assert.ok($('[data-part=\"brk\"]').dataset.mark === 'dismissed');
  assert.equal($$('#sig-filter [data-value="breaks"]').length, 0);
  assert.equal($('#sig-filter [data-value="dismissed"] [data-part="n"]').textContent, '1');
  assert.ok(($('[data-part="brk-head"]') as HTMLButtonElement).disabled, 'its callers stay shut');

  await click($('[data-part="brk"] [data-part="vbtn"][data-mark="dismissed"]')); // restore
  assert.equal($('#sig-filter [data-value="breaks"] [data-part="n"]').textContent, '1');
  await click($('[data-part="brk"] [data-part="vbtn"][data-mark="real"]'));
  assert.ok($('[data-part=\"brk\"]').dataset.mark === 'real');
  await key('g');
  assert.equal($('[data-part="ov-real-count"]').textContent, '1 confirmed possible break in 1 change');
  await click($('[data-part="ov-real-copy"]'));
  assert.ok($('[data-part="ov-real-copy"]').hasAttribute('data-copied'));
  assert.match(
    await navigator.clipboard.readText(),
    /1\. \[breaks callers\] src\/orders\.ts — legacyTotal\n {3}callers of legacyTotal no longer compile\n {3}Callers: src\/report\.ts:3\n/,
  );
});

pageTest('a dismissed chip lists the changes whose concerns the reader dismissed', async () => {
  await key('v');
  await key('j');
  assert.equal($$('#sig-filter [data-value="dismissed"]').length, 0, 'nothing dismissed yet');
  await click($('[data-part="concern"] [data-part="vbtn"][data-mark="dismissed"]'));
  assert.equal($('#sig-filter [data-value="dismissed"] [data-part="n"]').textContent, '1');
  await click($('#sig-filter [data-value="dismissed"]'));
  assert.deepEqual(
    $$('[data-part="inbox-card"] [data-part="caption-unit"]').map((name) => name.textContent),
    ['findOrders'],
  );
  await click($('[data-part="concern"] [data-part="vbtn"][data-mark="dismissed"]')); // restore: nothing is dismissed, the filter lifts
  assert.equal($$('#sig-filter [data-value="dismissed"]').length, 0);
  assert.deepEqual(
    $$('[data-part="inbox-card"] [data-part="caption-unit"]').map((name) => name.textContent),
    ['findOrders', 'legacyTotal'],
  );
});

pageTest('hovering a When row tints the line it cites, until the pointer leaves the row or the tab', async () => {
  await key('v');
  await key('j');
  const cited = () => $('[data-part="unit-code"] .row[data-line="10"]').classList.contains('hover-cite');
  fireEvent.mouseOver($('[data-part="scn"]'));
  await settle();
  assert.ok(cited());
  fireEvent.mouseOut($('[data-part="scn"]'));
  await settle();
  assert.ok(!cited());
  fireEvent.mouseOver($('[data-part="scn"]'));
  await settle();
  await key('v');
  await key('v');
  assert.ok(!cited(), 'the unit page starts afresh');
});

pageTest('a deleted unit is its removed lines; o opens a unit in the code view', async () => {
  await key('v');
  await key('j');
  await key('j');
  assert.equal($('[data-part="inbox-card"][data-selected] [data-part="caption-unit"]').textContent, 'legacyTotal');
  assert.deepEqual(rows('[data-part="unit-code"] .code'), ['−17', '−18', '−19', '−20']);
  await key('k');
  assert.equal($('#open-in-code [data-part="tip"] kbd').textContent, 'o', 'its button teaches the key');
  await key('o');
  assert.equal($('main').style.display, '', 'back on the code view');
  assert.ok($('#code .row[data-line="9"]').classList.contains('flash'), "at the unit's first changed line");
});

pageTest('a concern marked real can be copied for the agent from the overview; none real, no block', async () => {
  await key('v');
  assert.equal($$('[data-part="ov-real"]').length, 0, 'nothing is confirmed yet');
  await key('j');
  await click($('[data-part="concern"] [data-part="vbtn"][data-mark="real"]'));
  // the confirmed kind gets its dot: on the concern, and on the card's icon in the list
  assert.ok($('[data-part="concern"] [data-part="confirmed-icon"]'));
  assert.equal($$('[data-part="inbox-card"][data-selected] [data-part="confirmed-icon"]').length, 1);
  await key('g');
  assert.equal($('[data-part="ov-real-count"]').textContent, '1 confirmed concern in 1 change');
  // listed, each a row that opens its change
  const items = $$('[data-part="ov-real-item"]');
  assert.deepEqual(
    items.map((item) => [item.dataset.sig, item.textContent]),
    [['bug', 'deleted is a string columnfindOrders']],
  );

  await click($('[data-part="ov-real-copy"]'));
  assert.equal(
    await navigator.clipboard.readText(),
    [
      'Fix these review findings. Each was raised in a lens review and confirmed by the reviewer.',
      '',
      '1. [bug] src/orders.ts:10 — findOrders',
      '   deleted is a string column',
      '',
    ].join('\n'),
  );
  assert.ok($('[data-part="ov-real-copy"] .lucide-check'));
  assert.ok($('[data-part="ov-real-copy"]').hasAttribute('data-copied'), 'the button says it was copied');

  // taking the verdict back takes the block away
  await key('j');
  await click($('[data-part="concern"] [data-part="vbtn"][data-mark="real"]'));
  assert.equal($$('[data-part="confirmed-icon"]').length, 0, 'the dot goes with the verdict');
  await key('g');
  assert.equal($$('[data-part="ov-real"]').length, 0);
});

test('the copied concerns name a removed line as one, in the order of the summary', async () => {
  const marks = Object.fromEntries(
    payload
      .summary!.units.filter((unit) => unit.summary)
      .flatMap((unit) =>
        unit.summary!.concerns.map((concern) => [
          // the line counted from the unit's anchor (model/signals.ts)
          `${unit.id}@${unit.hash}#${concern.kind}:${concern.line[0]}${Number(concern.line.slice(1)) - (concern.line[0] === 'O' ? unit.anchor.o : unit.anchor.n)}:${concern.text}`,
          'real' as const,
        ]),
      ),
  );
  await open({}, '#summary', '', withMarks({ concerns: marks }));
  try {
    assert.equal($('[data-part="ov-real-count"]').textContent, '2 confirmed concerns in 2 changes');
    await click($('[data-part="ov-real-copy"]'));
    const text = await navigator.clipboard.readText();
    assert.match(text, /\d\. \[bug\] src\/orders\.ts:10 — findOrders\n {3}deleted is a string column\n/);
    assert.match(
      text,
      /\d\. \[question\] src\/orders\.ts \(removed line 17\) — legacyTotal\n {3}did anything still call it\?\n/,
    );
  } finally {
    await close();
  }
});

test("a confirmed concern on code that changed since is counted, not copied: its unit's summary is stale", async () => {
  const fresh = payload.summary!;
  const unit = fresh.units.find((candidate) => candidate.summary?.concerns.length)!;
  // the code changed: the stored summary was written for another hash, the one the reader's mark has
  payload.summary = {
    ...fresh,
    units: fresh.units.map((candidate) =>
      candidate === unit ? { ...candidate, stale: true, staleHash: 'oldhash', summary: null } : candidate,
    ),
  };
  const marks = { [`${unit.id}@oldhash#bug:N3:deleted is a string column`]: 'real' as const };
  await open({}, '#summary', '', withMarks({ concerns: marks }));
  try {
    assert.equal($('[data-part="ov-real-count"]').textContent, '1 confirmed finding on code that changed since');
    assert.equal($$('[data-part="ov-real-copy"]').length, 0, 'nothing to copy: its lines may point elsewhere now');
  } finally {
    payload.summary = fresh;
    await close();
  }
});

pageTest('full units: the rest of the file sits above and below the unit, each behind a bar', async (page) => {
  await key('v');
  await key('j');
  const code = '[data-part="unit-code"] .code';
  const bar = (side: string) => $(code + ' .context.' + side + ' > .context-bar');
  const opened = (side: string) => rows(code + ' > .context.' + side + ' > .context-body');
  const unitRows = ['5', 'R6', '−9', 'R9', '10', '11', '12'];
  assert.equal($$(code + ' .context').length, 0, 'off by default: only the unit');
  await click($('#full-units'));
  assert.equal($('#full-units').getAttribute('aria-checked'), 'true');
  assert.deepEqual(postedView(page).at(-1), { fullUnits: true });
  // both closed: the unit's rows are as they were, between the two bars
  assert.deepEqual(rows(code), unitRows);
  assert.equal(bar('above').textContent!.trim(), '4 lines', 'nothing declared above it, nothing changed');
  assert.equal(bar('below').querySelector('.context-names')!.textContent, 'toOrder, formatTotal');
  assert.equal(
    bar('below').querySelector('[data-part="counts"]')!.textContent,
    '−4',
    "legacyTotal's removed lines are below",
  );
  assert.ok(bar('below').querySelector('.mark.changed'));
  assert.equal(bar('below').querySelector('.context-count')!.textContent, '15 lines');
  // a closed stretch's change ticks the ruler at its bar; a click on the tick opens it
  assert.deepEqual(ticks('[data-card="unit-card"]'), ['del O9', 'add N9', 'del O17', 'bug N10']);
  assert.ok(!$(code + ' .context.below').classList.contains('open'));
  await click($('[data-card="unit-card"] [data-part="ruler"] [data-part="tick"][data-label="O17"]'));
  assert.ok($(code + ' .context.below').classList.contains('open'));
  // open, it is the file's code, whole though hunks only is on
  assert.deepEqual(opened('below'), [
    ...['13', '14', '15', '16', '17', '−17', '−18', '−19', '−20'],
    ...['18', '19', '20', '21', '22', '23', '24', '25', '26', '27'],
  ]);
  await click(bar('above'));
  assert.deepEqual(opened('above'), ['R1', '4']);
  // Above opens over its bar: the bar stays on the unit's top edge
  const above = $(code + ' > .context.above');
  assert.deepEqual(
    [...above.children].map((child) => child.className),
    ['context-body', 'row context-bar'],
  );
  await click(bar('above'));
  assert.ok(!$(code + ' .context.above').classList.contains('open'), 'a second click closes it');
  await click($('#full-units'));
  assert.equal($$(code + ' .context').length, 0, 'off again: only the unit');
  assert.deepEqual(rows(code), unitRows);
});

test('full units: a unit that owns part of a removed block shows that part once, and the stretch only the rest', async () => {
  // units split a removed block between the declarations it was removed from (units.ts): here
  // findOrders owns the block's last two lines, old 19–20, shown after its line 12
  const block = payload.files.find((file) => file.file === 'src/orders.ts')!.removals!.find((b) => b.oldStart === 17)!;
  const units = payload.summary!.units.map((unit) =>
    unit.id.endsWith('#findOrders')
      ? { ...unit, removals: [...unit.removals, { ...block, anchor: 12, oldStart: 19, lines: block.lines.slice(2) }] }
      : unit,
  );
  try {
    await open({ fullUnits: true }, '', '', { ...payload, summary: { ...payload.summary!, units } });
    await key('v');
    await key('j');
    const code = '[data-part="unit-code"] .code';
    assert.deepEqual(rows(code), ['5', 'R6', '−9', 'R9', '10', '11', '12', '−19', '−20']);
    const below = $(code + ' .context.below > .context-bar');
    assert.equal(
      below.querySelector('[data-part="counts"]')!.textContent,
      '−2',
      'only the lines the unit does not own',
    );
    await click(below);
    assert.deepEqual(rows(code + ' > .context.below > .context-body'), [
      ...['13', '14', '15', '16', '17', '−17', '−18'],
      ...['18', '19', '20', '21', '22', '23', '24', '25', '26', '27'],
    ]);
  } finally {
    await close();
  }
});

const cardNames = (root = '[data-part="inbox-rail"]') =>
  $$(root + ' [data-part="inbox-card"] [data-part="caption-unit"]').map((name) => name.textContent);

pageTest(
  'the inbox shows each flow as a section of cards, and reading one opens the next',
  async (page) => {
    assert.deepEqual(cardNames('[data-part="inbox-flow"][data-open] [data-part="inbox-body"]'), [
      'findOrders',
      'legacyTotal',
    ]);
    assert.equal($('[data-part="inbox-flow-head"] [data-part="t"]').textContent, 'Not in a story');
    assert.equal($('[data-part="inbox-flow-head"] [data-part="n"]').textContent, '2 to read');
    assert.ok($('[data-part="inbox-card"] [data-part="icons"] .sig-bug'), 'a finding shows as its icon on the card');

    await click($$('[data-part="inbox-card"]')[0]);
    assert.equal($('#summary-pane').dataset.unit, 'src/orders.ts#findOrders');
    assert.ok($$('[data-part="inbox-card"]')[0].hasAttribute('data-selected'));

    await click($$('[data-part="inbox-card"] [data-part="inbox-read-btn"]')[0]);
    assert.equal($('#summary-pane').dataset.unit, 'src/orders.ts#legacyTotal', 'the next change to read opens');
    assert.deepEqual(
      cardNames('[data-part="inbox-body"]'),
      ['legacyTotal'],
      'the read card left for the folded Read area',
    );
    assert.equal($('[data-part="inbox-read-toggle"]').textContent, 'Read 1');
    assert.deepEqual(
      postedMarks(page).map((change) => (change as { on: boolean }).on),
      [true],
      'kept by the server, as a viewed mark',
    );

    await key('m');
    assert.equal($$('[data-part="inbox-flow"][data-open]').length, 0, 'a flow with nothing left to read folds itself');
    assert.equal($('[data-part="inbox-flow-head"] [data-part="n"]').textContent, 'all read');
    assert.ok($('[data-part="sum-overview-item"]').hasAttribute('data-active'), 'none left: the overview');

    await click($('[data-part="inbox-flow"]'));
    assert.equal($$('[data-part="inbox-flow"][data-open]').length, 1, 'a click anywhere on a folded flow opens it');
    await click($('[data-part="inbox-read-toggle"]'));
    assert.deepEqual(cardNames('[data-part="inbox-read"]'), ['findOrders', 'legacyTotal']);
    assert.deepEqual(
      $$('[data-part="inbox-read"] [data-part="inbox-read-btn"]').map((button) => button.textContent),
      ['Unread', 'Unread'],
    );
  },
  {},
  '#summary',
);

pageTest(
  'a signal filter unfolds the flows and Read areas its matches are folded in',
  async () => {
    await key('j');
    await key('m');
    await key('m');
    assert.equal($$('[data-part="inbox-flow"][data-open]').length, 0, 'all read: the flow folded');
    await click($('#sig-filter [data-value="bug"]'));
    assert.equal($$('[data-part="inbox-flow"][data-open]').length, 1);
    assert.deepEqual(cardNames('[data-part="inbox-read"]'), ['findOrders'], 'the read match is in sight');
  },
  {},
  '#summary',
);

pageTest(
  'j steps into a folded flow and opens it; folding the open card’s flow keeps it folded',
  async () => {
    await click($('[data-part="inbox-flow-head"]'));
    assert.equal($$('[data-part="inbox-flow"][data-open]').length, 0);
    await key('j');
    assert.equal($('#summary-pane').dataset.unit, 'src/orders.ts#findOrders');
    assert.equal($$('[data-part="inbox-flow"][data-open]').length, 1, 'stepping in opened it');
    await click($('[data-part="inbox-flow-head"]'));
    assert.equal($$('[data-part="inbox-flow"][data-open]').length, 0, 'the reader folds it, with its card open');
    assert.equal($('#summary-pane').dataset.unit, 'src/orders.ts#findOrders');
  },
  {},
  '#summary',
);

pageTest(
  'the review pill in the inbox goes on to the next change to read, not past it',
  async () => {
    const open = () => $('[data-part="inbox-card"][data-selected] [data-part="caption-unit"]').textContent;
    const names = cardNames('[data-part="inbox-body"]');
    assert.equal(names.length, 3);
    await click($('#review-next'));
    assert.equal(open(), names[0]);
    await click($('#review-next'));
    assert.equal(open(), names[1], 'the mark opened it: the pill takes no second step');
    assert.equal($('#nav [data-part="progress-count"]').textContent, '1 of 3');
  },
  { hideTests: false },
  '#summary',
);

pageTest(
  'a change the review pill opens unfolds its folded flow, its card in sight',
  async () => {
    await click($('[data-part="inbox-flow-head"]'));
    assert.equal($$('[data-part="inbox-flow"][data-open]').length, 0);
    await click($('#review-next'));
    assert.equal($$('[data-part="inbox-flow"][data-open]').length, 1, 'Start review opened the folded flow');
    assert.equal($('[data-part="inbox-card"][data-selected] [data-part="caption-unit"]').textContent, 'findOrders');
  },
  {},
  '#summary',
);

pageTest(
  "⌥-click on a unit's code finds the identifier's usages, as in the Code view",
  async () => {
    await key('j');
    const row = $$('[data-part="unit-code"] .row').find((candidate) => candidate.textContent!.includes('toOrder'))!;
    const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
    let text: Node | null = walker.nextNode();
    while (text && !text.textContent!.includes('toOrder')) text = walker.nextNode();
    // happy-dom has no caret from a point: the one the click is on
    const offset = text!.textContent!.indexOf('toOrder') + 2;
    Object.assign(document, { caretPositionFromPoint: () => ({ offsetNode: text, offset }) });
    try {
      fireEvent.click(row, { altKey: true });
      await settle();
      assert.ok(($('#search-modal') as HTMLDialogElement).open);
      assert.equal(($('#search-input') as HTMLInputElement).value, 'toOrder');
      assert.ok(($('#search-word') as HTMLInputElement).checked, 'as a whole word');
    } finally {
      delete (document as { caretPositionFromPoint?: unknown }).caretPositionFromPoint;
    }
  },
  {},
  '#summary',
);

test('a unit in two flows is listed under the first', async () => {
  const summary = payload.summary!;
  const id = (name: string) => summary.units.find((unit) => unit.name === name)!.id;
  summary.flows = [
    { title: 'Reads', path: 'repo', priority: 1, units: { [id('findOrders')]: 'repo' } },
    { title: 'Twice', path: 'repo', priority: 2, units: { [id('findOrders')]: 'repo', [id('legacyTotal')]: 'repo' } },
  ];
  await open();
  try {
    await key('v');
    const flows = $$('[data-part="inbox-flow"]').map((flow) => [
      flow.querySelector('[data-part="inbox-flow-head"] [data-part="t"]')?.textContent ??
        flow.textContent!.slice(0, 20),
      [...flow.querySelectorAll('[data-part="inbox-card"] [data-part="caption-unit"]')].map((name) => name.textContent),
    ]);
    assert.deepEqual(
      flows.map(([, names]) => names),
      [['findOrders'], ['legacyTotal']],
    );
  } finally {
    summary.flows = [];
    await close();
  }
});
