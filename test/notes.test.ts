import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { placeNote } from '../src/cli-app/notes/place.ts';
import { changeNotes, notesFor, readStoredNotes, type ReaderNote } from '../src/cli-app/notes/store.ts';
import { createNoteRoutes, type NotesResponse } from '../src/cli-app/notes/routes.ts';
import { clearKinds, describeKinds } from '../src/cli-app/clear.ts';
import type { ViewerInput } from '../src/cli-app/render/web/server.ts';

// ---- where a note sits once the code moves under it ----

const lines = (text: string) => text.split('\n');
const at = (source: string[]) => (line: number) => source[line - 1];
const note = (start: number, end: number, text: string[], side: 'new' | 'old' = 'new') => ({
  side,
  start,
  end,
  lines: text,
});

test("a note stays on its lines while they're there as written", () => {
  const source = lines('a\nb\nc\nd');
  assert.deepEqual(placeNote(note(2, 3, ['b', 'c']), at(source), 4), { label: 'N3', start: 2, end: 3, changed: false });
});

test('a note follows its lines when an edit above moves them, to the nearest copy', () => {
  // two lines added above, and the same text further down: the nearer copy is its own
  const source = lines('x\ny\na\nb\nc\nd\nb\nc');
  assert.deepEqual(placeNote(note(2, 3, ['b', 'c']), at(source), 8), { label: 'N5', start: 4, end: 5, changed: false });
});

test('a note whose lines changed stays where it was, marked changed; one whose place is gone too is outdated', () => {
  const source = lines('a\nB\nc\nd');
  assert.deepEqual(placeNote(note(2, 2, ['b']), at(source), 4), { label: 'N2', start: 2, end: 2, changed: true });
  assert.equal(placeNote(note(6, 7, ['f', 'g']), at(source), 4), null);
});

test('a note on removed lines looks among the lines the diff removes, by their old numbers', () => {
  const removed = new Map([
    [16, 'export function legacyTotal() {'],
    [17, '  return 0;'],
  ]);
  const text = ['export function legacyTotal() {', '  return 0;'];
  assert.deepEqual(
    placeNote(note(16, 17, text, 'old'), (line) => removed.get(line), 17),
    {
      label: 'O17',
      start: 16,
      end: 17,
      changed: false,
    },
  );
  // the line is no longer removed (the edit was taken back): it's gone from the old side's view
  assert.equal(
    placeNote(note(16, 17, text, 'old'), () => undefined, 0),
    null,
  );
});

// ---- the store: one file per review, its paths from the root ----

function tempRoot(): string {
  // realpath: on Windows tmpdir() can be an 8.3 short path
  return realpathSync.native(mkdtempSync(join(tmpdir(), 'lens-notes-')));
}

const NOTE: Omit<ReaderNote, 'file'> = {
  id: 'n1',
  side: 'new',
  start: 2,
  end: 2,
  lines: ['b'],
  kind: 'risk',
  text: 'what if b is empty?',
  at: '2026-10-23T00:00:00Z',
};

