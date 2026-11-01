/// <reference types="bun" />
// The viewer page: the Ask rail, and the findings the reader marks and copies.
// The harness is test/fixtures/viewerPage.ts.

import assert from 'node:assert/strict';
import type { AskQuestion } from '../src/cli-app/ask/session.ts';
import {
  payload,
  settle,
  key,
  click,
  type,
  $,
  $$,
  pageTest,
  status,
  answering,
  usePage,
} from './fixtures/viewerPage.ts';

usePage();

pageTest('a opens the Ask rail with its input focused, and closes it again', async () => {
  await key('a');
  assert.equal($('#ask-rail').style.display, '');
  assert.equal(document.activeElement, $('#ask-input'));
  ($('#ask-input') as HTMLTextAreaElement).blur();
  await key('a');
  assert.equal($('#ask-rail').style.display, 'none');
});

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
    breaks: [],
  });
  assert.equal($('#ask-send').textContent!.trim(), 'Copied');
  assert.equal(($('#ask-input') as HTMLTextAreaElement).value, 'why the deleted column?', 'the question stays');
});

pageTest('a command to run copies on click, and its icon turns into a check', async () => {
  await key('\\');
  const command = $('[data-part="ask-empty"] [data-part="copy-cmd"]');
  assert.equal(command.textContent, '/lens-ask');
  await click(command);
  assert.equal(await navigator.clipboard.readText(), '/lens-ask');
  assert.ok(command.hasAttribute('data-copied'));
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

  await click($('[data-part="concern"] [data-part="vbtn"][data-mark="dismissed"]'));
  assert.equal($('#ask-chips').textContent, 'findOrders');
  await type($('#ask-input'), 'and now?');
  await click($('#ask-send'));
  assert.deepEqual(sentConcerns(), []);
});

pageTest('a question about a unit takes its open possible breaks along; a dismissed one stays behind', async (page) => {
  page.ask = { listening: true, questions: [] };
  await key('v');
  await key('j');
  await key('j');
  await key('\\');
  assert.equal($('#ask-chips').textContent, 'legacyTotal1 concern1 possible break');
  const sent = () =>
    page.requests.filter((request) => request.method === 'POST' && request.path === '/api/ask').at(-1)!.body as {
      breaks: string[];
    };
  await type($('#ask-input'), 'who calls it?');
  await click($('#ask-send'));
  assert.deepEqual(sent().breaks, ['callers of legacyTotal no longer compile']);

  await click($('[data-part="brk"] [data-part="vbtn"][data-mark="dismissed"]'));
  assert.equal($('#ask-chips').textContent, 'legacyTotal1 concern');
  await type($('#ask-input'), 'and now?');
  await click($('#ask-send'));
  assert.deepEqual(sent().breaks, []);
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
    breaks: [],
    askedAt: Date.now() - 90_000,
    handedAt: null,
    answer: null,
    stale: false,
  };
  page.ask = { listening: false, questions: [question] };
  await key('\\');
  assert.equal(
    $('[data-part="ask-noagent"]').textContent,
    'No agent is listening. Run /lens-ask in your agent to get this answered.',
  );
  assert.equal(document.querySelector('[data-part="ask-wait"]'), null, 'no spinner and no wait time');
  assert.equal(document.querySelector('[data-part="ask-lines"]'), null, 'and no answer on its way');
  assert.deepEqual(status(), {
    kind: 'waiting',
    label: 'No agent for your question',
    detail: 'run /lens-ask in your agent',
  });

  // an agent starts listening: the next poll (here, the rail opening again) shows the wait
  page.ask = { listening: true, questions: [question] };
  await key('\\');
  await key('\\');
  assert.match($('[data-part="ask-wait"]').textContent!, /^waiting for agent · \d+s$/);
  assert.equal(
    document.querySelectorAll('[data-part="ask-lines"] .skeleton').length,
    3,
    "the answer's place, while one is written",
  );
  assert.equal(document.querySelector('[data-part="ask-noagent"]'), null);
  assert.equal(status().label, 'Waiting for your agent');
});

pageTest('a thread scrolled up goes down to a question the reader sends, but not to an answer', async (page) => {
  const question = (id: string, text: string) => ({
    id,
    text,
    file: 'src/orders.ts',
    unitId: null,
    label: 'orders.ts',
    hash: 'h1',
    selection: null,
    concerns: [],
    breaks: [],
    askedAt: Date.now(),
    handedAt: null,
    answer: null,
    stale: false,
  });
  const answered = { markdown: 'It totals the order.', cites: [], at: Date.now() };
  page.ask = { listening: true, questions: [{ ...question('q1', 'what does it do?'), answer: answered }] };
  await key('\\');
  // happy-dom lays nothing out: the thread is given a size, scrolled up into its history
  const thread = $('#ask-thread');
  Object.defineProperty(thread, 'scrollHeight', { configurable: true, value: 1000 });
  Object.defineProperty(thread, 'clientHeight', { configurable: true, value: 200 });
  const scrolledUp = () => (thread.scrollTop = 100);
  scrolledUp();

  // the server holds the question once it's posted
  const stub = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
    if (init?.method === 'POST' && String(input).endsWith('/api/ask'))
      page.ask = { ...page.ask, questions: [...page.ask.questions, question('q2', 'and when it fails?')] };
    return stub(input, init);
  }) as typeof fetch;
  await type($('#ask-input'), 'and when it fails?');
  await click($('#ask-send'));
  await settle();
  assert.equal(thread.scrollTop, 1000, 'the thread shows the question just sent');

  // the agent's answer comes while the reader reads back: the thread stays where they are
  scrolledUp();
  const [first, second] = page.ask.questions;
  page.ask = {
    ...page.ask,
    questions: [first!, { ...second!, answer: { markdown: 'It throws.', cites: [], at: Date.now() } }],
  };
  await key('\\');
  await key('\\');
  assert.equal(thread.scrollTop, 100);
});

