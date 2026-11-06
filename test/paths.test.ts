import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { relPath, resolveLineRef, toPosix } from '../src/cli-app/paths.ts';
import { summaryArgs } from '../src/cli-app/summary/store.ts';

test('relPath is /-separated on every OS, and falls back to the path itself', () => {
  const root = resolve('repo');
  assert.equal(relPath(root, join(root, 'src', 'summary', 'units.ts')), 'src/summary/units.ts');
  assert.equal(relPath(root, root), toPosix(root));
  assert.ok(!toPosix(join('a', 'b')).includes('\\'));
});

test("summaryArgs prints the diff's arguments as a shell takes them", () => {
  assert.equal(summaryArgs('diff', ['--staged']), '--staged');
  assert.equal(summaryArgs('diff', []), '');
  assert.equal(summaryArgs('pr', ['87']), 'pr 87');
  assert.equal(summaryArgs('diff', ['main...feature', '--', 'my dir/a.ts']), 'main...feature -- "my dir/a.ts"');
  assert.equal(summaryArgs('diff', ['say "hi"']), '"say \\"hi\\""');
});

test('resolveLineRef points at a real line under the root, or says why not', () => {
  const root = mkdtempSync(join(tmpdir(), 'lens-ref-'));
  mkdirSync(join(root, 'src'));
  writeFileSync(join(root, 'src', 'a.ts'), 'one\ntwo\nthree');
  const cache = new Map<string, string[] | null>();
  assert.deepEqual(resolveLineRef(root, 'src/a.ts:2', cache), { file: 'src/a.ts', line: 2, text: 'two' });
  assert.deepEqual(resolveLineRef(root, ' src/a.ts:3 ', cache), { file: 'src/a.ts', line: 3, text: 'three' });
  assert.deepEqual(resolveLineRef(root, 'src/a.ts:4', cache), { error: '— the file has only 3 lines' });
  assert.deepEqual(resolveLineRef(root, 'src/a.ts:0', cache), { error: '— lines count from 1' });
  writeFileSync(join(root, 'src', 'c.ts'), 'one\ntwo\n');
  assert.deepEqual(
    resolveLineRef(root, 'src/c.ts:3', cache),
    { error: '— the file has only 2 lines' },
    'a final newline is no extra line',
  );
  assert.deepEqual(resolveLineRef(root, 'src/b.ts:1', cache), { error: '— file not found' });
  assert.deepEqual(resolveLineRef(root, 'src:1', cache), { error: '— file not found' });
  assert.deepEqual(resolveLineRef(root, '../a.ts:1', cache), {
    error: 'must be a path relative to the repository root',
  });
  assert.deepEqual(resolveLineRef(root, 'src/a.ts', cache), { error: 'must look like "path/to/file.ts:31"' });
  writeFileSync(join(root, '..dots.ts'), 'one\n');
  assert.deepEqual(resolveLineRef(root, '..dots.ts:1', cache), { file: '..dots.ts', line: 1, text: 'one' });
});
