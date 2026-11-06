// Lavish (github.com/kunchenguid/lavish-axi), as the Plan tab uses it: whether it is set up, what
// its server knows of each session, and opening one. lens only reads what Lavish keeps and runs
// its CLI with --no-open; the agent's side (the skill, `lavish-axi poll`) is untouched.

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';
import type { LavishSetup } from '../api/contract.ts';

/** lavish-axi's `engines` */
const NODE_MAJOR = 22;
const DEFAULT_PORT = 4387;

export interface LavishEnv {
  env: NodeJS.ProcessEnv;
  home: string;
  platform: NodeJS.Platform;
}

export const hostEnv = (): LavishEnv => ({ env: process.env, home: homedir(), platform: process.platform });

const pathKey = (env: NodeJS.ProcessEnv) => Object.keys(env).find((name) => name.toUpperCase() === 'PATH') ?? 'PATH';

/**
 * Where node may be besides the PATH: an app started from the desktop gets a short one, and nvm,
 * Volta and fnm put node in the home folder. The newest nvm version first.
 */
function nodeHomes({ home, platform }: LavishEnv): string[] {
  const dirs = platform === 'darwin' ? ['/opt/homebrew/bin', '/usr/local/bin'] : [];
  const nvm = join(home, '.nvm', 'versions', 'node');
  try {
    const versions = readdirSync(nvm).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    dirs.push(...versions.map((version) => join(nvm, version, 'bin')));
  } catch {
    /* no nvm */
  }
  dirs.push(join(home, '.volta', 'bin'), join(home, '.local', 'share', 'fnm', 'aliases', 'default', 'bin'));
  return dirs;
}

function searchPath(lavishEnv: LavishEnv): string[] {
  const own = (lavishEnv.env[pathKey(lavishEnv.env)] ?? '').split(delimiter).filter(Boolean);
  return [...own, ...nodeHomes(lavishEnv).filter((dir) => !own.includes(dir))];
}

/** Every `name` on the search path, in its order, as files; Windows' shims are .cmd files. */
function whichAll(name: string, lavishEnv: LavishEnv): string[] {
  const names = lavishEnv.platform === 'win32' ? [name + '.cmd', name + '.exe', name] : [name];
  return searchPath(lavishEnv).flatMap((dir) =>
    names.flatMap((candidate) => {
      const file = join(dir, candidate);
      try {
        return statSync(file).isFile() ? [file] : [];
      } catch {
        return []; // not here
      }
    }),
  );
}

const which = (name: string, lavishEnv: LavishEnv): string | null => whichAll(name, lavishEnv)[0] ?? null;

/** The skill's folder, where an agent looks for it: the project's own, then the user's. */
function skillFolders(root: string, home: string): string[] {
  return [
    join(root, '.claude', 'skills', 'lavish'),
    join(root, '.agents', 'skills', 'lavish'),
    join(home, '.claude', 'skills', 'lavish'),
    join(home, '.agents', 'skills', 'lavish'),
  ];
}

const major = (version: string) => Number(version.split('.')[0]);

/**
 * The node that runs Lavish, with its version: the first on the search path that is new enough,
 * else the first that is node at all (to say which was found); null when there is none. A `node`
 * that gives no version isn't one: `bun --bun run` (how `bun run app` starts the desktop app) puts
 * bun's own `node` first on the PATH, and every process under it inherits that.
 */
function findNode(lavishEnv: LavishEnv): { file: string; version: string } | null {
  let first: { file: string; version: string } | null = null;
  for (const file of whichAll('node', lavishEnv)) {
    const run = spawnSync(file, ['--version'], { encoding: 'utf8', timeout: 5000, windowsHide: true });
    const version = /^v(\d+\.\d+\.\d+)/.exec((run.stdout ?? '').trim())?.[1];
    if (!version) continue;
    if (major(version) >= NODE_MAJOR) return { file, version };
    first ??= { file, version };
  }
  return first;
}

// What setup() found, by root: node is asked for its version once it's found, not on every poll.
const found = new Map<string, { at: number; setup: LavishSetup; run: LavishRun | null }>();
/** How long a found setup is trusted: one that's missing something is looked for again sooner. */
const SETUP_FOR_MS = 60_000;
const MISSING_FOR_MS = 3_000;

