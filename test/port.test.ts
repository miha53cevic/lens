import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:net';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { pickPort, repoPort } from '../src/cli-app/port.ts';

const CLI = fileURLToPath(new URL('../src/cli-app/cli.ts', import.meta.url));

function tempDir(): string {
  return realpathSync.native(mkdtempSync(join(tmpdir(), 'lens-port-')));
}

/** A repository with one uncommitted change, so `lens diff` has something to show. */
function makeRepo(): string {
  const dir = tempDir();
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, stdio: 'pipe' });
  git('init', '-q');
  writeFileSync(join(dir, 'a.ts'), 'export const a = 1;\n');
  git('add', '-A');
  git('-c', 'user.email=lens@test', '-c', 'user.name=lens', 'commit', '-q', '-m', 'base');
  writeFileSync(join(dir, 'a.ts'), 'export const a = 2;\n');
  return dir;
}

function listen(port: number): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

/** Runs `lens diff --no-open` in `dir` until it says where its viewer is, or gives up with a reason. */
function startLens(dir: string): Promise<{ child: ChildProcess; port: number | null; output: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI, 'diff', '--no-open'], { cwd: dir });
    let output = '';
    const read = (chunk: Buffer) => {
      output += chunk.toString();
      const ready = /lens viewer on http:\/\/127\.0\.0\.1:(\d+)\//.exec(output);
      if (ready) resolve({ child, port: Number(ready[1]), output });
    };
    child.stdout.on('data', read);
    child.stderr.on('data', read);
    child.on('exit', () => resolve({ child, port: null, output }));
  });
}

function stop(child: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    if (child.exitCode !== null) return resolve();
    child.on('exit', () => resolve());
    child.kill();
  });
}

test("repoPort: a repository's port comes from its path, the same every time", () => {
  const port = repoPort('/home/me/repos/api');
  assert.equal(repoPort('/home/me/repos/api'), port);
  assert.ok(port >= 5400 && port < 6400, `${port} is in the range`);
  assert.notEqual(repoPort('/home/me/repos/web'), port);
});

test("pickPort: the repository's own port, or the next free one when something else has it", async () => {
  const root = tempDir();
  const own = repoPort(root);
  try {
    assert.equal(await pickPort(root), own);
    const holder = await listen(own);
    try {
      assert.equal(await pickPort(root), own + 1);
    } finally {
      await new Promise((done) => holder.close(done));
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("pickPort: a viewer that already runs for the repository is named, a dead one's file is ignored", async () => {
  const root = tempDir();
  try {
    mkdirSync(join(root, '.lens'));
    // this test's own process is a live one
    writeFileSync(join(root, '.lens', 'server.json'), JSON.stringify({ port: 6123, pid: process.pid }));
    await assert.rejects(pickPort(root), /already open on http:\/\/127\.0\.0\.1:6123\//);
    // a pid no process has: the file a crashed lens left behind
    writeFileSync(join(root, '.lens', 'server.json'), JSON.stringify({ port: 6123, pid: 2 ** 30 }));
    assert.equal(await pickPort(root), repoPort(root));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('lens diff in two repositories at once: each gets its own port, and a second run of one names the first', async () => {
  const first = makeRepo();
  const second = makeRepo();
  const started: ChildProcess[] = [];
  try {
    const one = await startLens(first);
    started.push(one.child);
    const two = await startLens(second);
    started.push(two.child);
    // its own port, or one of the next when two paths share a port or another program holds it
    const near = (port: number | null, root: string) =>
      port !== null && port >= repoPort(root) && port < repoPort(root) + 50;
    assert.ok(near(one.port, first), one.output);
    assert.ok(near(two.port, second), two.output);
    assert.notEqual(one.port, two.port);

    const again = await startLens(first);
    started.push(again.child);
    assert.equal(again.port, null, 'no second viewer for the same repository');
    assert.match(
      again.output,
      new RegExp(`lens: this repository is already open on http://127\\.0\\.0\\.1:${one.port}/`),
    );
  } finally {
    await Promise.all(started.map(stop));
    rmSync(first, { recursive: true, force: true });
    rmSync(second, { recursive: true, force: true });
  }
});
