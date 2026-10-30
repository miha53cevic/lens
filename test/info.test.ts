import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { lensInfo } from '../src/cli-app/info.ts';
import { toPosix } from '../src/cli-app/paths.ts';
import manifest from '../package.json' with { type: 'json' };

/** Runs `fn` in a fresh temp git repo (branch "main", one commit), cleaned up afterwards. */
async function withRepo(fn: (dir: string, git: (...args: string[]) => string) => Promise<void>): Promise<void> {
  // the real path: Windows' temp dir can come as a short 8.3 name, which git resolves differently
  const dir = realpathSync.native(mkdtempSync(join(tmpdir(), 'lens-info-')));
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
  try {
    git('init', '-q', '-b', 'main');
    git('config', 'user.email', 't@t');
    git('config', 'user.name', 't');
    writeFileSync(join(dir, 'a.ts'), 'export const a = 1;\n');
    writeFileSync(join(dir, 'b.ts'), 'export const b = 1;\n');
    git('add', '-A');
    git('commit', '-qm', 'base');
    await fn(dir, git);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("lens info: the branch, what's changed and staged, and how far ahead of the base", async () => {
  await withRepo(async (dir, git) => {
    git('checkout', '-qb', 'feature');
    writeFileSync(join(dir, 'c.ts'), 'export const c = 1;\n');
    git('add', '-A');
    git('commit', '-qm', 'one');
    writeFileSync(join(dir, 'c.ts'), 'export const c = 2;\n');
    git('commit', '-qam', 'two');

    writeFileSync(join(dir, 'a.ts'), 'export const a = 2;\n'); // changed, not staged
    writeFileSync(join(dir, 'b.ts'), 'export const b = 2;\n');
    git('add', 'b.ts'); // staged
    writeFileSync(join(dir, 'new.ts'), 'export const fresh = 1;\n'); // untracked: `lens diff` shows it as added
    writeFileSync(join(dir, '.gitignore'), 'ignored.ts\n');
    git('add', '.gitignore');
    writeFileSync(join(dir, 'ignored.ts'), 'export const ignored = 1;\n'); // ignored: not a change

    const { repo, git: gitVersion, version } = await lensInfo(dir);
    assert.ok(repo);
    assert.match(gitVersion ?? '', /^\d+\.\d+/);
    assert.match(version, /^\d+\.\d+\.\d+/);
    assert.equal(repo.root, toPosix(dir));
    assert.equal(repo.branch, 'feature');
    assert.deepEqual(repo.branches, ['feature', 'main']);
    assert.equal(repo.base, 'main', 'no remote: a local main is the base');
    assert.equal(repo.ahead, 2);
    assert.equal(repo.changed, 2, 'a.ts, and the untracked new.ts');
    assert.equal(repo.staged, 2, 'b.ts and .gitignore');
    assert.equal(repo.github, null);
  });
});

test('lens info: from a subfolder, with a GitHub remote and a base of your choosing', async () => {
  await withRepo(async (dir, git) => {
    git('remote', 'add', 'origin', 'git@github.com:acme/storefront.git');
    git('checkout', '-qb', 'release');
    git('checkout', '-qb', 'feature');
    writeFileSync(join(dir, 'a.ts'), 'export const a = 3;\n');
    git('commit', '-qam', 'work');
    mkdirSync(join(dir, 'src'));

    const { repo } = await lensInfo(join(dir, 'src'), { base: 'release' });
    assert.ok(repo);
    assert.equal(repo.root, toPosix(dir), "the repository's root, not the folder asked from");
    assert.deepEqual(repo.github, { remote: 'origin', owner: 'acme', repo: 'storefront' });
    assert.equal(repo.base, 'release');
    assert.equal(repo.ahead, 1);

    await assert.rejects(lensInfo(dir, { base: 'nope' }), /"nope" is not a branch or commit here/);
  });
});

test("lens info: the remote's default branch is the base, by its local name when there is one", async () => {
  await withRepo(async (dir, git) => {
    git('branch', '-m', 'trunk');
    git('update-ref', 'refs/remotes/origin/trunk', 'HEAD');
    git('symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/trunk');
    git('checkout', '-qb', 'feature');
    assert.equal((await lensInfo(dir)).repo?.base, 'trunk');

    git('branch', '-D', 'trunk');
    assert.equal((await lensInfo(dir)).repo?.base, 'origin/trunk', 'no local copy: the remote-tracking branch');
  });
});

test('lens info: a detached HEAD, a repository without commits, and no repository at all', async () => {
  await withRepo(async (dir, git) => {
    git('checkout', '-q', '--detach');
    const { repo } = await lensInfo(dir);
    assert.equal(repo?.branch, null);
    assert.match(repo?.head ?? '', /^[0-9a-f]{7,}$/);
  });

  const empty = realpathSync.native(mkdtempSync(join(tmpdir(), 'lens-info-empty-')));
  try {
    assert.equal((await lensInfo(empty)).repo, null, 'not a repository');
    execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: empty });
    const { repo } = await lensInfo(empty);
    assert.ok(repo, 'a repository before its first commit');
    assert.equal(repo.head, null);
    assert.equal(repo.branch, 'main');
    assert.equal(repo.ahead, null);
    assert.deepEqual(repo.branches, []);
  } finally {
    rmSync(empty, { recursive: true, force: true });
  }
});

test("lens info --themes: the theme menu's themes with their colors, the config's own first", async () => {
  await withRepo(async (dir) => {
    assert.equal((await lensInfo(dir)).themes, undefined, 'only when asked: loading them takes a moment');
    const plain = await lensInfo(dir, { themes: true });
    assert.equal(plain.theme, 'vesper');
    assert.equal(plain.themes?.[0].name, 'vesper');
    assert.match(plain.themes?.[0].accent ?? '', /^#[0-9a-f]{3,8}$/i);

    writeFileSync(join(dir, '.lens.json'), JSON.stringify({ theme: 'poimandres' }));
    const custom = await lensInfo(dir, { themes: true });
    assert.equal(custom.theme, 'poimandres');
    assert.equal(custom.themes?.[0].name, 'poimandres', 'a theme outside the menu is listed too');

    const asked = await lensInfo(dir, { themes: true, theme: 'nord' });
    assert.equal(asked.theme, 'nord', "--theme goes before the config's");
    assert.equal(asked.themes?.length, plain.themes?.length, "one of the menu's own isn't listed twice");
    await assert.rejects(lensInfo(dir, { theme: 'nope' }), /unknown theme "nope"/);
  });
});

test("lens --version prints package.json's version", () => {
  const cli = join(import.meta.dirname, '..', 'src', 'cli-app', 'cli.ts');
  const out = execFileSync(process.execPath, [cli, '--version'], { encoding: 'utf8' });
  assert.equal(out.trim(), 'lens ' + manifest.version);
});
