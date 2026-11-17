// How the app runs the lens CLI: once packed, the compiled lens in its resources (bun run
// compile made it from the same sources); from a checkout, Bun on the sources themselves, as
// the `lens` command a checkout installs runs them. Either way the app and the terminal run
// the same code.

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';
import type { LensInfo } from '../../cli-app/info.ts';

export interface LensCli {
  /** The program to start */
  command: string;
  /** Its arguments before lens's own: the path of cli.ts, when it is bun */
  args: string[];
  env: NodeJS.ProcessEnv;
  /** The folder that holds the CLI (its sources, or the compiled lens) and skills/ */
  root: string;
}

/** The environment's name for the PATH: Windows spells it as it likes ("Path"). */
export function pathKey(env: NodeJS.ProcessEnv): string {
  return Object.keys(env).find((name) => name.toUpperCase() === 'PATH') ?? 'PATH';
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

/** The environment the CLI runs in: the app's, with git's usual homes on the PATH. */
export function cliEnv(env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform) {
  const key = pathKey(env);
  const current = (env[key] ?? '').split(delimiter).filter(Boolean);
  const added = extraPaths(platform, env).filter((dir) => !current.includes(dir) && existsSync(dir));
  return { ...env, [key]: [...current, ...added].join(delimiter) };
}

/** The compiled lens in `root`: what the packed app runs, from its resources. */
export function compiledCli(root: string, platform: NodeJS.Platform = process.platform): LensCli {
  return { command: join(root, platform === 'win32' ? 'lens.exe' : 'lens'), args: [], env: cliEnv(), root };
}

/** The CLI's sources in `root` (a checkout), run by `bun`. */
export function sourceCli(root: string, bun: string): LensCli {
  return { command: bun, args: [join(root, 'src', 'cli-app', 'cli.ts')], env: cliEnv(), root };
}

/**
 * Where bun is, for running a checkout's sources: on the PATH, or in one of its usual homes
 * (Homebrew's, and ~/.bun/bin, where its own installer puts it), which an app started from
 * the desktop may not have on its PATH. Null when there is none.
 */
export function findBun(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  home: string = homedir(),
): string | null {
  const key = pathKey(env);
  const usual = platform === 'win32' ? [] : ['/opt/homebrew/bin', '/usr/local/bin'];
  const dirs = [...(env[key] ?? '').split(delimiter).filter(Boolean), ...usual, join(home, '.bun', 'bin')];
  const name = platform === 'win32' ? 'bun.exe' : 'bun';
  return dirs.map((dir) => join(dir, name)).find((file) => existsSync(file)) ?? null;
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
  /** How many commits to list (--commits): lens's own count without it */
  commits?: number;
  themes?: boolean;
  /** This theme instead of the config's: with `themes`, its colors come along */
  theme?: string;
}

/** `lens info --json` for a folder: everything the app knows about a repository comes from here. */
export async function lensInfo(cli: LensCli, cwd: string, query: InfoQuery = {}): Promise<LensInfo> {
  const args = ['info', '--json'];
  if (query.themes) args.push('--themes');
  if (query.base) args.push('--base', query.base);
  if (query.commits) args.push('--commits', String(query.commits));
  if (query.theme) args.push('--theme', query.theme);
  return JSON.parse(await runLens(cli, args, cwd)) as LensInfo;
}
