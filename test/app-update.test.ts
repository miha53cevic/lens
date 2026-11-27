// The app's own update (src/desktop/main/update.ts): reading GitHub's latest release, comparing it,
// and taking it: download, unpack, check, and the script that swaps the bundle once the app quits.
// GitHub is a stubbed fetch; the release is a fake Lens.app (fixtures/fakeApp.ts).

import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { UpdateState } from '../src/desktop/shared/api.ts';
import { APP_ASSET, changelogSection, cleanNotes, releaseUrl, REPOSITORY } from '../src/desktop/shared/release.ts';
import {
  appBundle,
  bundleVersion,
  isNewer,
  parseRelease,
  swapScript,
  Updater,
  type UpdaterDeps,
} from '../src/desktop/main/update.ts';
import { fakeAppZip } from './fixtures/fakeApp.ts';

const DOWNLOAD = `https://github.com/${REPOSITORY}/releases/download/v0.11.0/${APP_ASSET}`;
const RELEASE = { tag_name: 'v0.11.0', assets: [{ name: APP_ASSET, browser_download_url: DOWNLOAD }] };
const onMac = process.platform === 'darwin';

test('versions compare as numbers, and only x.y.z counts', () => {
  assert.ok(isNewer('0.11.0', '0.10.0'));
  assert.ok(isNewer('v1.0.0', '0.99.9'));
  assert.ok(isNewer('0.10.1', '0.10.0'));
  assert.ok(!isNewer('0.10.0', '0.10.0'));
  assert.ok(!isNewer('0.9.0', '0.10.0'), 'not as text');
  assert.ok(!isNewer('0.11.0-beta.1', '0.10.0'), 'a pre-release is never offered');
  assert.ok(!isNewer('0.11.0', ''));
});

test("GitHub's release: its version and the app's zip, from GitHub's own download address only", () => {
  assert.deepEqual(parseRelease(RELEASE), { version: '0.11.0', assetUrl: DOWNLOAD, notes: null });
  assert.equal(parseRelease({ ...RELEASE, assets: [] }), null, 'no app attached yet');
  assert.equal(parseRelease({ ...RELEASE, tag_name: 'nightly' }), null);
  const elsewhere = [{ name: APP_ASSET, browser_download_url: 'https://example.com/Lens.zip' }];
  assert.equal(parseRelease({ ...RELEASE, assets: elsewhere }), null);
  assert.equal(parseRelease('not json'), null);
});

// what release-please writes, as a release's body and as CHANGELOG.md's sections
const NOTES_0_11 = [
  '## [0.11.0](https://github.com/miha53cevic/lens/compare/v0.10.0...v0.11.0) (2026-11-27)',
  '',
  '',
  '### Features',
  '',
  '* update the app from GitHub Releases ([0da62af](https://github.com/miha53cevic/lens/commit/0da62af97f104dc8))',
  '* keep <b>tags</b> as text',
  '',
].join('\n');
const CHANGELOG = [
  '# Changelog',
  '',
  NOTES_0_11,
  '## [0.10.0](https://github.com/miha53cevic/lens/compare/v0.9.1...v0.10.0) (2026-11-26)',
  '',
  '### Bug Fixes',
  '',
  '* an older fix ([6c9ea5b](https://github.com/miha53cevic/lens/commit/6c9ea5b))',
].join('\n');
const CLEAN_0_11 = '### Features\n\n* update the app from GitHub Releases\n* keep <b>tags</b> as text';

test("release notes: without the version's heading and the commit links, from a release or the changelog", () => {
  assert.equal(cleanNotes(NOTES_0_11), CLEAN_0_11);
  assert.equal(parseRelease({ ...RELEASE, body: NOTES_0_11 })?.notes, CLEAN_0_11);
  assert.equal(parseRelease({ ...RELEASE, body: '## [0.11.0](x) (2026-11-27)\n' })?.notes, null, 'nothing left');
  assert.equal(parseRelease({ ...RELEASE, body: 42 })?.notes, null);

  assert.equal(changelogSection(CHANGELOG, '0.11.0'), CLEAN_0_11);
  assert.equal(
    changelogSection(CHANGELOG, '0.10.0'),
    '### Bug Fixes\n\n* an older fix',
    'the last section runs to the end',
  );
  assert.equal(changelogSection(CHANGELOG, '0.9.0'), null);
  assert.ok(cleanNotes('x'.repeat(50_000)).length <= 20_000, 'a body past any release is cut');
});

test("a release's page is built only from x.y.z", () => {
  assert.equal(releaseUrl('0.11.0'), `https://github.com/${REPOSITORY}/releases/tag/v0.11.0`);
  assert.equal(releaseUrl('0.11.0/../../evil'), null);
  assert.equal(releaseUrl(''), null);
});

test('the bundle an executable runs from', () => {
  assert.equal(appBundle('/Applications/Lens.app/Contents/MacOS/Lens'), '/Applications/Lens.app');
  assert.equal(appBundle('/Users/ana/Applications/Lens.app/Contents/MacOS/Lens'), '/Users/ana/Applications/Lens.app');
  assert.equal(appBundle('/usr/local/bin/electron'), null);
});

