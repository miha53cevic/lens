import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { cliEnv, cliReason, compiledCli, findBun, sourceCli, lensInfo } from '../src/desktop/main/cli.ts';
import { freePort, isPortInUse, startReview } from '../src/desktop/main/session.ts';
import { openStore } from '../src/desktop/main/store.ts';
import { makeViewerRepo } from './fixtures/viewerRepo.ts';

// the CLI as the tests run it: this bun on the sources, as the app runs it from a checkout
const cli = { ...sourceCli(join(import.meta.dirname, '..'), process.execPath), env: process.env };

test('a review starts on the line the CLI prints, serves its viewer, and stops clean', async () => {
  const dir = makeViewerRepo();
  try {
    const port = await freePort();
    const session = await startReview(cli, dir, ['diff'], port).ready;
    assert.equal(session.url, `http://127.0.0.1:${port}/`);
    assert.equal(session.port, port);
    const page = await fetch(session.url);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /<div id="root">/);
    assert.equal(
      JSON.parse(readFileSync(join(dir, '.lens', 'server.json'), 'utf8')).port,
      port,
      'lens ask can find it',
    );

    // a second lens on the same port gives up: the app then picks another port
    const clash = await startReview(cli, dir, ['diff'], port).ready.catch((error) => error);
    assert.ok(isPortInUse(clash), String(clash));

    await session.stop();
    await session.exited;
    assert.ok(!existsSync(join(dir, '.lens', 'server.json')), 'the CLI cleaned up after itself');
    await assert.rejects(fetch(session.url), 'nothing answers anymore');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 60_000);

test("a review that can't start fails with the CLI's own reason", async () => {
  const dir = makeViewerRepo();
  try {
    execFileSync('git', ['checkout', '-q', '--', '.'], { cwd: dir }); // nothing changed anymore
    await assert.rejects(startReview(cli, dir, ['diff'], await freePort()).ready, {
      message: 'no changed supported files in this diff',
    });
    await assert.rejects(startReview(cli, dir, ['pr', 'nope'], await freePort()).ready, /"nope" is not a PR reference/);

    // with the Plan tab on, the clean working tree opens anyway: a feature starts there
    writeFileSync(join(dir, '.lens.json'), JSON.stringify({ planTab: true }));
    assert.equal((await lensInfo(cli, dir, {})).repo?.planTab, true);
    const session = await startReview(cli, dir, ['diff'], await freePort()).ready;
    await session.stop();
    await session.exited;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 60_000);

test('a review ended from the viewer is noticed, and cancelling one that is starting ends it', async () => {
  const dir = makeViewerRepo();
  try {
    const session = await startReview(cli, dir, ['diff'], await freePort()).ready;
    await fetch(session.url + 'api/shutdown', { method: 'POST' }); // End session in the viewer
    await session.exited;
    await session.stop(); // stopping what is already gone is fine

    const starting = startReview(cli, dir, ['diff'], await freePort());
    starting.cancel();
    await assert.rejects(starting.ready, { message: 'cancelled' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 60_000);

test('lens ends with the app however the app went: its stdin closes, and it stops clean', async () => {
  const dir = makeViewerRepo();
  try {
    const port = await freePort();
    const lens = spawn(cli.command, [...cli.args, 'diff', '--no-open', '--stop-with-stdin', '--port', String(port)], {
      cwd: dir,
      env: cli.env,
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    const exited = new Promise<number | null>((resolve) => lens.on('close', resolve));
    await new Promise<void>((resolve) =>
      lens.stdout.on('data', (chunk) => String(chunk).includes('lens viewer on') && resolve()),
    );
    assert.ok(existsSync(join(dir, '.lens', 'server.json')));
    // what a crashed app leaves: the pipe's other end closed, and nothing else
    lens.stdin.end();
    assert.equal(await exited, 0);
    assert.ok(!existsSync(join(dir, '.lens', 'server.json')), 'it stopped as it does on its own');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 60_000);

test("a lens that doesn't exit when told is killed, so closing a tab never hangs", async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lens-stubborn-'));
  try {
    const script = join(dir, 'stubborn.ts');
    writeFileSync(
      script,
      `process.on('SIGTERM', () => {});
console.log('lens viewer on http://127.0.0.1:' + process.argv.at(-1) + '/');
setInterval(() => {}, 1000);
`,
    );
    const stubborn = { command: process.execPath, args: [script], env: process.env, root: dir };
    const session = await startReview(stubborn, dir, [], await freePort()).ready;
    const start = Date.now();
    await session.stop();
    await session.exited;
    assert.ok(Date.now() - start < 8000, 'the viewer, then SIGTERM, then SIGKILL: a few seconds at most');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 30_000);

test('lens info through the CLI, as the picker reads it', async () => {
  const dir = makeViewerRepo();
  try {
    const info = await lensInfo(cli, dir, { themes: true });
    assert.equal(info.repo?.changed, 2);
    assert.equal(info.repo?.staged, 0);
    assert.equal(info.themes?.[0].name, 'vesper');
    await assert.rejects(lensInfo(cli, dir, { base: 'nope' }), { message: '"nope" is not a branch or commit here' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 60_000);

test("cliReason and cliEnv: the CLI's last word, and an environment that runs it", () => {
  assert.equal(cliReason('warning: something\nlens: first\nlens: the reason\n'), 'the reason');
  assert.equal(cliReason('a stack trace\n'), null);
  const env = cliEnv({ Path: 'C:\\Windows' }, 'win32');
  assert.deepEqual(
    env,
    { Path: 'C:\\Windows' },
    "the PATH keeps its own spelling, and gets no folder that isn't there",
  );
});

test("what runs lens: the packed app's compiled lens, or bun on a checkout's sources, found where it is usually put", () => {
  assert.equal(compiledCli('/app/lens', 'darwin').command, join('/app/lens', 'lens'));
  assert.equal(compiledCli('C:\\Lens\\lens', 'win32').command, join('C:\\Lens\\lens', 'lens.exe'));
  assert.deepEqual(sourceCli('/checkout', '/bin/bun').args, [join('/checkout', 'src', 'cli-app', 'cli.ts')]);

  const home = realpathSync.native(mkdtempSync(join(tmpdir(), 'lens-bun-')));
  try {
    // as on Windows, which has no usual folders of its own: this machine's /opt/homebrew stays out of it
    const own = join(home, '.bun', 'bin');
    assert.equal(findBun({ PATH: '' }, 'win32', home), null, 'none anywhere');
    mkdirSync(own, { recursive: true });
    writeFileSync(join(own, 'bun.exe'), '');
    assert.equal(findBun({ PATH: '' }, 'win32', home), join(own, 'bun.exe'), "its installer's home, off the PATH");
    const onPath = join(home, 'bin');
    mkdirSync(onPath);
    writeFileSync(join(onPath, 'bun.exe'), '');
    assert.equal(
      findBun({ Path: onPath }, 'win32', home),
      join(onPath, 'bun.exe'),
      "the PATH comes first, however it's spelled",
    );
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("the store keeps recent repositories and each one's port, and drops folders that are gone", () => {
  const home = realpathSync.native(mkdtempSync(join(tmpdir(), 'lens-store-')));
  try {
    const file = join(home, 'data', 'state.json');
    const first = join(home, 'first');
    const second = join(home, 'second');
    for (const dir of [first, second]) execFileSync('git', ['init', '-q', dir]);

    const store = openStore(file);
    assert.deepEqual(store.recents(), []);
    store.touch(first, 'main');
    store.touch(second, null);
    const before = Date.now();
    store.touch(first, 'feature');
    store.setPort(first, 5001);
    store.setPort(second, 5002);
    assert.deepEqual(store.recents(), [first, second], 'most recent first, each once');

    const reopened = openStore(file);
    assert.deepEqual(reopened.recents(), [first, second]);
    assert.equal(reopened.port(first), 5001);
    // when each was last opened, and on which branch: the last time counts
    assert.equal(reopened.visit(first)?.branch, 'feature');
    assert.ok(reopened.visit(first)!.at >= before);
    assert.equal(reopened.visit(second)?.branch, null);
    assert.equal(reopened.visit(first)?.main, undefined, 'not a linked worktree');

    // a linked worktree's visit names its repository's main worktree, which Start lists it under
    const linked = join(home, 'linked');
    execFileSync('git', ['init', '-q', linked]);
    store.touch(linked, 'feature', first);
    store.touch(first, 'feature', first); // the main one names itself: nothing to keep
    assert.equal(openStore(file).visit(linked)?.main, first);
    assert.equal(openStore(file).visit(first)?.main, undefined);
    store.forget(linked);

    rmSync(second, { recursive: true, force: true });
    assert.deepEqual(reopened.recents(), [first]);
    assert.equal(openStore(file).port(second), null, 'its port goes with it');
    assert.equal(openStore(file).visit(second), null, 'and its visit');

    reopened.forget(first);
    assert.deepEqual(openStore(file).recents(), []);
    assert.equal(openStore(file).visit(first), null);

    writeFileSync(file, 'not json');
    assert.deepEqual(openStore(file).recents(), [], "a file the app didn't write is ignored");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
