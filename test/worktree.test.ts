// Review worktrees: a review that ends at a commit not checked out gets one under .lens/worktrees/,
// where its summary can be written (reviewWorktree, CheckoutFirst's button), and Clear removes them.

import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { checkoutFirst, reviewWorktree } from '../src/cli-app/summary/store.ts';
import { clearKinds, describeKinds } from '../src/cli-app/clear.ts';
import { toPosix } from '../src/cli-app/paths.ts';

/** A temp repo on main with three commits, and a branch `feature` one commit past them, not checked out. */
async function withRepo(fn: (dir: string, git: (...args: string[]) => string) => Promise<void> | void) {
  const dir = realpathSync.native(mkdtempSync(join(tmpdir(), 'lens-worktree-')));
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
  try {
    git('init', '-q', '-b', 'main');
    git('config', 'user.email', 't@t');
    git('config', 'user.name', 't');
    for (const line of ['one', 'two', 'three']) {
      writeFileSync(join(dir, 'a.ts'), `export const a = '${line}';\n`);
      git('add', '-A');
      git('commit', '-qm', line);
    }
    git('checkout', '-qb', 'feature');
    writeFileSync(join(dir, 'a.ts'), "export const a = 'feature';\n");
    git('commit', '-qam', 'feature');
    git('checkout', '-q', 'main');
    await fn(dir, git);
  } finally {
    // lens's worktrees are inside it, and their records in its .git: they go with it
    rmSync(dir, { recursive: true, force: true });
  }
}

const listed = (git: (...args: string[]) => string) =>
  git('worktree', 'list', '--porcelain')
    .split('\n')
    .filter((line) => line.startsWith('worktree '))
    .map((line) => toPosix(line.slice('worktree '.length)));

test("a commit's worktree: detached under .lens/worktrees/, out of the repository's status, and found again", async () => {
  await withRepo((dir, git) => {
    const commit = git('rev-parse', 'HEAD~1');
    const args = [git('rev-parse', 'HEAD~2'), commit];
    assert.deepEqual(checkoutFirst(dir, 'diff', args), { branch: commit, worktree: null });

    const root = reviewWorktree(commit, dir);
    assert.equal(root, toPosix(join(dir, '.lens', 'worktrees', commit.slice(0, 12))));
    assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), commit);
    assert.equal(git('status', '--porcelain'), '', "the repository doesn't see it");
    // what the notice says from now on: review it there, where nothing needs checking out
    assert.equal(checkoutFirst(dir, 'diff', args)?.worktree?.root, root);
    assert.equal(checkoutFirst(root, 'diff', args), null);

    assert.equal(reviewWorktree(commit, dir), root, 'asked again: the same one');
    assert.equal(listed(git).length, 2);
  });
});

test("a branch's worktree is detached at its tip: the branch stays free to check out", async () => {
  await withRepo((dir, git) => {
    const root = reviewWorktree('feature', dir);
    assert.equal(
      execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
      git('rev-parse', 'feature'),
    );
    git('checkout', '-q', 'feature');
    assert.equal(git('branch', '--show-current'), 'feature');
  });
});

test('a worktree folder deleted by hand is made again; a revision that is no commit is an error', async () => {
  await withRepo((dir, git) => {
    const commit = git('rev-parse', 'HEAD~1');
    const root = reviewWorktree(commit, dir);
    rmSync(root, { recursive: true, force: true });
    assert.equal(reviewWorktree(commit, dir), root);
    assert.ok(existsSync(join(root, 'a.ts')));
    assert.throws(() => reviewWorktree('nope', dir), { message: '"nope" is not a commit here' });
  });
});

test("Clear's review worktrees: lists lens's and removes only those, never one the reader made", async () => {
  await withRepo((dir, git) => {
    const at = { root: toPosix(dir), key: null, review: null };
    const kind = () => describeKinds(at).find((info) => info.id === 'worktrees')!;
    assert.deepEqual(kind().plans.all, { count: 0, paths: [] });
    assert.equal(kind().warning, null);

    const commit = git('rev-parse', 'HEAD~1');
    reviewWorktree(commit, dir);
    const own = join(dir, '..', 'own-' + commit.slice(0, 7));
    git('worktree', 'add', '-q', '--detach', own, 'HEAD~2');
    try {
      assert.deepEqual(kind().plans.all, { count: 1, paths: [`.lens/worktrees/${commit.slice(0, 12)}/`] });
      assert.match(kind().warning ?? '', /summary written in one of them goes with it/);
      assert.deepEqual(clearKinds(at, { worktrees: 'all' }).worktrees.count, 1);
      assert.deepEqual(
        listed(git).map((root) => root.split('/').at(-1)),
        [dir.split(/[\\/]/).at(-1), 'own-' + commit.slice(0, 7)],
      );
    } finally {
      rmSync(own, { recursive: true, force: true });
    }
  });
});
