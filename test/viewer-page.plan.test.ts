/// <reference types="bun" />
// The viewer page: the Plan tab, where the root's Lavish plans are listed and shown in a frame.
// The harness is test/fixtures/viewerPage.ts.

import assert from 'node:assert/strict';
import {
  payload,
  open,
  close,
  settle,
  key,
  click,
  type,
  $,
  $$,
  pageTest,
  lavishPlans,
  usePage,
} from './fixtures/viewerPage.ts';
import { LAVISH_INSTALL, LAVISH_REPO } from '../src/cli-app/plan/links.ts';
import { test } from 'bun:test';

usePage();

/** The page with the Plan tab's switch on (it's off by default) */
const withPlanTab = () => ({ ...payload, planTab: true });
const planTest = (name: string, run: Parameters<typeof pageTest>[1]) =>
  pageTest(name, run, undefined, undefined, withPlanTab);

const views = () => $$('#view-switch [role="radio"]').map((option) => option.textContent!.trim());
const planRows = () => $$('[data-part="plan-row"]').map((row) => [row.dataset.file, row.textContent]);
const opened = (page: { requests: { path: string; body: unknown }[] }) =>
  page.requests.filter((request) => request.path === '/api/plans/open').map((request) => request.body);
const notices = () => $$('[data-part="status-notices"] > *').map((notice) => notice.textContent);

async function openPlanTab() {
  await click($('#view-plan'));
}

planTest('Plan is the third view, after Code and Summary', async () => {
  assert.deepEqual(views(), ['Code', 'Summary', 'Plan']);
});

test('without a summary the switch is Code | Plan', async () => {
  await open({}, '', '', { ...withPlanTab(), summary: null });
  try {
    assert.deepEqual(views(), ['Code', 'Plan']);
  } finally {
    await close();
  }
});

planTest('the Plan tab lists the plans, each with its session, and starts on New plan', async (page) => {
  await openPlanTab();
  assert.ok(page.requests.some((request) => request.path === '/api/plans'));
  assert.equal($('#plan-pane').style.display, '');
  assert.equal($('[data-part="code-pane"]').style.display, 'none');
  assert.equal(document.querySelector('#review-pill'), null);
  assert.deepEqual(planRows(), [
    ['.lavish/plan-tab.html', 'Plan tabopen'],
    ['.lavish/cache.html', 'cache.html2 pending'],
    ['.lavish/old.html', 'An old planended'],
    ['.lavish/sketch/index.html', 'A sketchno session'],
  ]);
  assert.ok($('[data-part="plan-new"]').dataset.active !== undefined);
  assert.equal(
    $('[data-part="copy-cmd-text"]').textContent,
    "/lavish <what to plan>. Open it with lavish-axi's --no-open: I'm reviewing it in lens.",
  );
  // the whole command, on as many lines as it takes: the reader reads it before pasting it
  assert.ok($('[data-part="new-plan"] [data-part="copy-cmd"]').dataset.wrap !== undefined);
  // nothing opens until a plan is picked
  assert.deepEqual(opened(page), []);
});

planTest('New plan turns what the reader types into the /lavish command', async () => {
  await openPlanTab();
  await type($('#plan-request'), 'add a  cache   to search');
  assert.equal(
    $('[data-part="copy-cmd-text"]').textContent,
    "/lavish add a cache to search. Open it with lavish-axi's --no-open: I'm reviewing it in lens.",
  );
  // a start goes in front, and replaces another start
  await click($('[data-start="Bug fix"]'));
  assert.equal(
    $('[data-part="copy-cmd-text"]').textContent,
    "/lavish Plan a fix for add a cache to search. Open it with lavish-axi's --no-open: I'm reviewing it in lens.",
  );
  await click($('[data-start="Refactor"]'));
  assert.equal(
    $('[data-part="copy-cmd-text"]').textContent,
    "/lavish Plan a refactor of add a cache to search. Open it with lavish-axi's --no-open: I'm reviewing it in lens.",
  );
});

planTest('a picked plan opens in Lavish, framed from the proxy', async (page) => {
  await openPlanTab();
  await click($('[data-file=".lavish/plan-tab.html"]'));
  await settle();
  assert.deepEqual(opened(page), [{ file: '.lavish/plan-tab.html', reopen: false }]);
  // the robot marks the plans an agent polls, and only those
  const withAgent = $$('[data-part="plan-row"]').filter((row) => row.querySelector('[data-part="plan-agent"]'));
  assert.deepEqual(
    withAgent.map((row) => row.dataset.file),
    ['.lavish/plan-tab.html'],
  );
  const frame = $('#plan-iframe') as HTMLIFrameElement;
  assert.equal(frame.getAttribute('src'), 'http://127.0.0.1:49999/session/.lavish%2Fplan-tab.html');
  // its own origin: it may run, but never take the viewer's page away
  assert.ok(!frame.getAttribute('sandbox')!.includes('allow-top-navigation'));
  assert.ok(notices().includes('Agent listening on Plan tab'));
});