/** An "installed" Lens.app of this version, the stubbed GitHub, and what the updater did. */
function setup(version = '0.10.0', answers: Record<string, () => Response> = {}) {
  const dir = realpathSync.native(mkdtempSync(join(tmpdir(), 'lens-update-')));
  const apps = join(dir, 'Applications');
  mkdirSync(join(apps, 'Lens.app', 'Contents', 'MacOS'), { recursive: true });
  const zip = onMac ? readFileSync(fakeAppZip(dir, '0.11.0')) : new Uint8Array();
  const routes: Record<string, () => Response> = {
    [`https://api.github.com/repos/${REPOSITORY}/releases/latest`]: () => Response.json(RELEASE),
    [DOWNLOAD]: () => new Response(zip, { headers: { 'content-length': String(zip.length) } }),
    ...answers,
  };
  const did: string[] = [];
  const states: UpdateState['kind'][] = [];
  const told: UpdateState[] = [];
  const deps: UpdaterDeps = {
    current: version,
    packed: true,
    platform: 'darwin',
    arch: 'arm64',
    execPath: join(apps, 'Lens.app', 'Contents', 'MacOS', 'Lens'),
    pid: process.pid,
    tempDir: dir,
    fetch: async (url) => {
      did.push('fetch ' + url);
      return routes[url]?.() ?? new Response('', { status: 404 });
    },
    startScript: (path) => void did.push('script ' + path),
    quit: () => void did.push('quit'),
    changed: () => {
      states.push(updater.state.kind);
      told.push(updater.state);
    },
    relaunch: false,
  };
  const updater = new Updater(deps);
  return { dir, apps, updater, did, states, told, deps };
}

test('a checkout or another platform has nothing to check', async () => {
  const source = new Updater({ ...setup().deps, packed: false });
  assert.equal(source.state.kind, 'source');
  await source.check();
  assert.equal(source.state.kind, 'source');
  assert.equal(new Updater({ ...setup().deps, arch: 'x64' }).state.kind, 'unsupported');
  assert.equal(new Updater({ ...setup().deps, execPath: '/usr/bin/electron' }).state.kind, 'unsupported');
});

test('a check says up to date, or offers the newer release', async () => {
  const latest = setup('0.11.0');
  assert.equal(latest.updater.state.kind, 'idle', 'nothing checked on its own');
  assert.deepEqual(latest.did, []);
  await latest.updater.check();
  assert.deepEqual(latest.states, ['checking', 'current']);

  const older = setup('0.10.0');
  await older.updater.check();
  assert.deepEqual(older.updater.state, {
    kind: 'available',
    version: '0.11.0',
    canApply: true,
    folder: older.apps,
    notes: null,
  });
});

test("a check that fails says why, and GitHub's 404 isn't an error dialog", async () => {
  const { updater } = setup('0.10.0', {
    [`https://api.github.com/repos/${REPOSITORY}/releases/latest`]: () => new Response('', { status: 404 }),
  });
  await updater.check();
  assert.deepEqual(updater.state, {
    kind: 'failed',
    label: "Couldn't check for updates",
    detail: 'GitHub has no release of lens to read.',
  });
});

test.skipIf(!onMac)('taking it: download, unpack, check the version, then the script and quit', async () => {
  const { updater, did, dir, told } = setup();
  await updater.check();
  await updater.apply();
  assert.equal(updater.state.kind, 'applying', 'the app is quitting');
  const progress = told.flatMap((state) => (state.kind === 'applying' ? [state.progress] : []));
  assert.equal(progress[0], null, 'nothing in yet');
  assert.equal(progress.at(-1), 1, 'the whole download, told before the app quits');
  assert.equal(did.at(-1), 'quit');
  const script = did.at(-2)!.replace(/^script /, '');
  assert.ok(script.endsWith('swap.sh'));
  const staged = join(script, '..', 'new', 'Lens.app');
  assert.equal(bundleVersion(staged), '0.11.0');
  assert.ok(readFileSync(script, 'utf8').includes(`while kill -0 ${process.pid}`), 'it waits for this app to quit');
  assert.ok(readdirSync(dir).some((name) => name.startsWith('lens-update-')));
});

test.skipIf(!onMac)("a download that isn't the release it says is never put in place", async () => {
  const wrong = readFileSync(fakeAppZip(realpathSync.native(mkdtempSync(join(tmpdir(), 'lens-'))), '0.9.0'));
  const { updater, did } = setup('0.10.0', { [DOWNLOAD]: () => new Response(wrong) });
  await updater.check();
  await updater.apply();
  assert.deepEqual(updater.state, {
    kind: 'failed',
    label: "Couldn't update to 0.11.0",
    detail: 'The download is lens 0.9.0, not 0.11.0.',
  });
  assert.ok(!did.includes('quit'));
});

test.skipIf(process.platform === 'win32')('the swap script replaces the bundle once the app is gone', () => {
  const dir = realpathSync.native(mkdtempSync(join(tmpdir(), 'lens-swap-')));
  const work = join(dir, 'work');
  const app = join(dir, 'Lens.app');
  const staged = join(work, 'new', 'Lens.app');
  mkdirSync(join(app, 'old-marker'), { recursive: true });
  mkdirSync(join(staged, 'new-marker'), { recursive: true });
  // a process that has already exited: the script doesn't wait
  const gone = spawnSync('true').pid;
  const script = swapScript({ pid: gone, app, staged, workDir: work, relaunch: false });
  assert.ok(!script.includes('open '), 'tests never start an app');
  const run = spawnSync('sh', ['-c', script], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.ok(existsSync(join(app, 'new-marker')));
  assert.ok(!existsSync(join(app, 'old-marker')));
  assert.ok(!existsSync(work), 'the update leaves nothing behind');
  assert.ok(swapScript({ pid: 1, app, staged, workDir: work, relaunch: true }).includes(`open '${app}'`));
});
