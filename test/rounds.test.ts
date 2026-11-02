/// <reference types="bun" />
// Rounds: what the reader sent, the code kept with it, and what changed since. Real text diffs by
// git, and a real temp repository through the analysis, as the page gets it.

import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { analyze } from '../src/cli-app/analyze.ts';
import { clearKinds, describeKinds } from '../src/cli-app/clear.ts';
import { loadConfig } from '../src/cli-app/config.ts';
import { parseRound } from '../src/cli-app/rounds/routes.ts';
import { addRound, fileDelta, readRounds, sentForAgent, type SentFinding } from '../src/cli-app/rounds/store.ts';

const lines = (...text: string[]) => text.join('\n') + '\n';

test('fileDelta: new lines, what was removed and which old lines went, from git', () => {
  const before = lines('a', 'b', 'c', 'd', 'e');
  assert.deepEqual(fileDelta(before, before).changedLines, []);
  const delta = fileDelta(before, lines('a', 'B', 'c', 'new', 'd'));
  assert.deepEqual(delta.changedLines, [2, 4]);
  assert.deepEqual([...delta.oldLines], [2, 5]);
  assert.deepEqual(delta.removals[0], { afterLine: 1, oldStart: 2, lines: ['b'] });
  assert.deepEqual(delta.removals[1], { afterLine: 5, oldStart: 5, lines: ['e'] });
  // a new file: everything is new
  assert.deepEqual(fileDelta('', lines('x', 'y')).changedLines, [1, 2]);
});

