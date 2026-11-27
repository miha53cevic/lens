// The app's own update, from the latest GitHub release. Electron's autoUpdater (Squirrel.Mac) needs a
// signed app and nothing signs lens, so this takes install.sh's steps instead: download the zip,
// unpack it with ditto, and once the app has quit, a small script swaps the bundle and starts it
// again. Nothing on that path asks for the quarantine flag, so the new app opens without Gatekeeper's
// prompt. It checks only when the reader asks, and only the main process picks what is downloaded.
// No Electron here: index.ts gives it the app's quit and the way to start the script.

import { execFile } from 'node:child_process';
import { accessSync, constants, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import type { UpdateState } from '../shared/api.ts';
import { APP_ASSET, REPOSITORY } from '../shared/release.ts';

const LATEST_URL = `https://api.github.com/repos/${REPOSITORY}/releases/latest`;

export interface Release {
  /** x.y.z, without the tag's v */
  version: string;
  /** The zip of the macOS app */
  assetUrl: string;
}

/** x.y.z (a leading v allowed) as numbers; null for anything else, a pre-release among them */
function parts(version: string): [number, number, number] | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(version.trim());
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

/** Whether `candidate` is a later release than `current`; false when either isn't x.y.z. */
export function isNewer(candidate: string, current: string): boolean {
  const next = parts(candidate);
  const now = parts(current);
  if (!next || !now) return false;
  for (let index = 0; index < 3; index++) {
    if (next[index] !== now[index]) return next[index]! > now[index]!;
  }
  return false;
}

/** GitHub's answer for the latest release: its version and the app's zip, or null when it has neither. */
export function parseRelease(body: unknown): Release | null {
  if (typeof body !== 'object' || body === null) return null;
  const { tag_name: tag, assets } = body as { tag_name?: unknown; assets?: unknown };
  if (typeof tag !== 'string' || !parts(tag) || !Array.isArray(assets)) return null;
  const asset = assets.find((item) => (item as { name?: unknown })?.name === APP_ASSET) as
    { browser_download_url?: unknown } | undefined;
  const url = asset?.browser_download_url;
  // only GitHub's own download address: what the app runs next comes from nowhere else
  if (typeof url !== 'string' || !url.startsWith(`https://github.com/${REPOSITORY}/releases/download/`)) return null;
  return { version: tag.replace(/^v/, ''), assetUrl: url };
}

/** The .app bundle an executable runs from (`…/Lens.app/Contents/MacOS/Lens` → `…/Lens.app`); null outside one */
export function appBundle(execPath: string): string | null {
  return /^(\/.+?\.app)\/Contents\/MacOS\/[^/]+$/.exec(execPath)?.[1] ?? null;
}

/** Whether the app's bundle, and the folder it sits in, can be written to: what swapping it needs. */
export function canReplace(bundle: string): boolean {
  try {
    accessSync(dirname(bundle), constants.W_OK);
    accessSync(bundle, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

/** The CFBundleShortVersionString of an unpacked app (an XML Info.plist, as Electron's packager writes it); null when none */
export function bundleVersion(bundle: string): string | null {
  try {
    const plist = readFileSync(join(bundle, 'Contents', 'Info.plist'), 'utf8');
    return /<key>CFBundleShortVersionString<\/key>\s*<string>([^<]*)<\/string>/.exec(plist)?.[1] ?? null;
  } catch {
    return null;
  }
}

const quote = (text: string) => "'" + text.replace(/'/g, "'\\''") + "'";

export interface Swap {
  /** The app's process: the script waits until it is gone */
  pid: number;
  /** The bundle to replace */
  app: string;
  /** The new bundle, unpacked */
  staged: string;
  /** The update's own folder: the old bundle waits there, and all of it goes at the end */
  workDir: string;
  /** Start the app again once swapped (tests don't) */
  relaunch: boolean;
}

/** The script that swaps the bundle once the app has quit. The old one comes back if the new one can't go in. */
export function swapScript({ pid, app, staged, workDir, relaunch }: Swap): string {
  const old = join(workDir, 'old.app');
  return [
    '#!/bin/sh',
    "# written by lens's updater (src/desktop/main/update.ts)",
    `while kill -0 ${pid} 2>/dev/null; do sleep 0.2; done`,
    `if mv ${quote(app)} ${quote(old)}; then`,
    `  if mv ${quote(staged)} ${quote(app)}; then rm -rf ${quote(old)}; else mv ${quote(old)} ${quote(app)}; fi`,
    'fi',
    ...(relaunch ? [`open ${quote(app)}`] : []),
    `rm -rf ${quote(workDir)}`,
    '',
  ].join('\n');
}

export interface UpdaterDeps {
  /** This app's version */
  current: string;
  /** A packed app (from a checkout, git pull updates it) */
  packed: boolean;
  platform: NodeJS.Platform;
  arch: string;
  execPath: string;
  pid: number;
  /** Where an update is downloaded and unpacked */
  tempDir: string;
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
  /** Starts the swap script at this path, detached: it outlives the app */
  startScript(path: string): void;
  quit(): void;
  /** The state changed: the pages are told */
  changed(): void;
  /** Start the app again after the swap (tests don't) */
  relaunch?: boolean;
}

export class Updater {
  state: UpdateState;
  private release: Release | null = null;
  private readonly bundle: string | null;
  private readonly deps: UpdaterDeps;

  constructor(deps: UpdaterDeps) {
    this.deps = deps;
    this.bundle = appBundle(deps.execPath);
    // the release has only the Apple silicon app: anything else has nothing to take
    const supported = deps.platform === 'darwin' && deps.arch === 'arm64' && this.bundle !== null;
    this.state = !deps.packed ? { kind: 'source' } : supported ? { kind: 'idle' } : { kind: 'unsupported' };
  }

  private set(state: UpdateState): void {
    this.state = state;
    this.deps.changed();
  }

  async check(): Promise<void> {
    const { kind } = this.state;
    if (kind === 'source' || kind === 'unsupported' || kind === 'checking' || kind === 'applying') return;
    this.set({ kind: 'checking' });
    try {
      const release = await this.latest();
      this.release = release;
      if (!isNewer(release.version, this.deps.current)) return this.set({ kind: 'current' });
      const bundle = this.bundle!;
      this.set({ kind: 'available', version: release.version, canApply: canReplace(bundle), folder: dirname(bundle) });
    } catch (error) {
      this.set({ kind: 'failed', label: "Couldn't check for updates", detail: (error as Error).message });
    }
  }

  private async latest(): Promise<Release> {
    const response = await this.deps.fetch(LATEST_URL, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'lens-app' },
    });
    if (response.status === 404) throw new Error('GitHub has no release of lens to read.');
    if (!response.ok) throw new Error(`GitHub answered ${response.status}.`);
    const release = parseRelease(await response.json());
    if (!release) throw new Error(`The latest release has no ${APP_ASSET}.`);
    return release;
  }

  async apply(): Promise<void> {
    const { state, release, bundle } = this;
    if (state.kind !== 'available' || !state.canApply || !release || !bundle) return;
    this.set({ kind: 'applying', version: release.version });
    const workDir = mkdtempSync(join(this.deps.tempDir, 'lens-update-'));
    try {
      const staged = await this.download(release, workDir);
      const script = join(workDir, 'swap.sh');
      const relaunch = this.deps.relaunch ?? true;
      writeFileSync(script, swapScript({ pid: this.deps.pid, app: bundle, staged, workDir, relaunch }));
      this.deps.startScript(script);
      this.deps.quit();
    } catch (error) {
      rmSync(workDir, { recursive: true, force: true });
      this.set({ kind: 'failed', label: `Couldn't update to ${release.version}`, detail: (error as Error).message });
    }
  }

  /** Downloads and unpacks the release's app; its path, once its own version says it is that release. */
  private async download(release: Release, workDir: string): Promise<string> {
    const response = await this.deps.fetch(release.assetUrl, { headers: { 'User-Agent': 'lens-app' } });
    if (!response.ok) throw new Error(`The download answered ${response.status}.`);
    const zip = join(workDir, APP_ASSET);
    writeFileSync(zip, new Uint8Array(await response.arrayBuffer()));
    await promisify(execFile)('ditto', ['-x', '-k', zip, join(workDir, 'new')]);
    const staged = join(workDir, 'new', 'Lens.app');
    const version = bundleVersion(staged);
    if (version !== release.version) {
      throw new Error(`The download is lens ${version ?? 'of no version'}, not ${release.version}.`);
    }
    return staged;
  }
}
