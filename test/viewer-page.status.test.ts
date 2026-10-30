/// <reference types="bun" />
// The viewer page: the status bar, and what the page says about the server and the change.
// The harness is test/fixtures/viewerPage.ts.

import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { fireEvent, within } from '@testing-library/dom';
import { renderPage, type ViewerPayload } from '../src/cli-app/render/web/server.ts';
import {
  payload,
  lightTokens,
  withMarks,
  findOrdersId,
  open,
  close,
  settle,
  key,
  click,
  type,
  $,
  $$,
  pageTest,
  status,
  REST,
  pause,
  answering,
  usePage,
} from './fixtures/viewerPage.ts';

usePage();

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

pageTest("the agent's summary run shows as a notice while it goes: units in, then the final pass", async () => {
  const notices = () => $$('#status-bar .status-notices > *').map((notice) => notice.textContent);
  let building: unknown = { done: 12, total: 30, finalPass: false };
  const undo = answering((path) =>
    path === '/api/stamp'
      ? new Response(JSON.stringify({ summary: payload.summary!.stamp, change: payload.changeStamp, building }))
      : undefined,
  );
  window.dispatchEvent(new Event('focus'));
  await settle();
  assert.deepEqual(notices(), ['Agent writing summary · 12 of 30 units']);
  assert.ok($('#status-bar .notice-dot').classList.contains('pulse'), 'a live notice pulses, as the Ask dot does');
  building = { done: 30, total: 30, finalPass: true };
  window.dispatchEvent(new Event('focus'));
  await settle();
  assert.deepEqual(notices(), ['Agent writing summary · final pass']);
  building = null;
  window.dispatchEvent(new Event('focus'));
  await settle();
  undo();
  assert.deepEqual(notices(), [], 'the run is done');
});

test("a first run: the page opened before any summary, and shows the agent's run and then its summary", async () => {
  const summary = payload.summary!;
  const fresh: ViewerPayload = {
    ...payload,
    summary: { ...summary, stamp: null, units: summary.units.map((unit) => ({ ...unit, summary: null })) },
  };
  await open({}, '', '', fresh);
  try {
    const notices = () => $$('#status-bar .status-notices > *').map((notice) => notice.textContent);
    let stamp: unknown = {
      summary: null,
      change: payload.changeStamp,
      building: { done: 0, total: 2, finalPass: false },
    };
    const undo = answering((path) => (path === '/api/stamp' ? new Response(JSON.stringify(stamp)) : undefined));
    window.dispatchEvent(new Event('focus'));
    await settle();
    assert.deepEqual(notices(), ['Agent writing summary · 0 of 2 units']);
    // the first submit: summary.json is there now, where there was none
    stamp = { summary: summary.stamp, change: payload.changeStamp, building: null };
    window.dispatchEvent(new Event('focus'));
    await settle();
    undo();
    assert.deepEqual(notices(), ['New summary waiting']);
    await click($('#status-bar .status-notice'));
    await settle();
    assert.ok($('#summary-pane .sum-headline'), 'the Summary tab, with the summary loaded');
  } finally {
    await close();
  }
});

pageTest('the stamp poll is what notices a stopped server is back', async () => {
  const undo = answering(() => Promise.reject(new TypeError('fetch failed')));
  window.dispatchEvent(new Event('focus'));
  await settle();
  assert.equal(status().label, 'Server stopped');
  undo();
  window.dispatchEvent(new Event('focus'));
  await settle();
  assert.deepEqual(status(), REST, 'the next poll got through, with no click');
});

