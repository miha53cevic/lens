import { execFile } from 'node:child_process';
import { mkdirSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { toPosix } from '../paths.ts';
import { findBinary, installerDirs, viaShell } from './run.ts';
import type { AgentRunner, AgentStatus, AgentTask } from './types.ts';

// Claude Code, run headless (`claude -p`). Nobody is there to approve a tool, so it runs in
// `dontAsk`: what isn't allowed here is refused.

/** Reading the code and its history: what the instructions ask for (callers, git log -p, blame) */
export const READ_TOOLS = [
  'Read',
  'Grep',
  'Glob',
  'Bash(git grep:*)',
  'Bash(git log:*)',
  'Bash(git show:*)',
  'Bash(git diff:*)',
  'Bash(git blame:*)',
];
export const WRITE_TOOLS = ['Edit', 'Write', 'NotebookEdit'];

/** How long a status check may take: a hung one must not hold `lens info` */
const STATUS_TIMEOUT_MS = 5000;

/** The `claude` to run: LENS_CLAUDE (the tests' fake), else the PATH's, else where its installers put it. */
export function findClaude(
  env: NodeJS.ProcessEnv = process.env,
  home: string = homedir(),
  platform: NodeJS.Platform = process.platform,
): string | null {
  if (env.LENS_CLAUDE) return env.LENS_CLAUDE;
  const names = platform === 'win32' ? ['claude.exe', 'claude.cmd'] : ['claude'];
  return findBinary(names, [...installerDirs(platform, home), join(home, '.claude', 'local')], env);
}

/** A permission rule for files under `dir`, absolute (`//`), as Claude Code spells one: Edit's covers Write too. */
export function editRule(dir: string): string {
  mkdirSync(dir, { recursive: true });
  const real = toPosix(realpathSync(dir)).replace(/^\/+/, '');
  return `Edit(//${real}/**)`;
}

/** The permission rules for a task's access: what it may use without asking, and what it never gets */
export function claudeTools(access: AgentTask['access']): { allowed: string[]; denied: string[] } {
  if (access.kind === 'read') return { allowed: READ_TOOLS, denied: WRITE_TOOLS };
  return { allowed: [...READ_TOOLS, 'Bash(lens summary:*)', editRule(access.writeUnder)], denied: [] };
}

/** The final message in `claude -p --output-format json`'s answer, or why there is none. */
export function claudeResult(stdout: string, code: number | null, stderr: string): string {
  let answer: { is_error?: unknown; result?: unknown; subtype?: unknown } | null = null;
  try {
    answer = JSON.parse(stdout);
  } catch {
    /* no JSON: it failed before answering */
  }
  const result = typeof answer?.result === 'string' ? answer.result.trim() : '';
  if (answer && answer.is_error !== true && code === 0 && result) return result;
  const why = result || stderr.trim().split('\n').at(-1) || (answer ? String(answer.subtype) : `exit ${code}`);
  throw new Error(`Claude Code failed: ${why}`);
}

const execFileAsync = promisify(execFile);

/** What `claude` prints for these arguments, or null when it fails */
async function ask(path: string, args: string[]): Promise<string | null> {
  try {
    const [file, argv] = viaShell(path, args);
    const { stdout } = await execFileAsync(file, argv, { timeout: STATUS_TIMEOUT_MS, windowsHide: true });
    return stdout;
  } catch {
    return null;
  }
}

export const claude: AgentRunner = {
  id: 'claude',
  name: 'Claude Code',
  loginCommand: 'claude auth login',

  async status(): Promise<AgentStatus> {
    const path = findClaude();
    if (!path) return { path: null, version: null, problem: 'missing' };
    const [version, auth] = await Promise.all([ask(path, ['--version']), ask(path, ['auth', 'status', '--json'])]);
    let loggedIn: unknown = null;
    try {
      loggedIn = JSON.parse(auth ?? '').loggedIn;
    } catch {
      // not JSON: an older claude, or something else by that name
    }
    return {
      path: toPosix(path),
      version: /\d+\.\d+\.\d+/.exec(version ?? '')?.[0] ?? null,
      problem: loggedIn === true ? null : loggedIn === false ? 'logged-out' : 'unknown',
    };
  },

  command(task) {
    const file = findClaude();
    if (!file) throw new Error("Claude Code isn't installed: no `claude` on the PATH");
    const { allowed, denied } = claudeTools(task.access);
    const args = ['-p', '--output-format', 'json', '--permission-mode', 'dontAsk', '--allowedTools', ...allowed];
    return { file, args: denied.length > 0 ? [...args, '--disallowedTools', ...denied] : args };
  },

  result: claudeResult,
};
