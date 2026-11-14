import { beforeEach, test } from 'bun:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readTimings, record, setTimings, timed, timingStats, timingsPath } from '../src/cli-app/timings.ts';
import { clearKinds, describeKinds } from '../src/cli-app/clear.ts';
import { DEFAULT_CONFIG } from '../src/cli-app/config.ts';
import { timingsOn, writeSettings } from '../src/cli-app/summary/settings.ts';

const cli = join(import.meta.dir, '..', 'src', 'cli-app', 'cli.ts');
const tempRoot = () => mkdtempSync(join(tmpdir(), 'lens-timings-'));
// each test its own ~/.lens: the timings file is the machine's, not a repository's
beforeEach(() => {
  process.env.LENS_HOME = tempRoot();
});

test('steps wait for the switch: on, they are written with what came before; off, nothing is', async () => {
  const root = join(tempRoot(), 'shop');
  mkdirSync(root);
  try {
    record('cli', 'before', 5);
    setTimings(root, false);
    record('cli', 'off', 1);
    assert.equal(existsSync(timingsPath()), false);

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
    const { timings, hosts } = readTimings();
    assert.ok(!existsSync(join(root, '.lens')), 'nothing in the repository: the file is the machine’s');
    assert.ok(
      timings.every((timing) => timing.repo === 'shop'),
      'each step names its repository',
    );
    assert.equal(hosts.length, 1, 'the run starts with the machine it ran on');
    assert.equal(typeof hosts[0].host.cores, 'number');
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
    process.env.LENS_HOME = root;
    assert.equal(timingsOn(DEFAULT_CONFIG), true);
    assert.equal(timingsOn({ ...DEFAULT_CONFIG, timings: true }), true);
    writeSettings({ timings: false });
    assert.equal(timingsOn({ ...DEFAULT_CONFIG, timings: true }), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Clear saved data lists the timings and clears them, and lens timings reads them', () => {
  const root = tempRoot();
  try {
    execFileSync('git', ['init', '-q'], { cwd: root });
    const empty = execFileSync('bun', [cli, 'timings'], { cwd: root, encoding: 'utf8' });
    const other = join(tempRoot(), 'other');
    mkdirSync(other);
    assert.match(empty, /no timings yet: open or refresh a review/, 'on by default, with nothing recorded');

    setTimings(root, true);
    record('cli', 'analyze', 120, '3 files');
    record('viewer', 'open file', 40, 'src/a.ts, 10 lines');
    setTimings(other, true);
    record('cli', 'analyze', 300, '9 files');
    setTimings(root, false);
    // read from anywhere: a folder that is no repository at all
    const anywhere = { cwd: tmpdir(), encoding: 'utf8' } as const;
    const printed = execFileSync('bun', [cli, 'timings'], anywhere);
    const name = root.split(/[\\/]/).pop()!;
    assert.match(printed, new RegExp(name + '\\s+cli analyze\\s+1\\s+120 ms\\s+120 ms\\s+120 ms\\s+3 files'));
    assert.match(printed, /other\s+cli analyze\s+1\s+300 ms/);
    assert.match(printed, /viewer open file/);
    assert.match(printed, /cores\), \d+ GB, bun /, 'the machine the last run ran on');
    const json = JSON.parse(execFileSync('bun', [cli, 'timings', '--json'], anywhere));
    assert.equal(json.timings.length, 3);
    assert.equal(json.hosts.length, 1);
    const one = JSON.parse(execFileSync('bun', [cli, 'timings', '--json', '--repo', 'other'], anywhere));
    assert.deepEqual(
      one.timings.map((timing: { repo: string; ms: number }) => [timing.repo, timing.ms]),
      [['other', 300]],
    );

    const at = { root, key: null, review: null };
    const path = timingsPath().replaceAll('\\', '/');
    const kind = describeKinds(at).find((info) => info.id === 'timings')!;
    assert.deepEqual(kind.plans, { all: { count: 3, paths: [path] } });
    assert.deepEqual(clearKinds(at, { timings: 'all' }).timings, { count: 3, paths: [path] });
    assert.equal(existsSync(timingsPath()), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a file past its size keeps its newer half', () => {
  const root = tempRoot();
  try {
    setTimings(root, true);
    const line = JSON.stringify({ at: 'x', run: 'r', side: 'cli', name: 'old', ms: 1, detail: 'y'.repeat(900) });
    writeFileSync(timingsPath(), (line + '\n').repeat(11_000));
    record('cli', 'new', 1);
    const kept = readFileSync(timingsPath(), 'utf8').trim().split('\n');
    assert.ok(kept.length < 5600 && kept.length > 5400, 'past 10 MB: the newer half');
    assert.equal(JSON.parse(kept[kept.length - 1]).name, 'new');
  } finally {
    setTimings(root, false);
    rmSync(root, { recursive: true, force: true });
  }
});