test('a PR diffed against a guessed base says so, and one with its own base says nothing', async () => {
  const notices = () => $$('#status-bar .status-notices > *').map((notice) => notice.textContent);
  await open({}, '', '', { ...payload, label: 'a/b#7', guessedBase: 'main' });
  try {
    assert.deepEqual(notices(), ['PR base unknown · diffed against main']);
  } finally {
    await close();
  }
  await open({}, '', '', { ...payload, label: 'a/b#7', guessedBase: null });
  try {
    assert.deepEqual(notices(), []);
  } finally {
    await close();
  }
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

pageTest('⏻ end stops the server and leaves a note', async (page) => {
  await click($('#end-session'));
  assert.ok(page.requests.some((request) => request.method === 'POST' && request.path === '/api/shutdown'));
  // (screen binds to the document at import, before happy-dom is there)
  assert.equal(within(document.body).getByText(/Session ended/).className, 'ended');
});

pageTest(
  'clear saved data: nothing goes until a kind is ticked, and a cleared summary leaves the Summary tab without it',
  async (page) => {
    await key('v');
    await click($('.sum-item'));
    assert.equal($('.sum-headline').textContent, 'findOrders skips deleted orders');
    const changedSince = () => $$('.sum-item .viewed-box.changed').length;
    assert.equal(changedSince(), 1, 'reviewed before its code changed');

    page.clearInfo.kinds.push({
      id: 'marks',
      label: 'Viewed and concern marks',
      unit: ['mark', 'marks'],
      plans: {
        this: { count: 1, paths: ['.lens/marks/diff@main.json'] },
        all: { count: 1, paths: ['.lens/marks/diff@main.json'] },
      },
      warning: null,
    });
    await click($('#clear-data'));
    assert.ok(($('#clear-modal') as HTMLDialogElement).open);
    assert.ok(($('#clear-confirm') as HTMLButtonElement).disabled, 'nothing ticked: nothing to clear');
    assert.equal(
      ($('#clear-scope-summaries') as HTMLSelectElement).value,
      'this',
      'the scope is in sight from the start',
    );
    assert.equal($('.choice[data-kind="marks"] .choice-sub').textContent, '1 mark');
    assert.ok(!$('.choice[data-kind="summaries"]').classList.contains('checked'));

    await click($('.choice[data-kind="summaries"]'));
    assert.ok($('.choice[data-kind="summaries"]').classList.contains('checked'), 'the whole row ticks it');
    assert.deepEqual(
      $$('.clear-gone li').map((item) => item.textContent),
      ['.lens/summary/diff@main/'],
    );
    fireEvent.change($('#clear-scope-summaries'), { target: { value: 'all' } });
    await settle();
    assert.ok(
      $('.choice[data-kind="summaries"]').classList.contains('checked'),
      'picking the scope leaves the tick as it was',
    );
    await click($('#clear-marks'));
    assert.deepEqual(
      $$('.clear-gone li').map((item) => item.textContent),
      ['.lens/summary/diff@main/', '.lens/summary/pr-87/', '.lens/marks/diff@main.json'],
    );

    await click($('#clear-confirm'));
    await settle();
    assert.deepEqual(
      page.requests
        .filter((request) => request.path === '/api/clear')
        .map((request) => request.method + ' ' + JSON.stringify(request.body)),
      ['GET null', 'POST {"picks":{"summaries":"all","marks":"this"}}'],
      "the marks are this review's, kept by the server",
    );
    assert.ok(!($('#clear-modal') as HTMLDialogElement).open);
    assert.equal(
      $('#status .status-label').textContent,
      'Cleared summaries (2 reviews) and viewed and concern marks (1 mark)',
    );
    assert.ok(!$('#root').textContent!.includes('skips deleted orders'), 'no summary is shown any more');
    assert.equal(changedSince(), 0, 'the page drops them too');

    // opened again, nothing is ticked
    await click($('#clear-data'));
    assert.ok(($('#clear-confirm') as HTMLButtonElement).disabled);
  },
  {},
  '',
  () => withMarks({ units: [findOrdersId() + '@old'] }),
);

test('a summary cleared from elsewhere (another viewer, `lens clear`) leaves this page too, once it looks', async () => {
  const fresh = payload.summary!;
  try {
    await open();
    payload.summary = { ...fresh, stamp: null, units: fresh.units.map((unit) => ({ ...unit, summary: null })) };
    await key('v');
    await settle();
    assert.ok($('#no-summary'), 'the overview says what to run');
    assert.equal($('#status .status-label').textContent, 'The summary was cleared');
  } finally {
    payload.summary = fresh;
    await close();
  }
});
