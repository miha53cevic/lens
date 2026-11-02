/// <reference types="bun" />
// The viewer page: the reader's notes, and the code's right-click menu.
// The harness is test/fixtures/viewerPage.ts.

import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { fireEvent } from '@testing-library/dom';
import type { ReaderNote } from '../src/cli-app/notes/store.ts';
import {
  close,
  settle,
  key,
  click,
  type,
  $,
  $$,
  pageTest,
  selectRows,
  ticks,
  status,
  LINE_10,
  rightClick,
  storedNote,
  openWithNotes,
  usePage,
} from './fixtures/viewerPage.ts';

usePage();

pageTest('a right-click on a line selects it and opens the code menu; Add a note writes one under it', async (page) => {
  const line = (n: number) => $('#code .row[data-line="' + n + '"]');
  await rightClick(line(10));
  assert.ok(line(10).classList.contains('ask-sel'), 'the line under the pointer is the selection now');
  assert.deepEqual(
    $$('#code-menu [role="menuitem"] > span:first-of-type').map((label) => label.textContent),
    ['Ask about these lines', 'Add a note', 'Copy lines', 'Copy file:line'],
  );

  await click($('#code-menu-note'));
  assert.equal(document.activeElement, $('#note-input'), 'the composer takes the keys');
  assert.equal($('#note-composer [data-part="rn-meta"]').textContent, 'orders.ts:10');
  assert.ok(!line(10).classList.contains('ask-sel'), 'the noted lines are no longer the Ask selection');
  assert.ok(($('#note-save') as HTMLButtonElement).disabled, 'nothing to save yet');
  await click($('#note-kind-risk'));
  await type($('#note-input'), 'deleted is a string column');
  await click($('#note-save'));

  const sent = page.requests.find((request) => request.method === 'POST' && request.path === '/api/notes')!;
  assert.deepEqual(sent.body, {
    file: 'src/orders.ts',
    side: 'new',
    start: 10,
    end: 10,
    lines: [LINE_10],
    kind: 'risk',
    text: 'deleted is a string column',
  });
  assert.equal($$('#note-composer').length, 0);
  const card = $('#code [data-part="line-note"][data-note="n1"]');
  assert.equal(card.querySelector('[data-part="rn-meta"]')!.textContent, 'goes along to your agent');
  assert.equal(card.querySelector('[data-part="rn-text"]')!.textContent, 'deleted is a string column');
  assert.ok(line(10).matches('.noted.k-risk'));
  assert.ok(ticks().includes('risk N10'), 'the ruler ticks it, as it does a concern');
  assert.equal(status().label, 'Note added');

  // the Summary tab's unit shows the same note under the same line
  await key('v');
  await key('j');
  assert.ok($('[data-part="unit-code"] [data-part="line-note"][data-note="n1"]'));
  assert.ok($('[data-part="unit-code"] .row[data-line="10"]').classList.contains('noted'));
});

pageTest('n no longer writes a note; the code menu notes the selected lines; Esc leaves the composer', async () => {
  await key('n');
  assert.equal($$('#note-composer').length, 0);
  await selectRows($('#code .row[data-line="10"]'), $('#code .row[data-line="11"]'));
  await rightClick($('#code .row[data-line="11"]'));
  await click($('#code-menu-note'));
  assert.equal($('#note-composer [data-part="rn-meta"]').textContent, 'orders.ts:10–11');
  fireEvent.keyDown($('#note-input'), { key: 'Escape' });
  await settle();
  assert.equal($$('#note-composer').length, 0);
});

pageTest('a removed line takes a note on the old side, by its old number', async (page) => {
  await rightClick($('#code .row.removed[data-old="17"]'));
  await click($('#code-menu-note'));
  assert.equal($('#note-composer [data-part="rn-meta"]').textContent, 'orders.ts: removed 17');
  await type($('#note-input'), 'was this exported?');
  fireEvent.keyDown($('#note-input'), { key: 'Enter' }); // Enter saves, Shift Enter is a new line
  await settle();
  const sent = page.requests.find((request) => request.method === 'POST' && request.path === '/api/notes')!;
  const body = sent.body as ReaderNote;
  assert.deepEqual([body.side, body.start, body.end, body.kind], ['old', 17, 17, 'note']);
  assert.equal($('#code [data-part="line-note"] [data-part="rn-meta"]').textContent, 'only you see it');
});