test('a send keeps the code once; the same code again is the same round, and an old round lets its text go', () => {
  const root = mkdtempSync(join(tmpdir(), 'lens-rounds-'));
  try {
    const finding = (key: string): SentFinding => ({ key, kind: 'bug', text: key, unit: null, file: 'a.ts', line: 2 });
    addRound(root, 'r', { 'a.ts': 'one' }, [finding('first')]);
    addRound(root, 'r', { 'a.ts': 'one' }, [finding('again')]);
    assert.deepEqual(
      readRounds(root, 'r').map((round) => round.findings.map((sent) => sent.key)),
      [['first', 'again']],
      'it holds what both sends sent',
    );
    addRound(root, 'r', { 'a.ts': 'one' }, [{ ...finding('first'), text: 'reworded' }]);
    assert.deepEqual(
      readRounds(root, 'r')[0].findings.map((sent) => [sent.key, sent.text]),
      [
        ['again', 'again'],
        ['first', 'reworded'],
      ],
      'the same finding again is the one finding',
    );
    addRound(root, 'r', { 'a.ts': 'two' }, [finding('second')]);
    const rounds = readRounds(root, 'r');
    assert.equal(rounds.length, 2);
    assert.deepEqual(rounds[0].files, {}, 'only the latest keeps its text');
    assert.deepEqual(rounds[1].files, { 'a.ts': 'two' });
    assert.deepEqual(sentForAgent(root, 'r'), [{ key: 'second', text: 'second', place: '[bug] a.ts:2' }]);
    assert.deepEqual(readRounds(root, 'nothing'), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('POST /api/rounds takes findings with a place, and nothing else', () => {
  const good = { key: 'k', kind: 'bug', text: 't', unit: null, file: 'a.ts', line: 3 };
  assert.deepEqual(parseRound({ findings: [good] }), { findings: [good] });
  assert.ok('error' in parseRound({ findings: [] }));
  assert.ok('error' in parseRound(null));
  assert.ok('error' in parseRound({ findings: [{ ...good, line: 0 }] }));
  assert.ok('error' in parseRound({ findings: [{ ...good, line: '3' }] }));
  assert.ok('error' in parseRound({ findings: [{ ...good, key: '' }] }));
  assert.deepEqual(parseRound({ findings: [{ ...good, endLine: 5 }] }), { findings: [{ ...good, endLine: 5 }] });
  assert.ok('error' in parseRound({ findings: [{ ...good, endLine: 2 }] }), 'it ends before it starts');
  assert.ok('error' in parseRound({ findings: [{ ...good, line: null, endLine: 5 }] }));
});

test('rounds are a kind of saved data: per review, cleared by kind', () => {
  const root = mkdtempSync(join(tmpdir(), 'lens-rounds-'));
  try {
    addRound(root, 'r', { 'a.ts': 'x' }, [{ key: 'k', kind: 'bug', text: 't', unit: null, file: 'a.ts', line: 1 }]);
    const at = { root, key: 'r', review: 'r' };
    const kind = describeKinds(at).find((entry) => entry.id === 'rounds')!;
    assert.deepEqual(kind.plans.this, { count: 1, paths: ['.lens/rounds/r.json'] });
    clearKinds(at, { rounds: 'this' });
    assert.equal(existsSync(join(root, '.lens/rounds/r.json')), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

const SOURCE = `export function one(a: number) {
  return a + 1;
}

export function two(b: number) {
  return b + 2;
}

export function three(c: number) {
  return c + 3;
}
`;

test('through the analysis: only what changed since the round counts, and each finding says what became of it', async () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'lens-rounds-')));
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
  try {
    git('init', '-q', '-b', 'main');
    git('config', 'user.email', 't@t');
    git('config', 'user.name', 't');
    writeFileSync(join(dir, 'a.ts'), SOURCE.replaceAll('+', '-'));
    git('add', '-A');
    git('commit', '-qm', 'base');
    writeFileSync(join(dir, 'a.ts'), SOURCE);
    const config = loadConfig(dir);

    const first = await analyze('diff', [], dir, config);
    assert.equal(first.summary?.round, null, 'nothing sent yet');
    const onThree = (key: string, line: number): SentFinding => ({
      key,
      kind: 'bug',
      text: key,
      unit: 'a.ts#three',
      file: 'a.ts',
      line,
    });
    const onOne: SentFinding = { key: 'fixed-it', kind: 'bug', text: 'one', unit: 'a.ts#one', file: 'a.ts', line: 2 };
    const onTwo: SentFinding = { key: 'beside-it', kind: 'risk', text: 'two', unit: 'a.ts#two', file: 'a.ts', line: 5 };
    const note = (key: string, line: number | null, endLine?: number): SentFinding => ({
      key,
      kind: 'bug',
      text: key,
      unit: null,
      file: 'a.ts',
      line,
      ...(endLine === undefined ? {} : { endLine }),
    });
    addRound(dir, first.review, { 'a.ts': SOURCE }, [
      onOne,
      onTwo,
      onThree('left-alone', 10),
      note('note-to-its-end', 1, 2),
      note('note-above-it', 1, 1),
      note('note-on-removed-lines', null),
    ]);

    // the same code: nothing changed since
    const same = await analyze('diff', [], dir, config);
    assert.deepEqual(same.summary?.round?.units, []);
    assert.deepEqual(
      same.summary?.round?.findings.map((finding) => finding.state),
      ['untouched', 'untouched', 'untouched', 'untouched', 'untouched', 'untouched'],
    );

    // the agent changes one's flagged line, and another line of two
    writeFileSync(join(dir, 'a.ts'), SOURCE.replace('a + 1', 'a + 100').replace('b + 2', 'b + 200'));
    const next = await analyze('diff', [], dir, config);
    const round = next.summary!.round!;
    assert.equal(round.round, 2);
    assert.deepEqual(round.units.toSorted(), ['a.ts#one', 'a.ts#two']);
    assert.deepEqual(round.files[0].changedLines, [2, 6]);
    assert.deepEqual(
      round.findings.map((finding) => [finding.key, finding.state]),
      [
        ['fixed-it', 'changed'],
        ['beside-it', 'nearby'],
        ['left-alone', 'untouched'],
        ['note-to-its-end', 'changed'],
        ['note-above-it', 'untouched'],
        ['note-on-removed-lines', 'nearby'],
      ],
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
