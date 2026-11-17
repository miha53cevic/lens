// A stand-in for `claude -p`, run through LENS_CLAUDE: it records how it was run in FAKE_CLAUDE_LOG
// (one JSON line per run) and does what FAKE_CLAUDE_MODE says:
//   answer   prints FAKE_CLAUDE_ANSWER as its result
//   fail     answers as Claude Code does when it can't run (not logged in)
//   hang     never answers
//   summary  does what the summary prompt asks, through the `lens` on its PATH: prepare, a
//            headline per unit, submit
//   child    starts a process of its own (its pid in FAKE_CLAUDE_CHILD) and never answers: a
//            stop must end both
// `--version` and `auth status --json` answer as Claude Code does, logged in unless
// FAKE_CLAUDE_AUTH says `out` (or `garbage`, for an answer that can't be read).

import { spawn, spawnSync } from 'node:child_process';
import { appendFileSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const argv = process.argv.slice(2);
if (argv[0] === '--version') {
  console.log('2.1.311 (Claude Code)');
  process.exit(0);
}
if (argv[0] === 'auth') {
  const auth = process.env.FAKE_CLAUDE_AUTH;
  console.log(auth === 'garbage' ? 'what?' : JSON.stringify({ loggedIn: auth !== 'out', authMethod: 'claude.ai' }));
  process.exit(0);
}

const prompt = readFileSync(0, 'utf8');
if (process.env.FAKE_CLAUDE_LOG) {
  const run = { args: process.argv.slice(2), cwd: process.cwd(), path: process.env.PATH ?? '', prompt };
  appendFileSync(process.env.FAKE_CLAUDE_LOG, JSON.stringify(run) + '\n');
}

const answer = (result: string, error = false) => {
  process.stdout.write(JSON.stringify({ type: 'result', subtype: 'success', is_error: error, result }));
  process.exit(error ? 1 : 0);
};

const lens = (args: string[]) => {
  const run = spawnSync('lens', args, { encoding: 'utf8' });
  if (run.status !== 0) answer(`lens ${args.join(' ')} failed: ${run.stderr || run.stdout}`, true);
  return run.stdout;
};

const mode = process.env.FAKE_CLAUDE_MODE;
if (mode === 'answer') answer(process.env.FAKE_CLAUDE_ANSWER ?? '');
if (mode === 'fail') answer('Not logged in · Please run /login', true);
if (mode === 'hang') setInterval(() => {}, 1000);
if (mode === 'child') {
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
  writeFileSync(process.env.FAKE_CLAUDE_CHILD!, String(child.pid));
  setInterval(() => {}, 1000);
}
if (mode === 'summary') {
  const prepare = /Run `lens (summary prepare[^`]*)`/.exec(prompt);
  if (!prepare) answer('no prepare command in the prompt', true);
  lens(prepare![1].split(' '));
  const root = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).stdout.trim();
  const summaries = join(root, '.lens', 'summary');
  const [key] = readdirSync(summaries).filter((name) => !name.startsWith('.'));
  const dir = join(summaries, key);
  const bundle = JSON.parse(readFileSync(join(dir, 'bundle.json'), 'utf8')) as { units: { id: string }[] };
  const units = Object.fromEntries(
    bundle.units.map((unit) => [
      unit.id,
      { headline: 'Claude wrote this', gist: 'fake', needsLook: false, changes: [], breaks: [] },
    ]),
  );
  writeFileSync(join(dir, 'result.json'), JSON.stringify({ units }));
  lens(['summary', 'submit', dir]);
  answer('no concerns');
}