planTest('a plan nobody polls says so, with the command to go on with it', async () => {
  await openPlanTab();
  await click($('[data-file=".lavish/cache.html"]'));
  await settle();
  const line = $('[data-part="plan-no-agent"]');
  // short enough for the header's row: the whole command is what's copied, and its tooltip
  assert.equal(line.querySelector('[data-part="copy-cmd-text"]')!.textContent, '/lavish continue the plan');
  assert.equal(
    line.querySelector('[data-part="copy-cmd"]')!.getAttribute('data-tip'),
    "/lavish continue the plan in .lavish/cache.html. Open it with lavish-axi's --no-open: I'm reviewing it in lens.",
  );
  assert.ok(notices().includes('No agent on this plan'));
});

planTest('a plan the reader ended in Lavish opens again only when they ask', async (page) => {
  await openPlanTab();
  await click($('[data-file=".lavish/old.html"]'));
  assert.deepEqual(opened(page), []);
  assert.equal(document.querySelector('#plan-iframe'), null);
  await click($('#plan-reopen'));
  await settle();
  assert.deepEqual(opened(page), [{ file: '.lavish/old.html', reopen: true }]);
  assert.ok(document.querySelector('#plan-iframe'));
});

planTest('without the skill, New plan says what is missing and how to install it', async (page) => {
  page.plans = lavishPlans({ setup: { skill: null, node: '24.11.1', nodeNeeded: 22, cli: 'npx' } });
  await openPlanTab();
  const missing = $('[data-part="lavish-missing"]');
  const checks = $$('[data-part="lavish-check"]').map((check) => [check.dataset.check, check.dataset.ok !== undefined]);
  assert.deepEqual(checks, [
    ['skill', false],
    ['node', true],
    ['cli', true],
  ]);
  assert.equal(missing.querySelector('[data-part="copy-cmd-text"]')!.textContent, LAVISH_INSTALL);
  assert.equal($('#lavish-repo').getAttribute('href'), LAVISH_REPO);
  // the plans already there still open: Lavish runs
  await click($('[data-file=".lavish/plan-tab.html"]'));
  await settle();
  assert.ok(document.querySelector('#plan-iframe'));
});

planTest('without a node Lavish can run on, no plan is opened', async (page) => {
  page.plans = lavishPlans({ setup: { skill: '~/.claude/skills/lavish', node: '20.1.0', nodeNeeded: 22, cli: null } });
  await openPlanTab();
  await click($('[data-file=".lavish/plan-tab.html"]'));
  await settle();
  assert.deepEqual(opened(page), []);
  const node = $('[data-check="node"]');
  assert.equal(node.dataset.ok, undefined);
  assert.ok(node.textContent!.includes('found 20.1.0'));
});

planTest('p switches to the Plan tab and back; the code keys do nothing there', async () => {
  await key('p');
  assert.equal($('#plan-pane').style.display, '');
  const sidebar = $('#nav').style.display;
  await key('s'); // the sidebar still toggles
  assert.notEqual($('#nav').style.display, sidebar);
  await key('s');
  await key('j'); // a file step: not on this tab
  assert.equal($('#plan-pane').style.display, '');
  await key('p');
  assert.equal($('#plan-pane').style.display, 'none');
  assert.equal($('[data-part="code-pane"]').style.display, '');
});

planTest('a plan the agent writes while the tab shows comes into the list with the next poll', async (page) => {
  await openPlanTab();
  const before = page.requests.filter((request) => request.path === '/api/plans').length;
  page.plans = lavishPlans({
    plans: [{ file: '.lavish/new.html', title: 'Fresh', modified: 9, session: null }, ...lavishPlans().plans],
    stamp: 's2',
  });
  // what the poll runs: the stamp, which now says another list
  await key('v');
  await key('v');
  await openPlanTab();
  await settle();
  assert.ok(page.requests.filter((request) => request.path === '/api/plans').length > before);
  assert.equal(planRows()[0][0], '.lavish/new.html');
});

const counts = () =>
  $$('#plan-show [role="radio"]').map((option) => [option.textContent, option.getAttribute('aria-checked')]);

planTest('the plans filter by name or path, and by session: all, active, pending, each with its count', async () => {
  await openPlanTab();
  assert.deepEqual(counts(), [
    ['All 4', 'true'],
    ['Active 2', 'false'],
    ['Pending 1', 'false'],
  ]);
  await click($('#plan-show-active'));
  assert.deepEqual(
    planRows().map(([file]) => file),
    ['.lavish/plan-tab.html', '.lavish/cache.html'],
  );
  await click($('#plan-show-pending'));
  assert.deepEqual(
    planRows().map(([file]) => file),
    ['.lavish/cache.html'],
  );
  // the picked one again: all of them
  await click($('#plan-show-pending'));
  assert.equal(planRows().length, 4);
  // the box matches a name or a path, and the counts follow it
  await type($('#plan-filter input'), 'SKETCH');
  assert.deepEqual(
    planRows().map(([file]) => file),
    ['.lavish/sketch/index.html'],
  );
  assert.deepEqual(counts(), [
    ['All 1', 'true'],
    ['Active 0', 'false'],
    ['Pending 0', 'false'],
  ]);
  await click($('#plan-show-active'));
  assert.equal($('#plan-list .no-match').textContent, 'no plans match');
  // New plan stays, whatever the filter
  assert.ok(document.querySelector('[data-part="plan-new"]'));
});

