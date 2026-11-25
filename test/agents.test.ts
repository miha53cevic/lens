import { afterEach, beforeEach, test } from 'bun:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { agentRunner, agentRuns, AGENT_IDS, runAgent, stopRun, STOPPED } from '../src/cli-app/agents/index.ts';
import { lensShim, selfCommand } from '../src/cli-app/agents/run.ts';
import { claude, claudeResult, claudeTools, editRule, findClaude, READ_TOOLS } from '../src/cli-app/agents/claude.ts';
import type { AgentRunner } from '../src/cli-app/agents/types.ts';
import { createSummaryRunner, summaryPrompt } from '../src/cli-app/summary/agentRun.ts';
import { readStored } from '../src/cli-app/summary/store.ts';
import pkg from '../package.json' with { type: 'json' };

const FAKE = join(import.meta.dirname, 'fixtures', 'fakeClaude.ts');
const ENV = [
  'LENS_CLAUDE',
  'FAKE_CLAUDE_LOG',
  'FAKE_CLAUDE_MODE',
  'FAKE_CLAUDE_ANSWER',
  'FAKE_CLAUDE_AUTH',
  'FAKE_CLAUDE_CHILD',
];

let dir = '';
let log = '';
const saved = { ...process.env };

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), 'lens-agents-')));
  log = join(dir, 'runs.jsonl');
  // the fake, run as `claude` is: one file the server spawns
  const fake = join(dir, 'claude');
  writeFileSync(fake, `#!/bin/sh\nexec '${process.execPath}' '${FAKE}' "$@"\n`);
  chmodSync(fake, 0o755);
  process.env.LENS_CLAUDE = fake;
  process.env.FAKE_CLAUDE_LOG = log;
});

afterEach(() => {
  for (const name of ENV)
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  rmSync(dir, { recursive: true, force: true });
});

const runs = (): { args: string[]; cwd: string; path: string; prompt: string }[] =>
  existsSync(log)
    ? readFileSync(log, 'utf8')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line))
    : [];

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const until = async (done: () => boolean, ms = 10_000) => {
  for (const end = Date.now() + ms; !done() && Date.now() < end;) await new Promise((r) => setTimeout(r, 50));
  return done();
};

const read = { kind: 'read' } as const;

test('the registry: every config value has its runner, and none is the default', () => {
  for (const id of AGENT_IDS) assert.equal(agentRunner(id)?.id, id);
  assert.equal(agentRunner(null), null);
});

test('findClaude: LENS_CLAUDE, then the PATH, then where the installer puts it; null without one', () => {
  const home = join(dir, 'home');
  const onPath = join(dir, 'bin');
  mkdirSync(onPath);
  assert.equal(findClaude({ LENS_CLAUDE: '/x/claude', PATH: onPath }, home, 'darwin'), '/x/claude');
  // Windows: no folder of the machine's own to look in, so this machine's claude stays out of it
  assert.equal(findClaude({ PATH: onPath }, home, 'win32'), null);
  mkdirSync(join(home, '.local', 'bin'), { recursive: true });
  writeFileSync(join(home, '.local', 'bin', 'claude.exe'), '');
  assert.equal(findClaude({ PATH: onPath }, home, 'win32'), join(home, '.local', 'bin', 'claude.exe'));
  writeFileSync(join(onPath, 'claude.cmd'), '');
  assert.equal(findClaude({ Path: onPath }, home, 'win32'), join(onPath, 'claude.cmd'), "the PATH's comes first");
});

test("selfCommand: bun runs the CLI's sources; a compiled lens is itself", () => {
  const [bun, cli] = selfCommand('/usr/local/bin/bun');
  assert.equal(bun, '/usr/local/bin/bun');
  assert.ok(existsSync(cli) && cli.endsWith(join('cli-app', 'cli.ts')));
  assert.deepEqual(selfCommand('/Applications/Lens.app/Contents/Resources/lens/lens'), [
    '/Applications/Lens.app/Contents/Resources/lens/lens',
  ]);
});

test('the shim on PATH runs this lens', () => {
  const out = execFileSync(join(lensShim(), 'lens'), ['--version'], { encoding: 'utf8' });
  assert.ok(out.includes(pkg.version), out);
});

