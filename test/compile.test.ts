import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { compileLens } from '../scripts/compile.ts';
import { freePort } from '../src/desktop/main/session.ts';
import { makeViewerRepo } from './fixtures/viewerRepo.ts';
import manifest from '../package.json' with { type: 'json' };

// The compiled lens (what the desktop app runs) carries everything the CLI reads at run time:
// run from a repository far from this checkout, it still has its defaults, version, grammars,
// themes, viewer and TypeScript.
test('the compiled lens runs on its own: info, folds, themes, the viewer page and TypeScript', async () => {
  const out = mkdtempSync(join(tmpdir(), 'lens-compiled-'));
  const repo = makeViewerRepo();
  const home = mkdtempSync(join(tmpdir(), 'lens-home-'));
  writeFileSync(join(home, 'settings.json'), JSON.stringify({ typescriptLsp: true }));
  try {
    const lens = join(out, process.platform === 'win32' ? 'lens.exe' : 'lens');
    await compileLens(lens);
    const run = (...args: string[]) => execFileSync(lens, args, { cwd: repo, encoding: 'utf8' });

    const tsc = join(out, 'typescript', 'lib', process.platform === 'win32' ? 'tsc.exe' : 'tsc');
    assert.match(execFileSync(tsc, ['--version'], { encoding: 'utf8' }), /Version 7\./, 'TypeScript 7 is beside it');

    const info = JSON.parse(run('info', '--json', '--themes'));
    assert.equal(info.version, manifest.version, 'package.json came along');
    assert.equal(info.repo.changed, 2);

    const model = JSON.parse(run('diff', '--json', '--theme', 'github-light'));
    const orders = model.files.find((file: { file: string }) => file.file === 'src/orders.ts');
    assert.ok(
      orders.regions.some((region: { category: string }) => region.category === 'import'),
      'tree-sitter parsed it',
    );

    const viewer = spawn(lens, ['diff', '--no-open', '--port', String(await freePort())], {
      cwd: repo,
      env: { ...process.env, LENS_HOME: home },
    });
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

      const lines = readFileSync(join(repo, 'src', 'orders.ts'), 'utf8').split('\n');
      const line = lines.findIndex((text) => text.includes('function findOrders'));
      const place = { file: 'src/orders.ts', line: line + 1, character: lines[line].indexOf('findOrders') };
      const hover = await (
        await fetch(new URL('api/lsp/hover', url), { method: 'POST', body: JSON.stringify(place) })
      ).json();
      assert.equal(hover.unavailable, null, 'its own tsc --lsp answers');
      assert.match(hover.hover.code, /function findOrders\(/);
    } finally {
      // on Windows a running exe can't be removed: wait until it's gone
      const exited = new Promise((resolve) => viewer.once('exit', resolve));
      if (viewer.exitCode === null && viewer.kill()) await exited;
    }
  } finally {
    rmSync(out, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
}, 120_000);

// What the test above can't see: a native module left in the binary still loads while the checkout it
// was compiled from is on disk, as it is on this machine, and not on the machine the app is installed on.
test('the compiled lens runs once the checkout it was compiled from is gone', () => {
  const root = join(import.meta.dirname, '..');
  const checkout = mkdtempSync(join(tmpdir(), 'lens-checkout-'));
  const out = mkdtempSync(join(tmpdir(), 'lens-compiled-'));
  const repo = makeViewerRepo();
  try {
    for (const name of readdirSync(root)) {
      if (['src', 'scripts', 'package.json', 'lens.defaults.json'].includes(name))
        cpSync(join(root, name), join(checkout, name), { recursive: true });
    }
    // only what compiling doesn't use is left out: these are most of the folder's size
    const unused = new Set(['electron', 'bun', '@electron', '@electron-forge', 'typescript', 'happy-dom']);
    for (const name of readdirSync(join(root, 'node_modules'))) {
      if (!unused.has(name))
        cpSync(join(root, 'node_modules', name), join(checkout, 'node_modules', name), { recursive: true });
    }
    execFileSync(process.execPath, ['scripts/compile.ts'], { cwd: checkout, stdio: 'pipe' });
    const name = process.platform === 'win32' ? 'lens.exe' : 'lens';
    renameSync(join(checkout, 'dist', 'lens', name), join(out, name));
    rmSync(checkout, { recursive: true, force: true });

    const info = JSON.parse(execFileSync(join(out, name), ['info', '--json'], { cwd: repo, encoding: 'utf8' }));
    assert.equal(info.repo.changed, 2);
  } finally {
    rmSync(checkout, { recursive: true, force: true });
    rmSync(out, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  }
}, 180_000);
