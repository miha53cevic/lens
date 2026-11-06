// Settings → Agent: the `lens` command and the agent skills, installed and removed by the app.
// It only ever removes what it installed itself: its command file carries a marker
// line, a skill folder it copied carries a marker file. No Electron here.

import { execFile } from 'node:child_process';
import {
  accessSync,
  chmodSync,
  constants,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { delimiter, dirname, join, resolve } from 'node:path';
import type { SetupItem, SetupPart } from '../shared/api.ts';
import { tildePath } from './display.ts';

/** In the command file the app writes: how it knows the file is its own. */
const SHIM_MARKER = 'lens-app-shim';
/** In a skill folder the app copied. */
const SKILL_MARKER = '.lens-app';

export interface SetupEnv {
  /** What runs lens: the compiled lens, or bun and the checkout's cli.ts (the app's LensCli) */
  command: string[];
  /** The folder that holds skills/ */
  lensRoot: string;
  home: string;
  platform: NodeJS.Platform;
  env: NodeJS.ProcessEnv;
  /** The folders a terminal looks for commands in (see terminalPath) */
  pathDirs: string[];
  /** Adds a folder to, or removes it from, the user's PATH (Windows; elsewhere a profile owns the PATH) */
  setUserPath?: (dir: string, change: 'add' | 'remove') => Promise<void>;
}

// ---- the lens command ----

function shimText(env: SetupEnv): string {
  const note = `${SHIM_MARKER}: installed by the lens desktop app; its Settings remove it.`;
  if (env.platform === 'win32') {
    return `@echo off\r\nrem ${note}\r\n${env.command.map((part) => `"${part}"`).join(' ')} %*\r\n`;
  }
  const quote = (text: string) => "'" + text.replace(/'/g, "'\\''") + "'";
  return `#!/bin/sh\n# ${note}\nexec ${env.command.map(quote).join(' ')} "$@"\n`;
}

const shimName = (env: SetupEnv) => (env.platform === 'win32' ? 'lens.cmd' : 'lens');

function isWritableDir(dir: string): boolean {
  try {
    accessSync(dir, constants.W_OK);
    return lstatSync(dir).isDirectory();
  } catch {
    return false;
  }
}

/** The app's own folder for the command: used when no folder already on the PATH can be written to. */
function ownBinDir(env: SetupEnv): string {
  return env.platform === 'win32'
    ? join(env.env.LOCALAPPDATA ?? join(env.home, 'AppData', 'Local'), 'lens', 'bin')
    : join(env.home, '.local', 'bin');
}

/** Where the command goes: a folder terminals already look in, when one can be written to. */
function shimDir(env: SetupEnv): string {
  if (env.platform === 'win32') return ownBinDir(env);
  const usual = ['/usr/local/bin', '/opt/homebrew/bin', ownBinDir(env)];
  return usual.find((dir) => env.pathDirs.includes(dir) && isWritableDir(dir)) ?? ownBinDir(env);
}

function isOurShim(file: string): boolean {
  try {
    return !lstatSync(file).isSymbolicLink() && readFileSync(file, 'utf8').includes(SHIM_MARKER);
  } catch {
    return false;
  }
}

/** Whether `file` is right in `dir`: not a prefix of its path (`~/.local` doesn't hold `~/.local/bin/lens`). */
function isInDir(env: SetupEnv, file: string, dir: string): boolean {
  const [folder, wanted] = [resolve(dirname(file)), resolve(dir)];
  return env.platform === 'win32' ? folder.toLowerCase() === wanted.toLowerCase() : folder === wanted;
}

/** Every `lens` a terminal could run, in the PATH's order, then the app's own folder. */
function lensCommands(env: SetupEnv): string[] {
  const names = env.platform === 'win32' ? ['lens.cmd', 'lens.exe', 'lens.bat', 'lens.ps1', 'lens'] : ['lens'];
  const found: string[] = [];
  for (const dir of [...env.pathDirs, ownBinDir(env)]) {
    for (const name of names) {
      const file = join(dir, name);
      if (existsSync(file) && !found.includes(file)) found.push(file);
    }
  }
  return found;
}

function cliItem(env: SetupEnv): SetupItem {
  const commands = lensCommands(env);
  const ours = commands.find(isOurShim);
  const first = commands[0];
  if (first && first !== ours && env.pathDirs.some((dir) => isInDir(env, first, dir))) {
    const note = ours
      ? `Another lens comes first on your PATH and is the one that runs. The app's is at ${tildePath(ours, env.home)}.`
      : 'Not installed by the app, so the app leaves it alone.';
    return { state: 'external', where: tildePath(first, env.home), note };
  }
  if (!ours) return { state: 'missing', where: tildePath(join(shimDir(env), shimName(env)), env.home), note: null };
  const stale = readFileSync(ours, 'utf8') !== shimText(env);
  const onPath = env.pathDirs.some((dir) => isInDir(env, ours, dir));
  const folder = tildePath(join(ours, '..'), env.home);
  const note = stale
    ? 'It points at another copy of the app. Install again to point it here.'
    : onPath
      ? null
      : env.platform === 'win32'
        ? 'Open a new terminal to use it.'
        : `${folder} isn't on your PATH: add it in your shell's profile.`;
  return { state: stale ? 'missing' : 'installed', where: tildePath(ours, env.home), note };
}

async function installCli(env: SetupEnv): Promise<string> {
  const dir = shimDir(env);
  const file = join(dir, shimName(env));
  if (existsSync(file) && !isOurShim(file))
    throw new Error(`${tildePath(file, env.home)} is not the app's: left alone`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, shimText(env));
  if (env.platform !== 'win32') chmodSync(file, 0o755);
  else await env.setUserPath?.(dir, 'add');
  return 'Installed the lens command';
}

async function uninstallCli(env: SetupEnv): Promise<string> {
  const ours = lensCommands(env).filter(isOurShim);
  for (const file of ours) rmSync(file, { force: true });
  if (env.platform === 'win32') await env.setUserPath?.(ownBinDir(env), 'remove');
  return ours.length > 0 ? 'Removed the lens command' : 'The lens command was not installed by the app';
}

// ---- the agent skills ----

const skillsSource = (env: SetupEnv) => join(env.lensRoot, 'skills');
const skillsTarget = (env: SetupEnv) => join(env.home, '.claude', 'skills');

function skillNames(env: SetupEnv): string[] {
  try {
    return readdirSync(skillsSource(env), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

type SkillState = 'missing' | 'ours' | 'external';

/** A link or a folder without the marker is someone else's. */
function skillState(target: string): SkillState {
  try {
    if (lstatSync(target).isSymbolicLink()) return 'external';
  } catch {
    return 'missing';
  }
  return existsSync(join(target, SKILL_MARKER)) ? 'ours' : 'external';
}

function skillsItem(env: SetupEnv): SetupItem {
  const where = tildePath(skillsTarget(env), env.home);
  const states = skillNames(env).map((name) => skillState(join(skillsTarget(env), name)));
  if (states.length === 0 || states.includes('missing')) return { state: 'missing', where, note: null };
  if (states.includes('external')) {
    return {
      state: 'external',
      where,
      note: 'Not installed by the app (linked from a checkout?), so the app leaves them alone.',
    };
  }
  return { state: 'installed', where, note: null };
}

async function installSkills(env: SetupEnv): Promise<string> {
  let copied = 0;
  for (const name of skillNames(env)) {
    const target = join(skillsTarget(env), name);
    if (skillState(target) === 'external') continue;
    rmSync(target, { recursive: true, force: true });
    cpSync(join(skillsSource(env), name), target, { recursive: true });
    writeFileSync(join(target, SKILL_MARKER), 'Copied by the lens desktop app; its Settings remove this folder.\n');
    copied++;
  }
  return copied > 0 ? 'Installed the agent skills' : "The skills there are not the app's: left alone";
}

async function uninstallSkills(env: SetupEnv): Promise<string> {
  let removed = 0;
  for (const name of skillNames(env)) {
    const target = join(skillsTarget(env), name);
    if (skillState(target) !== 'ours') continue;
    rmSync(target, { recursive: true, force: true });
    removed++;
  }
  return removed > 0 ? 'Removed the agent skills' : 'The skills were not installed by the app';
}

// ---- what the Settings screen calls ----

export function setupState(env: SetupEnv): Record<SetupPart, SetupItem> {
  return { cli: cliItem(env), skills: skillsItem(env) };
}

/** Installs a part; resolves with what to tell the reader. */
export function install(env: SetupEnv, part: SetupPart): Promise<string> {
  return part === 'cli' ? installCli(env) : installSkills(env);
}

export function uninstall(env: SetupEnv, part: SetupPart): Promise<string> {
  return part === 'cli' ? uninstallCli(env) : uninstallSkills(env);
}

// ---- the PATH ----

function run(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { env, timeout: 5000, windowsHide: true }, (error, stdout) =>
      error ? reject(error) : resolve(stdout),
    );
  });
}

/**
 * The folders a terminal looks for commands in. On macOS and Linux an app started from the
 * desktop has a shorter PATH than a terminal, so the login shell is asked for its own.
 */
export async function terminalPath(env: NodeJS.ProcessEnv, platform: NodeJS.Platform): Promise<string[]> {
  const key = Object.keys(env).find((name) => name.toUpperCase() === 'PATH') ?? 'PATH';
  let path = env[key] ?? '';
  if (platform !== 'win32' && env.SHELL) {
    try {
      // between markers: a profile may print things of its own
      const output = await run(env.SHELL, ['-ilc', 'printf "<lens-path>%s</lens-path>" "$PATH"'], env);
      path = /<lens-path>(.*?)<\/lens-path>/s.exec(output)?.[1] ?? path;
    } catch {
      // no answer from the shell: the app's own PATH is the best guess
    }
  }
  return [...new Set(path.split(delimiter).filter(Boolean))];
}

/** Windows: the user's PATH lives in the registry; PowerShell edits it and tells running programs. */
export async function setWindowsUserPath(dir: string, change: 'add' | 'remove'): Promise<void> {
  const script = [
    '$dir = $env:LENS_BIN_DIR',
    "$parts = @(([Environment]::GetEnvironmentVariable('Path', 'User') -split ';') | Where-Object { $_ -and ($_ -ne $dir) })",
    "if ($env:LENS_PATH_CHANGE -eq 'add') { $parts += $dir }",
    "[Environment]::SetEnvironmentVariable('Path', ($parts -join ';'), 'User')",
  ].join('; ');
  await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    ...process.env,
    LENS_BIN_DIR: dir,
    LENS_PATH_CHANGE: change,
  });
}