/** How lens runs the CLI: the command and the arguments before lavish-axi's own, and its PATH. */
interface LavishRun {
  command: string;
  args: string[];
  env: NodeJS.ProcessEnv;
}

function look(root: string, lavishEnv: LavishEnv): { setup: LavishSetup; run: LavishRun | null } {
  const skill = skillFolders(root, lavishEnv.home).find((dir) => existsSync(join(dir, 'SKILL.md'))) ?? null;
  const node = findNode(lavishEnv);
  const nodeOk = node !== null && major(node.version) >= NODE_MAJOR;
  const own = which('lavish-axi', lavishEnv);
  const npx = own ? null : which('npx', lavishEnv);
  const cli = !nodeOk ? null : own ? 'lavish-axi' : npx ? 'npx' : null;
  // the shims run `node` from the PATH: the one found goes first
  const key = pathKey(lavishEnv.env);
  const nodeDir = node ? join(node.file, '..') : null;
  const env = {
    ...lavishEnv.env,
    [key]: [nodeDir, lavishEnv.env[key]].filter(Boolean).join(delimiter),
    LAVISH_AXI_NO_OPEN: '1',
  };
  const run =
    cli === 'lavish-axi'
      ? { command: own!, args: [], env }
      : cli === 'npx'
        ? { command: npx!, args: ['-y', 'lavish-axi'], env }
        : null;
  const shown = skill && skill.startsWith(lavishEnv.home) ? '~' + skill.slice(lavishEnv.home.length) : skill;
  return {
    setup: { skill: shown?.split('\\').join('/') ?? null, node: node?.version ?? null, nodeNeeded: NODE_MAJOR, cli },
    run,
  };
}

/** Whether the Plan tab can use Lavish here: the skill an agent loads, and the CLI it runs. */
export function lavishSetup(root: string, lavishEnv = hostEnv()): LavishSetup {
  return cached(root, lavishEnv).setup;
}

function cached(root: string, lavishEnv: LavishEnv) {
  const held = found.get(root);
  const ready = held && held.setup.skill !== null && held.run !== null;
  if (held && Date.now() - held.at < (ready ? SETUP_FOR_MS : MISSING_FOR_MS)) return held;
  const fresh = { at: Date.now(), ...look(root, lavishEnv) };
  found.set(root, fresh);
  return fresh;
}

/** One session, as Lavish's state file keeps it (only what lens reads of it). */
export interface LavishSession {
  key: string;
  /** Absolute, as Lavish canonicalized it */
  file: string;
  url: string;
  status: 'open' | 'ended';
  endedByUser: boolean;
  revision: number;
  pending: number;
}

function stateDir(lavishEnv: LavishEnv): string {
  return lavishEnv.env.LAVISH_AXI_STATE_DIR || join(lavishEnv.home, '.lavish-axi');
}

// state.json holds every session's chat too (it runs to MBs): it's parsed again only once it changed
let heldState: { file: string; mtime: number; size: number; sessions: LavishSession[] } | null = null;

/** Every session Lavish keeps, from its state file; none when there is no file or it isn't one Lavish wrote. */
export function lavishSessions(lavishEnv = hostEnv()): LavishSession[] {
  const file = join(stateDir(lavishEnv), 'state.json');
  let stat;
  try {
    stat = statSync(file);
  } catch {
    return [];
  }
  if (heldState?.file === file && heldState.mtime === stat.mtimeMs && heldState.size === stat.size) {
    return heldState.sessions;
  }
  let sessions: LavishSession[] = [];
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8'))?.sessions;
    sessions = Object.values(raw && typeof raw === 'object' ? raw : {}).flatMap((entry) => {
      const session = entry as Record<string, unknown>;
      if (typeof session.key !== 'string' || typeof session.file !== 'string' || typeof session.url !== 'string') {
        return [];
      }
      return [
        {
          key: session.key,
          file: session.file,
          url: session.url,
          status: session.status === 'open' ? 'open' : 'ended',
          endedByUser: session.ended_by === 'user',
          revision: Number(session.artifact_revision) || 0,
          pending: Number(session.pending_prompts) || 0,
        } satisfies LavishSession,
      ];
    });
  } catch {
    /* mid-write, or not Lavish's: nothing is claimed */
  }
  heldState = { file, mtime: stat.mtimeMs, size: stat.size, sessions };
  return sessions;
}