test("notes are kept per review, with paths from the repository's root, shown with paths from where lens runs", () => {
  const root = tempRoot();
  try {
    const cwd = join(root, 'app');
    mkdirSync(cwd);
    const review = 'diff@feature-a';
    changeNotes({ root, cwd, review }, (notes) => [...notes, { ...NOTE, file: 'src/a.ts' }]);
    assert.equal(readStoredNotes(root, review)[0].file, 'app/src/a.ts', 'stored from the root');
    assert.ok(existsSync(join(root, '.lens', 'notes', 'diff@feature-a.json')), "in the review's own file");
    assert.deepEqual(
      notesFor({ root, cwd, review }, ['src/a.ts']).map((shown) => shown.file),
      ['src/a.ts'],
    );
    assert.deepEqual(
      notesFor({ root, cwd: root, review }, ['app/src/a.ts']).map((shown) => shown.file),
      ['app/src/a.ts'],
    );
    assert.deepEqual(notesFor({ root, cwd, review }, ['src/b.ts']), [], "only the review's files' notes");
    assert.deepEqual(
      notesFor({ root, cwd, review: 'diff@feature-b' }, ['src/a.ts']),
      [],
      "another branch's review has none",
    );
    assert.ok(readFileSync(join(root, '.lens', '.gitignore'), 'utf8').includes('*'), "in lens's ignored folder");
    // another version, or a broken file: none
    const file = join(root, '.lens', 'notes', 'diff@feature-a.json');
    writeFileSync(file, JSON.stringify({ version: 2, notes: [{ ...NOTE, file: 'x' }] }));
    assert.deepEqual(readStoredNotes(root, review), []);
    writeFileSync(file, '{ not json');
    assert.deepEqual(readStoredNotes(root, review), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the notes every review shared before are never shown, and Clear lists them under all', () => {
  const root = tempRoot();
  try {
    mkdirSync(join(root, '.lens'));
    writeFileSync(
      join(root, '.lens', 'notes.json'),
      JSON.stringify({ version: 1, notes: [{ ...NOTE, file: 'a.ts' }] }),
    );
    assert.deepEqual(notesFor({ root, cwd: root, review: 'diff@main' }, ['a.ts']), []);
    const at = { root, key: 'diff@main', review: 'diff@main' };
    assert.deepEqual(describeKinds(at).find((kind) => kind.id === 'notes')!.plans, {
      this: { count: 0, paths: [] },
      all: { count: 1, paths: ['.lens/notes.json'] },
    });
    clearKinds(at, { notes: 'all' });
    assert.ok(!existsSync(join(root, '.lens', 'notes.json')));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Clear saved data: this review's notes, or every review's", () => {
  const root = tempRoot();
  try {
    assert.deepEqual(describeKinds({ root, key: null, review: null }).find((kind) => kind.id === 'notes')!.plans, {
      all: { count: 0, paths: [] },
    });
    changeNotes({ root, cwd: root, review: 'diff@main' }, () => [
      { ...NOTE, file: 'a.ts' },
      { ...NOTE, id: 'n2', file: 'b.ts' },
    ]);
    changeNotes({ root, cwd: root, review: 'pr-87' }, () => [{ ...NOTE, file: 'a.ts' }]);
    const at = { root, key: 'diff@main', review: 'diff@main' };
    assert.deepEqual(describeKinds(at).find((kind) => kind.id === 'notes')!.plans, {
      this: { count: 2, paths: ['.lens/notes/diff@main.json'] },
      all: { count: 3, paths: ['.lens/notes/diff@main.json', '.lens/notes/pr-87.json'] },
    });
    assert.deepEqual(clearKinds(at, { notes: 'this' }).notes, { count: 2, paths: ['.lens/notes/diff@main.json'] });
    assert.deepEqual(readStoredNotes(root, 'pr-87').length, 1, "another review's stay");
    assert.deepEqual(clearKinds(at, { notes: 'all' }).notes, { count: 1, paths: ['.lens/notes/pr-87.json'] });
    assert.deepEqual(readStoredNotes(root, 'pr-87'), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ---- the endpoints ----

test("/api/notes: a note is checked, kept, edited and resolved, and each answer is the review's notes", async () => {
  const root = tempRoot();
  let changes = 0;
  const input = { root, cwd: root, review: 'diff@main', files: [{ file: 'src/a.ts' }] } as unknown as ViewerInput;
  const routes = createNoteRoutes(
    () => input,
    () => changes++,
  );
  const server = createServer(async (req, res) => {
    if (!(await routes.handle(req, res, new URL(req.url ?? '/', 'http://x')))) {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
  const send = (path: string, method: string, body?: unknown) =>
    fetch(base + path, { method, body: body === undefined ? undefined : JSON.stringify(body) });
  const valid = {
    file: 'src/a.ts',
    side: 'new',
    start: 3,
    end: 4,
    lines: ['c', 'd'],
    kind: 'bug',
    text: '  off by one  ',
  };
  try {
    for (const [patch, reason] of [
      [{ file: 'src/gone.ts' }, /isn't in the viewer/],
      [{ side: 'left' }, /side/],
      [{ start: 5 }, /start first/],
      [{ lines: ['c'] }, /text of each line/],
      [{ kind: 'nit' }, /kind must be/],
      [{ text: '   ' }, /empty/],
    ] as const) {
      const response = await send('/api/notes', 'POST', { ...valid, ...patch });
      assert.equal(response.status, 400);
      assert.match((await response.json()).error, reason);
    }
    assert.equal(changes, 0, 'nothing was written');

    const added: NotesResponse = await (await send('/api/notes', 'POST', valid)).json();
    assert.equal(added.notes.length, 1);
    const [kept] = added.notes;
    assert.deepEqual({ ...kept, id: '', at: '' }, { ...valid, text: 'off by one', id: '', at: '' });

    const edited: NotesResponse = await (
      await send('/api/notes/' + kept.id, 'POST', { kind: 'question', text: 'why?' })
    ).json();
    assert.equal(edited.notes[0].kind, 'question');
    assert.equal(edited.notes[0].text, 'why?');
    assert.deepEqual(edited.notes[0].lines, ['c', 'd'], 'an edit keeps its lines');
    assert.equal((await send('/api/notes/nope', 'POST', { kind: 'note', text: 'x' })).status, 404);

    const resolved: NotesResponse = await (await send('/api/notes/' + kept.id, 'DELETE')).json();
    assert.deepEqual(resolved.notes, []);
    assert.deepEqual(readStoredNotes(root, 'diff@main'), []);
    assert.equal(changes, 3, 'the server hears of each change: its held page has the old notes');
    assert.equal((await send('/api/notes', 'GET')).status, 404);
  } finally {
    server.close();
    rmSync(root, { recursive: true, force: true });
  }
});