test('a note is edited in place and resolved; one whose line changed says so; one whose lines are gone is listed above the code', async () => {
  const page = await openWithNotes([
    storedNote(),
    storedNote({ id: 'n2', start: 11, end: 11, lines: ['  return rows.map(toOrderOld);'], kind: 'note', text: 'mine' }),
    storedNote({ id: 'n3', start: 90, end: 91, lines: ['a', 'b'], kind: 'bug', text: 'gone' }),
  ]);
  try {
    assert.equal(
      $('#code [data-part="line-note"][data-note="n2"] [data-part="rn-meta"]').textContent,
      'the line changed since',
    );
    assert.ok($('#code [data-part="outdated-notes"] [data-part="line-note"][data-note="n3"]'));
    assert.equal(
      $('#code [data-part="outdated-notes"] [data-part="rn-meta"]').textContent,
      'outdated: its lines are gone',
    );

    await click($('#code [data-part="line-note"][data-note="n1"] [data-part="rn-edit"]'));
    assert.equal(($('#note-input') as HTMLTextAreaElement).value, 'deleted is a string column');
    assert.equal($$('#code [data-part="line-note"][data-note="n1"]').length, 0, 'its composer takes its place');
    await click($('#note-kind-question'));
    await type($('#note-input'), 'is deleted a string column?');
    await click($('#note-save'));
    const edit = page.requests.find((request) => request.method === 'POST' && request.path === '/api/notes/n1')!;
    assert.deepEqual(edit.body, { kind: 'question', text: 'is deleted a string column?' });
    assert.ok($('#code [data-part="line-note"].k-question[data-note="n1"]'));

    await click($('#code [data-part="line-note"][data-note="n1"] [data-part="rn-resolve"]'));
    assert.ok(page.requests.some((request) => request.method === 'DELETE' && request.path === '/api/notes/n1'));
    assert.equal($$('#code [data-part="line-note"][data-note="n1"]').length, 0);
  } finally {
    await close();
  }
});

test("the overview copies the notes for the agent with the confirmed findings; a plain note stays the reader's", async () => {
  await openWithNotes([storedNote(), storedNote({ id: 'n2', kind: 'note', text: 'look again tomorrow' })]);
  try {
    await key('v');
    assert.equal($('[data-part="ov-real-count"]').textContent, '1 note');
    await click($('[data-part="ov-real-copy"]'));
    assert.equal(
      await navigator.clipboard.readText(),
      [
        'Act on these notes the reviewer wrote in a lens review. Fix the bugs and risks; answer the questions without changing code.',
        '',
        '1. [risk · reviewer] src/orders.ts:10',
        '   deleted is a string column',
        '',
      ].join('\n'),
    );
    assert.equal(status().label, 'Copied 1 note');
    // with a confirmed concern too
    await key('j');
    await click($('[data-part="concern"] [data-part="vbtn"][data-mark="real"]'));
    await key('g');
    assert.equal($('[data-part="ov-real-count"]').textContent, '1 note and 1 confirmed concern');
    await click($('[data-part="ov-real-copy"]'));
    const text = await navigator.clipboard.readText();
    assert.ok(text.startsWith('Act on these lens review findings: the reviewer raised some and confirmed the others.'));
    assert.ok(text.includes('2. [bug] src/orders.ts:10 — findOrders'));
  } finally {
    await close();
  }
});