pageTest("an answer's markdown is drawn, its cites link, and nothing in it runs or leaves", async (page) => {
  const markdown = [
    'Two things happen in `src/orders.ts:10`:',
    '- it *reads* the row (src/orders.ts:11), see `src/orders.ts:11 on`',
    '  - nested',
    '',
    '### Check',
    '',
    '| Case | Now |',
    '| --- | --- |',
    '| empty | error |',
    '',
    '<img src=x onerror="alert(1)"> ![p](https://example.com/t.png) [docs](https://example.com/a) [x](javascript:alert(1))',
  ].join('\n');
  const cite = (line: number) => ({ ref: 'src/orders.ts:' + line, file: 'src/orders.ts', line });
  page.ask = {
    listening: true,
    questions: [
      {
        id: 'q1',
        text: 'what does it do?',
        file: 'src/orders.ts',
        unitId: null,
        label: 'orders.ts',
        hash: 'h1',
        selection: null,
        concerns: [],
        breaks: [],
        askedAt: Date.now() - 9000,
        handedAt: null,
        answer: { markdown, cites: [cite(10), cite(11)], at: Date.now() },
        stale: false,
      },
    ],
  };
  await key('\\');
  const answer = $('[data-part="ask-a"]');
  // a list right under its intro line is a list, and keeps its nesting
  assert.equal(answer.querySelector('p')!.textContent, 'Two things happen in 1:');
  assert.equal(answer.querySelectorAll(':scope > ul > li').length, 1);
  assert.equal(answer.querySelector('ul ul li')!.textContent, 'nested');
  assert.equal(answer.querySelector('em')!.textContent, 'reads');
  assert.equal(answer.querySelector('h3')!.textContent, 'Check');
  assert.equal(answer.querySelectorAll('td').length, 2);
  // cites are numbered markers, in text and inside `code`; one that is the whole `code` is the marker alone
  assert.deepEqual(
    [...answer.querySelectorAll<HTMLElement>('[data-part="ask-mark"]')].map((mark) => [
      mark.textContent,
      mark.dataset.line,
      mark.title,
    ]),
    [
      ['1', '10', 'src/orders.ts:10'],
      ['2', '11', 'src/orders.ts:11'],
      ['2', '11', 'src/orders.ts:11'],
    ],
  );
  assert.equal(answer.querySelector('code [data-part="ask-mark"]')!.textContent, '2');
  // and listed, folded, under the answer
  const sources = answer.querySelector<HTMLDetailsElement>('details[data-part="ask-sources"]')!;
  assert.equal(sources.open, false);
  assert.equal(sources.querySelector('summary')!.textContent, '2 sources');
  assert.deepEqual(
    [...sources.querySelectorAll('.cite')].map((button) => button.textContent),
    ['src/orders.ts:10', 'src/orders.ts:11'],
  );
  // html is shown, not run; no image is fetched; a link is its text and its address
  assert.equal(answer.querySelector('img'), null);
  assert.equal(answer.querySelector('a'), null);
  assert.match(answer.textContent!, /<img src=x onerror="alert\(1\)">/);
  assert.match(answer.textContent!, /docs \(https:\/\/example\.com\/a\)/);
  assert.match(answer.textContent!, /\[x\]\(javascript:alert\(1\)\)/);
});

pageTest("an answer's flow block is a lane of steps under their layers, and its Read line comes last", async (page) => {
  const markdown = [
    '**It goes through two layers.**',
    '',
    '```flow',
    'API: checks the body  src/orders.ts:10',
    'API: then the user',
    'db: inserts the row  src/orders.ts:11',
    '```',
    '',
    '```flow',
    'not a step at all',
    '```',
    '',
    'Read: orders.ts',
  ].join('\n');
  const cite = (line: number) => ({ ref: 'src/orders.ts:' + line, file: 'src/orders.ts', line });
  page.ask = {
    listening: true,
    questions: [
      {
        id: 'q1',
        text: 'how does it flow?',
        file: 'src/orders.ts',
        unitId: null,
        label: 'orders.ts',
        hash: 'h1',
        selection: null,
        concerns: [],
        breaks: [],
        askedAt: Date.now() - 9000,
        handedAt: null,
        answer: { markdown, cites: [cite(10), cite(11)], at: Date.now() },
        stale: false,
      },
    ],
  };
  await key('\\');
  const answer = $('[data-part="ask-a"]');
  const lane = answer.querySelector('[data-part="ask-flow"]')!;
  // a layer is named once over its run of steps
  assert.deepEqual(
    [...lane.children].map((item) => (item as HTMLElement).dataset.part + ' ' + item.textContent),
    [
      'ask-flow-layer API',
      'ask-flow-step checks the body  1',
      'ask-flow-step then the user',
      'ask-flow-layer db',
      'ask-flow-step inserts the row  2',
    ],
  );
  // a block that isn't steps stays code
  assert.equal(answer.querySelector('pre code')!.textContent, 'not a step at all\n');
  // the sources, then what the agent read, quieter
  const tail = [...answer.children].slice(-2);
  assert.equal((tail[0] as HTMLElement).dataset.part, 'ask-sources');
  assert.equal((tail[1] as HTMLElement).dataset.part, 'ask-read');
  assert.equal(tail[1].textContent, 'Read: orders.ts');
});
