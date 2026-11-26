/// <reference types="bun" />
// The viewer page with an agent picked (`agent`): lens runs it to write the summary and answer the
// rail, and the reader can see its runs and stop them. The harness is test/fixtures/viewerPage.ts.

import { test } from 'bun:test';
import assert from 'node:assert/strict';
import type { ViewerPayload } from '../src/cli-app/render/web/server.ts';
import { payload, open, close, settle, key, click, $, $$, pageTest, usePage } from './fixtures/viewerPage.ts';

usePage();

/** The payload with nothing summarized yet, an agent picked or not */
const unsummarized = (agent: 'claude' | null): ViewerPayload => ({
  ...payload,
  agent,
  summary: { ...payload.summary!, units: payload.summary!.units.map((unit) => ({ ...unit, summary: null })) },
});

const notices = () => $$('#status-bar [data-part="status-notices"] > *').map((notice) => notice.textContent);
const poll = async () => {
  window.dispatchEvent(new Event('focus'));
  await settle();
};

test('an agent picked: the empty summary has a button that starts it, and says while it writes', async () => {
  const page = await open({}, '', '', unsummarized('claude'));
  try {
    await key('v');
    await settle();
    const how = $('#no-summary');
    assert.equal(how.querySelectorAll('[data-part="copy-cmd-text"]').length, 0, 'nothing to copy into an agent');
    assert.match(how.textContent!, /Not written yet\. The agent writes it/);
    const button = how.querySelector<HTMLButtonElement>('[data-part="agent-run"]')!;
    assert.equal(button.textContent, 'Write with agent');
    await click(button);
    await settle();
    assert.deepEqual(
      page.requests.filter((request) => request.path === '/api/agent/summary').map((request) => request.method),
      ['POST'],
    );
    const running = $('#no-summary [data-part="agent-run"]') as HTMLButtonElement;
    assert.equal(running.textContent, 'Agent is writing it');
    assert.ok(running.disabled, "a second run can't start");

    // a unit not summarized yet has the same button
    await click($('#review-next'));
    const note = $('#summary-pane [data-part="sum-note"]');
    assert.match(note.textContent!, /^Not summarized yet\. Agent is writing it/);

    // the run failed: the bar says so until the next run, and the button is back
    page.agentRun = { running: false, error: 'Claude Code failed: Not logged in' };
    await poll();
    assert.deepEqual(notices(), ["The agent's summary run failed"]);
    assert.equal($('#summary-pane [data-part="agent-run"]').textContent, 'Write with agent');
    page.agentRun = { running: false, error: 'Stopped' };
    await poll();
    assert.deepEqual(notices(), ["The agent's summary run was stopped"]);
    page.agentRun = { running: true, error: null };
    await poll();
    assert.deepEqual(notices(), []);
  } finally {
    await close();
  }
});

test('no agent picked: the summary says what to run in your agent, as before', async () => {
  await open({}, '', '', unsummarized(null));
  try {
    await key('v');
    await settle();
    assert.equal($$('[data-part="agent-run"]').length, 0);
    assert.deepEqual(
      [...$('#no-summary').querySelectorAll('[data-part="copy-cmd-text"]')].map((command) => command.textContent),
      [payload.summary!.command, payload.summary!.cli],
    );
  } finally {
    await close();
  }
});

pageTest("the agent's runs: the bar says so, its dialog lists them, and Stop ends one", async (page) => {
  page.agentRuns = [
    { id: '1', kind: 'summary', label: 'diff@main', startedAt: Date.now() - 3 * 60_000 },
    { id: '2', kind: 'ask', label: 'Can total() return a negative number now?', startedAt: Date.now() - 12_000 },
  ];
  await poll();
  assert.equal($('#status-bar [data-part="status-label"]').textContent, 'Agent running…');
  assert.match($('#status-bar [data-part="status-detail"]').textContent!, /^2 runs · 3 min$/);
  assert.equal($$('#status-action').length, 0, 'the status itself is the button');
  await click($('#status [data-part="status-item"]'));
  await settle();
  const dialog = $('#runs-modal') as HTMLDialogElement;
  assert.ok(dialog.open);
  const rows = () => [...dialog.querySelectorAll('[data-run]')].map((row) => row.textContent);
  assert.deepEqual(rows(), ['Summarydiff@main3 minStop', 'AskCan total() return a negative number now?12 sStop']);
  await click(dialog.querySelector('[data-run="2"] [data-part="run-stop"]')!);
  await settle();
  assert.deepEqual(
    page.requests.filter((request) => request.path.startsWith('/api/agent/runs/')).map((request) => request.path),
    ['/api/agent/runs/2/stop'],
  );
  assert.deepEqual(rows(), ['Summarydiff@main3 minStop'], 'the stamp poll takes it off');
  page.agentRuns = [];
  await poll();
  assert.equal(dialog.querySelector('.empty')?.textContent, 'Nothing is running.');
  assert.notEqual($('#status-bar [data-part="status-label"]').textContent, 'Agent running…');
});

pageTest('the rail with an agent listening says so itself: the bar has no notice for it', async (page) => {
  page.ask = { listening: true, questions: [] };
  await key('\\');
  await poll();
  assert.ok($('#ask-rail'));
  assert.ok(!notices().some((notice) => notice?.startsWith('Agent listening')));
});

pageTest("Settings' Agent menu picks lens's own agent, or yours: the summary follows", async (page) => {
  const menu = $('#agent') as HTMLSelectElement;
  assert.deepEqual(
    [...menu.options].map((option) => [option.value, option.textContent]),
    [
      ['', 'Your agent (skills)'],
      ['claude', 'Claude Code'],
    ],
  );
  assert.equal(menu.value, '');
  menu.value = 'claude';
  menu.dispatchEvent(new Event('change', { bubbles: true }));
  await settle();
  assert.deepEqual(
    page.requests.filter((request) => request.path === '/api/settings').map((request) => request.body),
    [{ agent: 'claude' }],
  );
  await key('v');
  await settle();
  assert.equal(
    $$('#summary-pane [data-part="copy-cmd-text"]').filter(
      (command) => command.textContent === payload.summary!.command,
    ).length,
    0,
    'no /lens-review to copy anywhere',
  );
  menu.value = '';
  menu.dispatchEvent(new Event('change', { bubbles: true }));
  await settle();
  assert.deepEqual(page.requests.filter((request) => request.path === '/api/settings').at(-1)?.body, { agent: null });
});