test("Claude's rules per access: read never writes; the summary writes only under its folder", () => {
  const folder = join(dir, 'a b', '.lens', 'summary');
  assert.equal(editRule(folder), `Edit(//${folder.replace(/^\//, '')}/**)`, 'absolute, the folder made first');
  const reading = claudeTools(read);
  assert.deepEqual(reading, { allowed: READ_TOOLS, denied: ['Edit', 'Write', 'NotebookEdit'] });
  assert.ok(!READ_TOOLS.some((tool) => /^(Edit|Write|Bash)$|Bash\((?!git (grep|log|show|diff|blame):)/.test(tool)));
  const summary = claudeTools({ kind: 'summary', writeUnder: folder });
  assert.ok(summary.allowed.includes('Bash(lens summary:*)'));
  assert.ok(summary.allowed.includes(editRule(folder)));
  for (const tool of ['Edit', 'Write', 'Bash']) assert.ok(!summary.allowed.includes(tool), `no ${tool} anywhere`);
});

test("claudeResult: the final message, or Claude Code's reason", () => {
  const ok = JSON.stringify({ is_error: false, result: ' **Yes.** a.ts:1 ' });
  assert.equal(claudeResult(ok, 0, ''), '**Yes.** a.ts:1');
  assert.throws(
    () => claudeResult(JSON.stringify({ is_error: true, result: 'Not logged in' }), 1, ''),
    /Claude Code failed: Not logged in/,
  );
  assert.throws(() => claudeResult('', 1, 'warn\nerror: unknown option'), /error: unknown option/);
  assert.throws(() => claudeResult(JSON.stringify({ is_error: false, result: '' }), 0, ''), /failed/);
});

test("Claude's status: ready, logged out, unreadable, not installed", async () => {
  assert.deepEqual(await claude.status(), {
    path: process.env.LENS_CLAUDE,
    version: '2.1.311',
    problem: null,
  });
  process.env.FAKE_CLAUDE_AUTH = 'out';
  assert.equal((await claude.status()).problem, 'logged-out');
  process.env.FAKE_CLAUDE_AUTH = 'garbage';
  assert.equal((await claude.status()).problem, 'unknown', "an answer it can't read is no alarm");
  process.env.LENS_CLAUDE = join(dir, 'nope');
  const gone = await claude.status();
  assert.equal(gone.problem, 'unknown', "a LENS_CLAUDE that isn't there answers nothing");
});

test("runAgent: headless, only the access it's given, the prompt on stdin, this lens first on PATH", async () => {
  process.env.FAKE_CLAUDE_MODE = 'answer';
  process.env.FAKE_CLAUDE_ANSWER = 'the answer';
  const result = await runAgent(
    claude,
    { cwd: dir, prompt: 'why?\n'.repeat(20_000), access: read, timeoutMs: 30_000 },
    { kind: 'ask', label: 'why?' },
  );
  assert.equal(result, 'the answer');
  const [run] = runs();
  assert.equal(run.cwd, dir);
  assert.equal(run.prompt, 'why?\n'.repeat(20_000), 'a long prompt arrives whole');
  assert.deepEqual(run.args.slice(0, 5), ['-p', '--output-format', 'json', '--permission-mode', 'dontAsk']);
  assert.deepEqual(run.args.slice(5), [
    '--allowedTools',
    ...READ_TOOLS,
    '--disallowedTools',
    'Edit',
    'Write',
    'NotebookEdit',
  ]);
  assert.ok(run.path.startsWith(lensShim() + ':'), 'its `lens` is this one');
  assert.deepEqual(agentRuns(), [], 'off the list once done');
});

test("runAgent: the agent's failure, a missing one, one that never answers, and a runner that refuses", async () => {
  process.env.FAKE_CLAUDE_MODE = 'fail';
  const task = { cwd: dir, prompt: 'x', access: read, timeoutMs: 30_000 };
  const info = { kind: 'ask' as const, label: 'x' };
  await assert.rejects(runAgent(claude, task, info), /Not logged in/);
  process.env.LENS_CLAUDE = join(dir, 'nope');
  await assert.rejects(runAgent(claude, task, info), /couldn't start Claude Code/);
  process.env.LENS_CLAUDE = join(dir, 'claude');
  process.env.FAKE_CLAUDE_MODE = 'hang';
  await assert.rejects(runAgent(claude, { ...task, timeoutMs: 1500 }, info), /took longer/);
  const refuses: AgentRunner = {
    ...claude,
    command: () => {
      throw new Error("can't keep writes to one folder");
    },
  };
  await assert.rejects(runAgent(refuses, task, info), /can't keep writes to one folder/);
  assert.deepEqual(agentRuns(), []);
});

test('a Stop or a timeout ends the run and what it started; a second Stop is no error', async () => {
  process.env.FAKE_CLAUDE_MODE = 'child';
  for (const how of ['stop', 'timeout'] as const) {
    const childFile = join(dir, how + '.pid');
    process.env.FAKE_CLAUDE_CHILD = childFile;
    const running = runAgent(
      claude,
      { cwd: dir, prompt: 'x', access: read, timeoutMs: how === 'timeout' ? 3000 : 60_000 },
      { kind: 'ask', label: 'a question' },
    ).catch((err: Error) => err.message);
    assert.ok(await until(() => existsSync(childFile) && readFileSync(childFile, 'utf8') !== ''), 'it started a child');
    const childPid = Number(readFileSync(childFile, 'utf8'));
    const [run] = agentRuns();
    assert.deepEqual({ kind: run.kind, label: run.label }, { kind: 'ask', label: 'a question' });
    if (how === 'stop') assert.equal(stopRun(run.id), true);
    const message = await running;
    assert.match(message, how === 'stop' ? new RegExp('^' + STOPPED + '$') : /took longer/);
    assert.ok(await until(() => !alive(childPid)), `${how}: the process it started is gone too`);
    assert.equal(stopRun(run.id), false, 'stopping it again finds nothing, and throws nothing');
  }
}, 30_000);

test('lens ending (any way but a SIGKILL) ends every run and what it started', async () => {
  const childFile = join(dir, 'child.pid');
  // a lens of its own: it starts a run, then exits as a crash or a process.exit elsewhere would
  const script = join(dir, 'lens.ts');
  const agents = join(import.meta.dirname, '..', 'src', 'cli-app', 'agents', 'index.ts');
  writeFileSync(
    script,
    `import { readFileSync } from 'node:fs';
import { agentRunner, runAgent } from ${JSON.stringify(agents)};
const task = { cwd: ${JSON.stringify(dir)}, prompt: 'x', access: { kind: 'read' } as const, timeoutMs: 60_000 };
void runAgent(agentRunner('claude')!, task, { kind: 'ask', label: 'x' }).catch(() => {});
setInterval(() => {
  try {
    if (readFileSync(${JSON.stringify(childFile)}, 'utf8')) process.exit(3);
  } catch {}
}, 50);
`,
  );
  const lens = spawnSync(process.execPath, [script], {
    env: { ...process.env, FAKE_CLAUDE_MODE: 'child', FAKE_CLAUDE_CHILD: childFile },
    timeout: 20_000,
  });
  assert.equal(lens.status, 3, String(lens.stderr));
  const childPid = Number(readFileSync(childFile, 'utf8'));
  assert.ok(await until(() => !alive(childPid)), "the agent's own process is gone with lens");
  const [run] = runs();
  assert.ok(run, 'the run had started');
}, 30_000);

test('the summary: the prepare command as /lens-review runs it, writing only in .lens/summary/', () => {
  const prompt = summaryPrompt('lens summary prepare pr 87');
  assert.ok(prompt.startsWith('Run `lens summary prepare pr 87` and follow the instructions it prints exactly'));
  assert.ok(prompt.includes("Don't spawn subagents"));
});

test('the summary runner: the agent prepares, writes and submits through this lens, and the summary is stored', async () => {
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 't@t');
  git('config', 'user.name', 't');
  writeFileSync(join(dir, 'calc.ts'), 'export const one = () => 1;\n');
  git('add', '-A');
  git('commit', '-qm', 'base');
  writeFileSync(join(dir, 'calc.ts'), 'export const one = () => 2 - 1;\n');

  process.env.FAKE_CLAUDE_MODE = 'summary';
  const runner = createSummaryRunner();
  const start = { runner: claude, cwd: dir, root: dir, prepare: 'lens summary prepare', label: 'diff@main' };
  assert.deepEqual(runner.state(), { running: false, error: null });
  assert.equal(runner.start(start), true);
  assert.equal(runner.start(start), false, 'one run at a time');
  assert.equal(runner.state().running, true);
  assert.equal(agentRuns()[0]?.kind, 'summary');
  await until(() => !runner.state().running, 30_000);
  assert.deepEqual(runner.state(), { running: false, error: null });
  assert.ok(runner.endedAt() !== null, 'a run that ended is over, whatever it left out');
  const stored = readStored(dir, 'diff@main');
  assert.equal(stored?.units['calc.ts#one']?.headline, 'Claude wrote this');
  const [run] = runs();
  assert.ok(run.args.includes('Bash(lens summary:*)'));
  assert.ok(run.args.includes(`Edit(//${dir.replace(/^\//, '')}/.lens/summary/**)`));

  process.env.FAKE_CLAUDE_MODE = 'fail';
  runner.start(start);
  await until(() => !runner.state().running, 30_000);
  assert.match(runner.state().error ?? '', /Not logged in/, 'a failed run says why');

  process.env.FAKE_CLAUDE_MODE = 'hang';
  runner.start(start);
  await until(() => agentRuns().length > 0);
  stopRun(agentRuns()[0].id);
  await until(() => !runner.state().running);
  assert.equal(runner.state().error, STOPPED);
  assert.ok(runner.endedAt() !== null, 'the server hides the run that was stopped');
}, 60_000);
