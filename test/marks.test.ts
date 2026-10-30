import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { changeMark, marksFor, MARKS_CAP, readStoredMarks } from '../src/cli-app/marks/store.ts';
import { createMarkRoutes, parseMarkChange } from '../src/cli-app/marks/routes.ts';
import { clearKinds, describeKinds } from '../src/cli-app/clear.ts';
import { reviewKey, summaryKey } from '../src/cli-app/summary/store.ts';
import type { ViewerInput } from '../src/cli-app/render/web/server.ts';

function tempRoot(): string {
  // realpath: on Windows tmpdir() can be an 8.3 short path
  return realpathSync.native(mkdtempSync(join(tmpdir(), 'lens-marks-')));
}

// ---- the store: one file per review ----

test("a review's marks come back for it, and another review's are its own", () => {
  const root = tempRoot();
  try {
    const place = { root, cwd: root, review: 'diff@feature-a' };
    changeMark(place, { list: 'files', key: 'src/a.ts@h1', on: true });
    changeMark(place, { list: 'units', key: 'src/a.ts#total@u1', on: true });
    changeMark(place, { list: 'concerns', key: 'src/a.ts#total@u1#risk:N3:empty?', mark: 'real' });
    assert.deepEqual(marksFor(place), {
      files: ['src/a.ts@h1'],
      units: ['src/a.ts#total@u1'],
      concerns: { 'src/a.ts#total@u1#risk:N3:empty?': 'real' },
    });
    assert.ok(existsSync(join(root, '.lens', 'marks', 'diff@feature-a.json')));
    assert.deepEqual(marksFor({ ...place, review: 'diff@feature-b' }), { files: [], units: [], concerns: {} });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a file's mark is kept from the root, and shown from where lens runs", () => {
  const root = tempRoot();
  try {
    const cwd = join(root, 'app');
    mkdirSync(cwd);
    changeMark({ root, cwd, review: 'diff@main' }, { list: 'files', key: 'src/a@b.ts@h1', on: true });
    assert.deepEqual(readStoredMarks(root, 'diff@main').files, ['app/src/a@b.ts@h1'], 'a path may hold an @');
    assert.deepEqual(marksFor({ root, cwd, review: 'diff@main' }).files, ['src/a@b.ts@h1']);
    assert.deepEqual(marksFor({ root, cwd: root, review: 'diff@main' }).files, ['app/src/a@b.ts@h1']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('ticking a new version drops the old one, unticking only takes its own; a verdict again is taken back', () => {
  const root = tempRoot();
  try {
    const place = { root, cwd: root, review: 'diff@main' };
    changeMark(place, { list: 'files', key: 'a.ts@old', on: true });
    changeMark(place, { list: 'files', key: 'b.ts@1', on: true });
    changeMark(place, { list: 'files', key: 'a.ts@new', on: true });
    assert.deepEqual(marksFor(place).files, ['b.ts@1', 'a.ts@new']);
    changeMark(place, { list: 'files', key: 'b.ts@1', on: false });
    assert.deepEqual(marksFor(place).files, ['a.ts@new']);

    changeMark(place, { list: 'concerns', key: 'k1', mark: 'dismissed' });
    changeMark(place, { list: 'concerns', key: 'k2', mark: 'real' });
    changeMark(place, { list: 'concerns', key: 'k1', mark: 'real' });
    assert.deepEqual(
      Object.entries(marksFor(place).concerns),
      [
        ['k2', 'real'],
        ['k1', 'real'],
      ],
      'changed: newest',
    );
    changeMark(place, { list: 'concerns', key: 'k2', mark: null });
    assert.deepEqual(marksFor(place).concerns, { k1: 'real' });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('each list keeps its newest marks; another version, or a broken file, is none', () => {
  const root = tempRoot();
  try {
    const place = { root, cwd: root, review: 'diff@main' };
    const file = join(root, '.lens', 'marks', 'diff@main.json');
    mkdirSync(join(root, '.lens', 'marks'), { recursive: true });
    const units = Array.from({ length: MARKS_CAP }, (_, index) => `u${index}.ts#f@h`);
    writeFileSync(file, JSON.stringify({ version: 1, files: [], units, concerns: {} }));
    changeMark(place, { list: 'units', key: 'new.ts#f@h', on: true });
    const kept = marksFor(place).units;
    assert.equal(kept.length, MARKS_CAP);
    assert.equal(kept[0], 'u1.ts#f@h', 'the oldest went');
    assert.equal(kept.at(-1), 'new.ts#f@h');

    writeFileSync(file, JSON.stringify({ version: 2, files: ['a.ts@1'], units: [], concerns: {} }));
    assert.deepEqual(marksFor(place).files, []);
    writeFileSync(file, JSON.stringify({ version: 1, files: [], units: [], concerns: { k: 'maybe' } }));
    assert.deepEqual(marksFor(place).concerns, {});
    writeFileSync(file, '{ not json');
    assert.deepEqual(marksFor(place), { files: [], units: [], concerns: {} });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ---- which review ----

test("a review's key names its branch in diff and paths mode, and not for a PR", () => {
  assert.equal(summaryKey('paths', ['src'], 'feature-a'), 'paths-src@feature-a');
  assert.equal(summaryKey('paths', ['src']), 'paths-src', 'outside a repository, no branch');
  const root = tempRoot();
  try {
    // not a repository: no branch to name
    assert.equal(reviewKey(root, 'paths', ['.']), 'paths-.');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ---- the endpoint ----

test("a mark's change is checked before it's kept", () => {
  for (const [raw, reason] of [
    [null, /not a mark/],
    [{ list: 'files', key: '', on: true }, /key must be/],
    [{ list: 'files', key: 'x'.repeat(9000), on: true }, /key must be/],
    [{ list: 'files', key: 'a.ts', on: true }, /@ and its hash/],
    [{ list: 'units', key: 'a.ts#f@h', on: 'yes' }, /on must be/],
    [{ list: 'concerns', key: 'k', mark: 'maybe' }, /mark must be/],
    [{ list: 'notes', key: 'k' }, /list must be/],
  ] as const) {
    const change = parseMarkChange(raw);
    assert.ok('error' in change && reason.test(change.error), JSON.stringify(raw));
  }
  assert.deepEqual(parseMarkChange({ list: 'concerns', key: 'k', mark: null }), {
    list: 'concerns',
    key: 'k',
    mark: null,
  });
});

test('/api/marks keeps a change under the review the server shows now', async () => {
  const root = tempRoot();
  let changes = 0;
  let input = { root, cwd: root, review: 'diff@feature-a', files: [] } as unknown as ViewerInput;
  const routes = createMarkRoutes(
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
  const post = (body: unknown) =>
    fetch('http://127.0.0.1:' + (server.address() as AddressInfo).port + '/api/marks', {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });
  try {
    assert.equal((await post('{')).status, 400);
    assert.equal((await post({ list: 'files', key: 'a.ts' })).status, 400);
    assert.equal(changes, 0, 'nothing kept');

    assert.equal((await post({ list: 'files', key: 'a.ts@1', on: true })).status, 200);
    input = { ...input, review: 'diff@feature-b' } as ViewerInput; // ↻ on another branch
    assert.equal((await post({ list: 'files', key: 'b.ts@1', on: true })).status, 200);
    assert.equal(changes, 2);
    assert.deepEqual(readStoredMarks(root, 'diff@feature-a').files, ['a.ts@1']);
    assert.deepEqual(readStoredMarks(root, 'diff@feature-b').files, ['b.ts@1']);
  } finally {
    server.close();
    rmSync(root, { recursive: true, force: true });
  }
});

// ---- Clear saved data ----

test("Clear saved data: this review's marks, or every review's", () => {
  const root = tempRoot();
  try {
    const at = { root, key: 'diff@main', review: 'diff@main' };
    changeMark({ root, cwd: root, review: 'diff@main' }, { list: 'files', key: 'a.ts@1', on: true });
    changeMark({ root, cwd: root, review: 'diff@main' }, { list: 'concerns', key: 'k', mark: 'real' });
    changeMark({ root, cwd: root, review: 'pr-87' }, { list: 'units', key: 'a.ts#f@1', on: true });
    assert.deepEqual(describeKinds(at).find((kind) => kind.id === 'marks')!.plans, {
      this: { count: 2, paths: ['.lens/marks/diff@main.json'] },
      all: { count: 3, paths: ['.lens/marks/diff@main.json', '.lens/marks/pr-87.json'] },
    });
    // paths mode in a folder lens never kept a summary for still has a review: "this" is offered
    assert.deepEqual(
      Object.keys(
        describeKinds({ root, key: null, review: 'paths-.@main' }).find((kind) => kind.id === 'marks')!.plans,
      ),
      ['this', 'all'],
    );
    clearKinds(at, { marks: 'this' });
    assert.deepEqual(marksFor({ root, cwd: root, review: 'diff@main' }), { files: [], units: [], concerns: {} });
    assert.deepEqual(marksFor({ root, cwd: root, review: 'pr-87' }).units, ['a.ts#f@1']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
