// install.sh, the README's one-line install: it parses, it fetches the asset the release workflow
// attaches, and it puts that app in place of the old one.

import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { APP_ASSET, INSTALL_COMMAND, REPOSITORY } from '../src/desktop/shared/release.ts';
import { fakeAppZip } from './fixtures/fakeApp.ts';

const root = join(import.meta.dirname, '..');
const script = join(root, 'install.sh');
const source = readFileSync(script, 'utf8');

test.skipIf(process.platform === 'win32')('install.sh is plain sh that parses', () => {
  execFileSync('sh', ['-n', script]);
  assert.match(source, /^#!\/bin\/sh\n/);
  assert.ok(!/\[\[|\bfunction\b|\blocal\b/.test(source), 'no bashisms: macOS runs it with sh');
  assert.ok(!/\bsudo\b/.test(source.replace(/^#.*$/gm, '')), 'never sudo');
});

test('install.sh fetches the asset the release workflow attaches, from the repository the app names', () => {
  const workflow = readFileSync(join(root, '.github', 'workflows', 'macos-app.yml'), 'utf8');
  assert.match(workflow, new RegExp(`gh release upload "\\$TAG" ${APP_ASSET.replace('.', '\\.')}`));
  assert.ok(source.includes(`https://github.com/${REPOSITORY}/releases/latest/download/${APP_ASSET}`));
  const readme = readFileSync(join(root, 'README.md'), 'utf8');
  assert.ok(readme.includes(INSTALL_COMMAND), "the README's line is the one the App page offers");
});

test.skipIf(process.platform !== 'darwin' || process.arch !== 'arm64')(
  'install.sh puts the downloaded app in place of the old one',
  () => {
    const dir = realpathSync.native(mkdtempSync(join(tmpdir(), 'lens-install-')));
    const apps = join(dir, 'Applications');
    const run = (zip: string) =>
      spawnSync('sh', [script], {
        env: { ...process.env, LENS_INSTALL_URL: pathToFileURL(zip).href, LENS_INSTALL_DIR: apps },
        encoding: 'utf8',
      });
    const version = () =>
      execFileSync('defaults', ['read', join(apps, 'Lens.app', 'Contents', 'Info'), 'CFBundleShortVersionString'], {
        encoding: 'utf8',
      }).trim();

    const first = run(fakeAppZip(dir, '0.10.0'));
    assert.equal(first.status, 0, first.stderr);
    assert.equal(version(), '0.10.0');
    assert.match(first.stdout, /lens 0\.10\.0 is in .*Lens\.app\./);

    const second = run(fakeAppZip(dir, '0.11.0'));
    assert.equal(second.status, 0, second.stderr);
    assert.equal(version(), '0.11.0', 'a second run updates');

    const missing = run(join(dir, 'nothing.zip'));
    assert.notEqual(missing.status, 0);
    assert.match(missing.stderr, /^lens: couldn't download/m);
    assert.equal(version(), '0.11.0', 'a failed download leaves the app as it was');
    assert.ok(!existsSync(join(apps, 'old.app')));
  },
);
