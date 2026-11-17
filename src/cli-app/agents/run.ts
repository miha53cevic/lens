import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AgentRunInfo, AgentRunner, AgentTask } from './types.ts';

// Running an agent, the same for every runner. Each run is its own process group (on Windows, its
// own tree), so a Stop, a timeout or lens stopping kills the agent and whatever it started.
// stopAll() runs on every way lens ends (the server's signals, and `exit` for the rest); only a
// SIGKILL of lens itself leaves a run going, until the agent finishes.

/** A run's rejection when it was stopped (a Stop, or lens stopping): callers say "Stopped", not a failure */
export const STOPPED = 'Stopped';

export const pathKey = (env: NodeJS.ProcessEnv) =>
  Object.keys(env).find((name) => name.toUpperCase() === 'PATH') ?? 'PATH';

/**
 * The first of `names` on the PATH, else in `dirs` (where its installers put it: an app started
 * from the desktop gets a short PATH). Null when there is none.
 */
export function findBinary(names: string[], dirs: string[], env: NodeJS.ProcessEnv = process.env): string | null {
  for (const dir of [...(env[pathKey(env)] ?? '').split(delimiter).filter(Boolean), ...dirs])
    for (const name of names) {
      const file = join(dir, name);
      if (statSync(file, { throwIfNoEntry: false })?.isFile()) return file;
    }
  return null;
}

/** Where installers put a CLI besides the PATH: ~/.local/bin, and on a Mac or Linux Homebrew's and /usr/local's */
export const installerDirs = (platform: NodeJS.Platform, home: string = homedir()): string[] =>
  platform === 'win32'
    ? [join(home, '.local', 'bin')]
    : [join(home, '.local', 'bin'), '/opt/homebrew/bin', '/usr/local/bin'];

/** A `.cmd` runs only through cmd; anything else as it is. */
export const viaShell = (
  file: string,
  args: string[],
  platform: NodeJS.Platform = process.platform,
): [string, string[]] =>
  platform === 'win32' && /\.cmd$/i.test(file) ? ['cmd.exe', ['/d', '/c', file, ...args]] : [file, args];

/** This lens, as a command: the compiled binary alone, or bun with the CLI's sources. */
export function selfCommand(execPath: string = process.execPath): string[] {
  const fromBun = /^bun(\.exe)?$/i.test(basename(execPath));
  return fromBun ? [execPath, fileURLToPath(new URL('../cli.ts', import.meta.url))] : [execPath];
}

const quoteSh = (word: string) => "'" + word.replace(/'/g, `'\\''`) + "'";

let shimDir: string | null = null;

/**
 * A folder with a `lens` that runs this lens, put first on the agent's PATH: the instructions it
 * follows run `lens summary …`, which must be this version even when another `lens` is
 * installed, or none is.
 */
export function lensShim(): string {
  if (shimDir && existsSync(shimDir)) return shimDir;
  const dir = mkdtempSync(join(tmpdir(), 'lens-agent-'));
  const command = selfCommand();
  const sh = join(dir, 'lens');
  writeFileSync(sh, `#!/bin/sh\nexec ${command.map(quoteSh).join(' ')} "$@"\n`);
  chmodSync(sh, 0o755);
  writeFileSync(join(dir, 'lens.cmd'), `@${command.map((word) => `"${word}"`).join(' ')} %*\r\n`);
  shimDir = dir;
  // made outside a run too (the tests): it goes with this lens however it ends, short of a SIGKILL
  process.once('exit', () => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

interface Run extends AgentRunInfo {
  child: ChildProcess;
  stopped: boolean;
}

const runs = new Map<string, Run>();
let runCount = 0;
let stopping = false;
let exitHooked = false;

/** Kills the run's process and everything it started; synchronous, so it works inside `exit`. */
function killTree(child: ChildProcess): void {
  if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) return;
  try {
    if (process.platform === 'win32')
      spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    // the negative pid is the run's group: detached made it its leader
    else process.kill(-child.pid, 'SIGKILL');
  } catch {
    // gone already
  }
}

/** The runs going, oldest first */
export function agentRuns(): AgentRunInfo[] {
  return [...runs.values()].map(({ id, kind, label, startedAt }) => ({ id, kind, label, startedAt }));
}

/** Stops a run: it rejects with STOPPED. False when there's no such run (it may have just ended). */
export function stopRun(id: string): boolean {
  const run = runs.get(id);
  if (!run) return false;
  run.stopped = true;
  killTree(run.child);
  return true;
}

/** lens is stopping: every run is killed, none starts after, and the shim goes. Runs once. */
export function stopAll(): void {
  if (stopping) return;
  stopping = true;
  for (const run of runs.values()) {
    run.stopped = true;
    killTree(run.child);
  }
  if (shimDir) rmSync(shimDir, { recursive: true, force: true });
}

/** Runs the agent on the task to its end: its final message, or why there is none. */
export function runAgent(
  runner: AgentRunner,
  task: AgentTask,
  info: Pick<AgentRunInfo, 'kind' | 'label'>,
): Promise<string> {
  if (stopping) return Promise.reject(new Error(STOPPED));
  let file: string;
  let args: string[];
  try {
    const command = runner.command(task);
    [file, args] = viaShell(command.file, command.args);
  } catch (err) {
    return Promise.reject(err);
  }
  // the server stops on its signals (stopAll there); this covers every other way out
  if (!exitHooked) process.once('exit', stopAll);
  exitHooked = true;
  const key = pathKey(process.env);
  const env = { ...process.env, [key]: lensShim() + delimiter + (process.env[key] ?? '') };
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { cwd: task.cwd, env, windowsHide: true, detached: process.platform !== 'win32' });
    const run: Run = { id: String(++runCount), ...info, startedAt: Date.now(), child, stopped: false };
    runs.set(run.id, run);
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child);
    }, task.timeoutMs);
    const end = () => {
      clearTimeout(timer);
      runs.delete(run.id);
    };
    child.stdout!.on('data', (chunk) => (stdout += chunk));
    child.stderr!.on('data', (chunk) => (stderr += chunk));
    child.stdin!.on('error', () => {}); // it may exit before reading the prompt: its exit says why
    child.on('error', (err) => {
      end();
      reject(new Error(`couldn't start ${runner.name}: ${err.message}`));
    });
    child.on('close', (code) => {
      end();
      if (run.stopped) return reject(new Error(STOPPED));
      if (timedOut) return reject(new Error(`the agent took longer than ${Math.round(task.timeoutMs / 60_000)} min`));
      try {
        resolve(runner.result(stdout, code, stderr));
      } catch (err) {
        reject(err);
      }
    });
    child.stdin!.end(task.prompt);
  });
}
