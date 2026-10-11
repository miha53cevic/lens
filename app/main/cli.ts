// How the app runs the lens CLI: the app's own executable in Node mode, on the CLI's sources.
// Electron's Node runs the .ts files as the `lens` command's Node does, so the app and the
// terminal run the same code; installed, the sources sit in the app's resources.

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import type { LensInfo } from '../../src/info.ts';

export interface LensCli {
  /** The program to start */
  command: string;
  /** Its arguments before lens's own: the path of cli.ts */
  args: string[];
  env: NodeJS.ProcessEnv;
  /** The folder that holds src/, skills/ and package.json */
  root: string;
}

/** Where git may be when the app wasn't started from a shell (macOS gives such apps a short PATH). */
function extraPaths(platform: NodeJS.Platform, env: NodeJS.ProcessEnv): string[] {
  if (platform === 'darwin') return ['/opt/homebrew/bin', '/usr/local/bin'];
  if (platform === 'win32') {
    return [env.ProgramFiles, env['ProgramFiles(x86)'], env.LOCALAPPDATA && join(env.LOCALAPPDATA, 'Programs')]
      .filter((dir): dir is string => Boolean(dir))
      .map((dir) => join(dir, 'Git', 'cmd'));
  }
  return [];
}

/** The environment the CLI runs in: the app's, in Node mode, with git's usual homes on the PATH. */
export function cliEnv(env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform) {
  const key = Object.keys(env).find((name) => name.toUpperCase() === 'PATH') ?? 'PATH';
  const current = (env[key] ?? '').split(delimiter).filter(Boolean);
  const added = extraPaths(platform, env).filter((dir) => !current.includes(dir) && existsSync(dir));
  return { ...env, [key]: [...current, ...added].join(delimiter), ELECTRON_RUN_AS_NODE: '1' };
}

/** The CLI in `root`, run by `execPath` (the app's executable). */
export function lensCli(root: string, execPath: string = process.execPath): LensCli {
  return { command: execPath, args: [join(root, 'src', 'cli.ts')], env: cliEnv(), root };
}

/** Runs the CLI to its end and returns what it printed; its `lens: reason` is the error. */
export function runLens(cli: LensCli, args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      cli.command,
      [...cli.args, ...args],
      { cwd, env: cli.env, maxBuffer: 16 * 1024 * 1024, windowsHide: true },
      (error, stdout, stderr) => {
        if (error) reject(new Error(cliReason(stderr) ?? error.message));
        else resolve(stdout);
      },
    );
  });
}

/** The reason in the CLI's `lens: <reason>` line, its last word on what went wrong. */
export function cliReason(stderr: string): string | null {
  const lines = stderr
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('lens: '));
  return lines.length > 0 ? lines[lines.length - 1].slice('lens: '.length) : null;
}

export interface InfoQuery {
  base?: string;
  themes?: boolean;
  /** This theme instead of the config's: with `themes`, its colors come along */
  theme?: string;
}

/** `lens info --json` for a folder: everything the app knows about a repository comes from here. */
export async function lensInfo(cli: LensCli, cwd: string, query: InfoQuery = {}): Promise<LensInfo> {
  const args = ['info', '--json'];
  if (query.themes) args.push('--themes');
  if (query.base) args.push('--base', query.base);
  if (query.theme) args.push('--theme', query.theme);
  return JSON.parse(await runLens(cli, args, cwd)) as LensInfo;
}