test('your notes are marked in the tree and the summary list, and ⇧N steps through them', async () => {
  const removedNote = storedNote({
    id: 'n2',
    side: 'old',
    start: 17,
    end: 17,
    lines: ['export function legacyTotal(rows: Order[]): number {'],
    kind: 'note',
    text: 'gone for good?',
  });
  await openWithNotes([removedNote, storedNote()]);
  try {
    const mark = (row: Element) => row.querySelector('[data-part="note-mark"]')?.textContent ?? null;
    const file = $$('#nav [data-part="file"]').find((row) => row.textContent!.includes('orders.ts'))!;
    assert.equal(mark(file), '2', 'two on the file');
    assert.equal(file.querySelector('[data-part="note-mark"]')!.getAttribute('title'), '2 notes of yours');

    const landed = () => $$('#code .row.landed').map((row) => row.dataset.line ?? '−' + row.dataset.old);
    await key('N', { shiftKey: true });
    assert.deepEqual(landed(), ['10'], 'in the order of the code');
    await key('N', { shiftKey: true });
    assert.deepEqual(landed(), ['−17']);
    await key('N', { shiftKey: true });
    assert.deepEqual(landed(), ['−17'], 'no file after it holds one');

    await key('v');
    // from the overview: the first change in the list's order with a note, on that note
    await key('N', { shiftKey: true });
    assert.equal($('[data-part="summary-pane"] h1').textContent, 'legacyTotal is gone');
    assert.deepEqual(
      $$('[data-part="unit-code"] .row.landed').map((row) => row.dataset.old),
      ['17'],
    );
  } finally {
    await close();
  }
});

test('once every file is viewed, the review pill hands the notes for the agent over', async () => {
  await openWithNotes([storedNote(), storedNote({ id: 'n2', kind: 'note', text: 'mine' })], { summary: null });
  try {
    await key('m');
    assert.equal($('#review-next').textContent!.trim(), 'All 1 viewed');
    assert.equal($('#review-handoff').textContent!.trim(), 'Copy 1 note for your agent');
    await click($('#review-handoff'));
    assert.ok((await navigator.clipboard.readText()).includes('1. [risk · reviewer] src/orders.ts:10'));
    assert.equal(status().label, 'Copied 1 note');
  } finally {
    await close();
  }
  // nothing for the agent: the pill only says it's done
  await openWithNotes([storedNote({ kind: 'note', text: 'mine' })], { summary: null });
  try {
    await key('m');
    assert.equal($('#review-next').textContent!.trim(), 'All 1 file viewed');
    assert.equal($$('#review-handoff').length, 0);
  } finally {
    await close();
  }
});

test('without a summary, the sidebar counts the notes for the agent and copies them', async () => {
  await openWithNotes([storedNote(), storedNote({ id: 'n2', kind: 'note', text: 'mine' })], { summary: null });
  try {
    assert.equal($('#nav [data-part="notes-for-agent"]').textContent, '1 note for your agent Copy');
    await click($('#notes-copy'));
    assert.ok((await navigator.clipboard.readText()).includes('1. [risk · reviewer] src/orders.ts:10'));
  } finally {
    await close();
  }
  // with a summary, the overview does it: the sidebar says nothing
  await openWithNotes([storedNote()]);
  try {
    assert.equal($$('#nav [data-part="notes-for-agent"]').length, 0);
  } finally {
    await close();
  }
});

pageTest(
  'the code menu copies the lines and their place; anywhere but a line, the browser keeps its menu',
  async () => {
    await selectRows($('#code .row[data-line="10"]'), $('#code .row[data-line="11"]'));
    await rightClick($('#code .row[data-line="11"]'));
    assert.ok($('#code .row[data-line="10"]').classList.contains('ask-sel'), 'inside the selection: it stays');
    await click($('#code-menu-place'));
    assert.equal(await navigator.clipboard.readText(), 'src/orders.ts:10–11');
    await click($('#code-menu-copy'));
    assert.equal(await navigator.clipboard.readText(), LINE_10 + '\n  return rows.map(toOrder);\n');

    const outside = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 });
    $('#nav').dispatchEvent(outside);
    assert.ok(!outside.defaultPrevented, 'the sidebar keeps the browser menu');
    const pill = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 });
    $('#code .pill-row').dispatchEvent(pill);
    assert.ok(!pill.defaultPrevented, "a fold's pill isn't a line");
  },
);