/** Lavish's server, always asked on loopback: a Tailscale session URL names the machine instead. */
export function lavishOrigin(sessionUrl: string | null, lavishEnv = hostEnv()): string {
  let port = Number(lavishEnv.env.LAVISH_AXI_PORT) || DEFAULT_PORT;
  try {
    if (sessionUrl) port = Number(new URL(sessionUrl).port) || port;
  } catch {
    /* not a URL: the default */
  }
  return 'http://127.0.0.1:' + port;
}

/**
 * The sessions an agent polls right now, by key, as Lavish's server says (`/health`); none when
 * it isn't running. Null when it doesn't answer: then nothing is known about who listens.
 */
export async function lavishListeners(origin: string): Promise<Set<string> | null> {
  try {
    const response = await fetch(origin + '/health', { signal: AbortSignal.timeout(800) });
    if (!response.ok) return null;
    const health = (await response.json()) as { app?: string; listeners?: { key?: unknown }[] };
    if (health.app !== 'lavish-axi') return null;
    return new Set(
      (health.listeners ?? []).flatMap((listener) => (typeof listener?.key === 'string' ? [listener.key] : [])),
    );
  } catch {
    return null;
  }
}

/** What `lavish-axi <file> --no-open` printed: the session's URL, or why there is none. */
export function parseOpened(output: string): { url: string; key: string } | { error: string } {
  // a session the reader ended from Lavish still names its URL, but stays ended without --reopen
  if (/^\s*status:\s*"?user-ended/m.test(output)) return { error: 'This plan was ended in Lavish: reopen it to go on' };
  const url = /url:\s*"?(https?:\/\/[^\s"]+\/session\/([^\s"/]+))"?/.exec(output);
  if (url) return { url: url[1], key: url[2] };
  const error = /^error:\s*(.+)$/m.exec(output)?.[1];
  return { error: error ? error.replace(/^"|"$/g, '') : 'Lavish opened no session' };
}

/**
 * Opens (or resumes) the session of `file` without a browser window, starting Lavish's server if
 * it isn't up. `reopen`: one the reader ended from Lavish, reopened because they asked.
 */
export async function openLavish(
  root: string,
  file: string,
  reopen: boolean,
  lavishEnv = hostEnv(),
): Promise<{ url: string; key: string }> {
  const opened = parseOpened(await runLavish(root, [file, '--no-open', ...(reopen ? ['--reopen'] : [])], lavishEnv));
  if ('error' in opened) throw new Error(opened.error);
  return opened;
}

/**
 * Ends the session of `file` as an agent would (`lavish-axi end`): unlike an end from Lavish's own
 * page, the plan then opens again with no --reopen.
 */
export async function endLavish(root: string, file: string, lavishEnv = hostEnv()): Promise<void> {
  const output = await runLavish(root, ['end', file], lavishEnv);
  if (!/^\s*status:\s*"?ended/m.test(output)) {
    throw new Error(/^error:\s*(.+)$/m.exec(output)?.[1] ?? "Lavish didn't end the session");
  }
}

/** Runs Lavish's CLI in the root with these arguments, and what it printed (stdout and stderr). */
async function runLavish(root: string, lavishArgs: string[], lavishEnv: LavishEnv): Promise<string> {
  const run = cached(root, lavishEnv).run;
  if (!run) throw new Error('Lavish is not set up');
  const args = [...run.args, ...lavishArgs];
  // a .cmd shim runs only through cmd; the file is one lens listed, its name checked (plans.ts)
  const [command, argv] =
    lavishEnv.platform === 'win32' && run.command.endsWith('.cmd')
      ? ['cmd.exe', ['/d', '/c', run.command, ...args]]
      : [run.command, args];
  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, argv, {
      cwd: root,
      env: run.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let text = '';
    child.stdout.on('data', (chunk) => (text += String(chunk)));
    child.stderr.on('data', (chunk) => (text += String(chunk)));
    // npx fetches the package on its first run
    const timer = setTimeout(() => child.kill(), 90_000);
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(new Error("Lavish couldn't be started: " + error.message));
    });
    child.on('close', () => {
      clearTimeout(timer);
      resolve(text);
    });
  });
}
