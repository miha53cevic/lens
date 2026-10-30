import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { compileLens } from '../scripts/compile.ts';
import { freePort } from '../src/desktop/main/session.ts';
import { makeViewerRepo } from './fixtures/viewerRepo.ts';
import manifest from '../package.json' with { type: 'json' };

// The compiled lens (what the desktop app runs) carries everything the CLI reads at run time:
// run from a repository far from this checkout, it still has its defaults, version, grammars,
// themes and viewer.
test('the compiled lens runs on its own: info, folds, themes and the viewer page', async () => {
  const out = mkdtempSync(join(tmpdir(), 'lens-compiled-'));
  const repo = makeViewerRepo();
  try {
    const lens = join(out, process.platform === 'win32' ? 'lens.exe' : 'lens');
    await compileLens(lens);
    const run = (...args: string[]) => execFileSync(lens, args, { cwd: repo, encoding: 'utf8' });

    const info = JSON.parse(run('info', '--json', '--themes'));
    assert.equal(info.version, manifest.version, 'package.json came along');
    assert.equal(info.repo.changed, 2);

    const model = JSON.parse(run('diff', '--json', '--theme', 'github-light'));
    const orders = model.files.find((file: { file: string }) => file.file === 'src/orders.ts');
    assert.ok(
      orders.regions.some((region: { category: string }) => region.category === 'import'),
      'tree-sitter parsed it',
    );

    const viewer = spawn(lens, ['diff', '--no-open', '--port', String(await freePort())], { cwd: repo });
    try {
      const url = await new Promise<string>((resolve, reject) => {
        viewer.stdout.on('data', (chunk: Buffer) => {
          const ready = /lens viewer on (http:\/\/\S+)/.exec(String(chunk));
          if (ready) resolve(ready[1]);
        });
        viewer.on('exit', (code) => reject(new Error(`lens exited with ${code}`)));
      });
      const page = await (await fetch(url)).text();
      assert.match(page, /createRoot/, 'the viewer is bundled in');
      assert.doesNotMatch(page, /__LENS_(CSS|JS)__/, 'and inlined into the page');
      const tokens = await (await fetch(new URL('api/tokens?theme=dracula', url))).json();
      assert.equal(tokens.theme, 'dracula', 'a theme Shiki loads lazily');
    } finally {
      // on Windows a running exe can't be removed: wait until it's gone
      const exited = new Promise((resolve) => viewer.once('exit', resolve));
      if (viewer.exitCode === null && viewer.kill()) await exited;
    }
  } finally {
    rmSync(out, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  }
}, 120_000);