planTest('/ focuses the plans filter, f shows the open plan full screen, g goes to New plan', async () => {
  const asked: Element[] = [];
  const request = HTMLElement.prototype.requestFullscreen;
  HTMLElement.prototype.requestFullscreen = function (this: HTMLElement) {
    asked.push(this);
    return Promise.resolve();
  };
  try {
    await openPlanTab();
    await key('/');
    assert.equal(document.activeElement, $('#plan-filter input'));
    (document.activeElement as HTMLElement).blur();
    await key('f'); // no plan open yet: nothing to show
    assert.deepEqual(asked, []);
    await click($('[data-file=".lavish/plan-tab.html"]'));
    await settle();
    await key('f');
    assert.deepEqual(asked, [$('#plan-iframe')]);
    await click($('#plan-full'));
    assert.equal(asked.length, 2);
    // g goes back to New plan, as it goes to the overview on the Summary tab
    await key('g');
    assert.ok($('[data-part="plan-new"]').dataset.active !== undefined);
    assert.ok(document.querySelector('[data-part="new-plan"]'));
  } finally {
    HTMLElement.prototype.requestFullscreen = request;
  }
});

pageTest('the Plan tab is off by default: no Plan in the switch, and p does nothing', async () => {
  assert.deepEqual(views(), ['Code', 'Summary']);
  await key('p');
  assert.equal($('#plan-pane').style.display, 'none');
});

pageTest('the ⋯ switch turns the Plan tab on, and off again from the tab itself back to the code', async (page) => {
  await click($('#plan-tab'));
  await settle();
  assert.deepEqual(
    page.requests.filter((request) => request.path === '/api/settings').map((request) => request.body),
    [{ planTab: true }],
  );
  assert.deepEqual(views(), ['Code', 'Summary', 'Plan']);
  await key('p');
  assert.equal($('#plan-pane').style.display, '');
  await click($('#plan-tab'));
  await settle();
  assert.deepEqual(views(), ['Code', 'Summary']);
  assert.equal($('#plan-pane').style.display, 'none');
  assert.equal($('[data-part="code-pane"]').style.display, '');
});

planTest('Close session ends the plan in Lavish, and it opens again on a click, with no --reopen', async (page) => {
  await openPlanTab();
  await click($('[data-file=".lavish/cache.html"]'));
  await settle();
  await click($('#plan-close'));
  await settle();
  assert.deepEqual(
    page.requests.filter((request) => request.path === '/api/plans/end').map((request) => request.body),
    [{ file: '.lavish/cache.html' }],
  );
  assert.equal(document.querySelector('#plan-iframe'), null);
  assert.ok($('[data-part="plan-ended"]').textContent!.includes('closed'));
  // picked again, it waits for the click
  await click($('[data-part="plan-new"]'));
  await click($('[data-file=".lavish/cache.html"]'));
  assert.deepEqual(opened(page), [{ file: '.lavish/cache.html', reopen: false }]);
  await click($('#plan-reopen'));
  await settle();
  assert.deepEqual(opened(page), [
    { file: '.lavish/cache.html', reopen: false },
    { file: '.lavish/cache.html', reopen: false },
  ]);
  assert.ok(document.querySelector('#plan-iframe'));
});

planTest(
  'the Plan tab hides the Ask rail and turns off its button and keys, and the rail comes back after',
  async () => {
    await key('a');
    assert.equal($('#ask-rail').style.display, '');
    ($('#ask-input') as HTMLTextAreaElement).blur();
    await openPlanTab();
    assert.equal($('#ask-rail').style.display, 'none');
    assert.equal(($('#ask-btn') as HTMLButtonElement).disabled, true);
    assert.equal($('#ask-btn').getAttribute('aria-pressed'), 'false');
    await key('\\');
    await key('a');
    assert.equal($('#ask-rail').style.display, 'none');
    await key('p');
    assert.equal($('#ask-rail').style.display, '');
    assert.equal(($('#ask-btn') as HTMLButtonElement).disabled, false);
  },
);

test('nothing changed yet: the page opens on the Plan tab, and the Code tab says there is nothing', async () => {
  await open({}, '', '', {
    ...withPlanTab(),
    files: [],
    deleted: [],
    excluded: [],
    renamed: [],
    binary: [],
    summary: null,
  });
  try {
    await settle();
    assert.equal($('#plan-pane').style.display, '');
    assert.ok(document.querySelector('[data-part="new-plan"]'));
    await click($('#view-code'));
    assert.equal(
      $('[data-part="code-pane"]').textContent,
      'Nothing changed yet. When there is, the status bar offers a refresh.',
    );
  } finally {
    await close();
  }
});
