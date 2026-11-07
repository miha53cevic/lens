import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readTimings, record, setTimings, timed, timingStats, TIMINGS_PATH } from '../src/cli-app/timings.ts';
import { clearKinds, describeKinds } from '../src/cli-app/clear.ts';
import { DEFAULT_CONFIG } from '../src/cli-app/config.ts';
import { timingsOn, writeSettings } from '../src/cli-app/summary/settings.ts';

const cli = join(import.meta.dir, '..', 'src', 'cli-app', 'cli.ts');
const tempRoot = () => mkdtempSync(join(tmpdir(), 'lens-timings-'));

test('steps wait for the switch: on, they are written with what came before; off, nothing is', async () => {
  const root = tempRoot();
  try {
    record('cli', 'before', 5);
    setTimings(root, false);
    record('cli', 'off', 1);
    assert.equal(existsSync(join(root, TIMINGS_PATH)), false);

    setTimings(root, true);
    record('server', 'tokens', 12.34, 'vesper');
    assert.equal(
      timed('cli', 'sync', () => 7),
      7,
    );
    assert.equal(
      await timed(
        'cli',
        'async',
        () => Promise.resolve('done'),
        () => '3 files',
      ),
      'done',
    );
    // a step that throws is still timed, and still throws
    await assert.rejects(timed('cli', 'fails', () => Promise.reject(new Error('no'))));
    const timings = readTimings(root);
    // "before" waited for a switch that said off: it was dropped then, not kept for later
    assert.deepEqual(
      timings.map((timing) => [timing.side, timing.name]),
      [
        ['server', 'tokens'],
        ['cli', 'sync'],
        ['cli', 'async'],
        ['cli', 'fails'],
      ],
    );
    assert.equal(timings[0].ms, 12.3);
    assert.equal(timings[0].detail, 'vesper');
    assert.equal(timings[2].detail, '3 files');
  } finally {
    setTimings(root, false);
    rmSync(root, { recursive: true, force: true });
  }
});

test('stats: count, median, max and the last of each step, in the order they first came', () => {
  const at = '2026-01-01T00:00:00.000Z';
  const stats = timingStats(
    [
      ['server', 'GET /api/stamp', 30],
      ['cli', 'analyze', 900],
      ['server', 'GET /api/stamp', 10],
      ['server', 'GET /api/stamp', 20],
    ].map(([side, name, ms]) => ({
      at,
      run: 'r',
      side: side as 'cli' | 'server',
      name: name as string,
      ms: ms as number,
    })),
  );
  assert.deepEqual(
    stats.map((stat) => [stat.name, stat.count, stat.median, stat.max, stat.last]),
    [
      ['GET /api/stamp', 3, 20, 30, 20],
      ['analyze', 1, 900, 900, 900],
    ],
  );
});

test('the switch: the reader’s setting wins over the config', () => {
  const root = tempRoot();
  try {
    assert.equal(timingsOn(root, DEFAULT_CONFIG), false);
    assert.equal(timingsOn(root, { ...DEFAULT_CONFIG, timings: true }), true);
    writeSettings(root, { timings: false });
    assert.equal(timingsOn(root, { ...DEFAULT_CONFIG, timings: true }), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Clear saved data lists the timings and clears them, and lens timings reads them', () => {
  const root = tempRoot();
  try {
    execFileSync('git', ['init', '-q'], { cwd: root });
    const empty = execFileSync('bun', [cli, 'timings'], { cwd: root, encoding: 'utf8' });
    assert.match(empty, /no timings: turn them on/);

    setTimings(root, true);
    record('cli', 'analyze', 120, '3 files');
    record('viewer', 'open file', 40, 'src/a.ts, 10 lines');
    setTimings(root, false);
    const printed = execFileSync('bun', [cli, 'timings'], { cwd: root, encoding: 'utf8' });
    assert.match(printed, /cli analyze\s+1\s+120 ms\s+120 ms\s+120 ms\s+3 files/);
    assert.match(printed, /viewer open file/);
    const json = JSON.parse(execFileSync('bun', [cli, 'timings', '--json'], { cwd: root, encoding: 'utf8' }));
    assert.equal(json.length, 2);

    const at = { root, key: null, review: null };
    const kind = describeKinds(at).find((info) => info.id === 'timings')!;
    assert.deepEqual(kind.plans, { all: { count: 2, paths: ['.lens/timings.jsonl'] } });
    assert.deepEqual(clearKinds(at, { timings: 'all' }).timings, { count: 2, paths: ['.lens/timings.jsonl'] });
    assert.equal(existsSync(join(root, TIMINGS_PATH)), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a file past its size keeps its newer half', () => {
  const root = tempRoot();
  try {
    setTimings(root, true);
    mkdirSync(join(root, '.lens'));
    const line = JSON.stringify({ at: 'x', run: 'r', side: 'cli', name: 'old', ms: 1, detail: 'y'.repeat(900) });
    writeFileSync(join(root, '.lens', 'timings.jsonl'), (line + '\n').repeat(2500));
    record('cli', 'new', 1);
    const kept = readFileSync(join(root, TIMINGS_PATH), 'utf8').trim().split('\n');
    assert.ok(kept.length < 1300 && kept.length > 1200);
    assert.equal(JSON.parse(kept[kept.length - 1]).name, 'new');
  } finally {
    setTimings(root, false);
    rmSync(root, { recursive: true, force: true });
  }
});
