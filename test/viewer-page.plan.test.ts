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
    ['.lavish/plan-tab.html', 'Plan tabagent listening'],
    ['.lavish/cache.html', 'cache.html2 waiting'],
    ['.lavish/old.html', 'An old planended'],
    ['.lavish/sketch/index.html', 'A sketchno session'],
  ]);
  assert.ok($('[data-part="plan-new"]').dataset.active !== undefined);
  assert.equal($('[data-part="copy-cmd-text"]').textContent, '/lavish <what to plan>');
  // nothing opens until a plan is picked
  assert.deepEqual(opened(page), []);
});

planTest('New plan turns what the reader types into the /lavish command', async () => {
  await openPlanTab();
  await type($('#plan-request'), 'add a  cache   to search');
  assert.equal($('[data-part="copy-cmd-text"]').textContent, '/lavish add a cache to search');
  // a start goes in front, and replaces another start
  await click($('[data-start="Bug fix"]'));
  assert.equal($('[data-part="copy-cmd-text"]').textContent, '/lavish Plan a fix for add a cache to search');
  await click($('[data-start="Refactor"]'));
  assert.equal($('[data-part="copy-cmd-text"]').textContent, '/lavish Plan a refactor of add a cache to search');
});

planTest('a picked plan opens in Lavish, framed from the proxy', async (page) => {
  await openPlanTab();
  await click($('[data-file=".lavish/plan-tab.html"]'));
  await settle();
  assert.deepEqual(opened(page), [{ file: '.lavish/plan-tab.html', reopen: false }]);
  const frame = $('#plan-iframe') as HTMLIFrameElement;
  assert.equal(frame.getAttribute('src'), 'http://127.0.0.1:49999/session/.lavish%2Fplan-tab.html');
  // its own origin: it may run, but never take the viewer's page away
  assert.ok(!frame.getAttribute('sandbox')!.includes('allow-top-navigation'));
  assert.ok(document.querySelector('[data-part="plan-listening"]'));
  assert.ok(notices().includes('Agent listening on Plan tab'));
});

planTest('a plan nobody polls says so, with the command to go on with it', async () => {
  await openPlanTab();
  await click($('[data-file=".lavish/cache.html"]'));
  await settle();
  const line = $('[data-part="plan-no-agent"]');
  assert.equal(
    line.querySelector('[data-part="copy-cmd-text"]')!.textContent,
    '/lavish continue the plan in .lavish/cache.html',
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
