import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import { existsSync, mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { analyze } from '../src/cli-app/analyze.ts';
import { DEFAULT_CONFIG } from '../src/cli-app/config.ts';
import { createAskSession, REHAND_AFTER_MS, LISTEN_GRACE_MS, type NewQuestion } from '../src/cli-app/ask/session.ts';
import { findCites } from '../src/cli-app/ask/cites.ts';
import { replyNotes } from '../src/cli-app/ask/command.ts';
import { changeContext, questionText, selectionLabel, HOW_TO_ANSWER, RULES } from '../src/cli-app/ask/context.ts';
import { createAskRoutes } from '../src/cli-app/ask/routes.ts';
import { isLocalRequest, readCookie } from '../src/cli-app/render/web/http.ts';
import type { ViewerInput } from '../src/cli-app/render/web/server.ts';

const Q: NewQuestion = {
  text: 'why?',
  file: 'a.ts',
  unitId: null,
  label: 'a.ts',
  hash: 'h1',
  selection: null,
  concerns: [],
  breaks: [],
};

/** Runs `fn` in a fresh temp git repo (branch "main"), cleaned up afterwards. */
async function withRepo(fn: (dir: string, git: (...args: string[]) => string) => Promise<void>): Promise<void> {
  // realpath: on Windows tmpdir() can be an 8.3 short path, git reports the long one
  const dir = realpathSync.native(mkdtempSync(join(tmpdir(), 'lens-ask-')));
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
  try {
    git('init', '-q', '-b', 'main');
    git('config', 'user.email', 't@t');
    git('config', 'user.name', 't');
    await fn(dir, git);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const OLD = `export function total(items: number[]): number {
  let sum = 0;
  for (const i of items) sum += i;
  return sum;
}
`;
const NEW = `export function total(items: number[]): number {
  return items.reduce((a, b) => a + b, 0);
}
`;

/** A repo with one committed file and an unstaged change to it, analyzed like `lens diff`. */
async function changedRepo(dir: string, git: (...args: string[]) => string): Promise<ViewerInput> {
  writeFileSync(join(dir, 'calc.ts'), OLD);
  git('add', '-A');
  git('commit', '-qm', 'base');
  writeFileSync(join(dir, 'calc.ts'), NEW);
  return analyze('diff', [], dir, DEFAULT_CONFIG);
}

test('ask session: questions are handed out oldest first, once, and again after a while', () => {
  let t = 1000;
  const s = createAskSession(() => t);
  const a = s.add(Q);
  const b = s.add({ ...Q, text: 'and?' });
  assert.equal(a.id, 'q1');
  assert.equal(b.id, 'q2');
  assert.equal(s.next()?.id, 'q1');
  assert.equal(s.next()?.id, 'q2');
  assert.equal(s.next(), null, 'both are with an agent');
  t += REHAND_AFTER_MS;
  assert.equal(s.next()?.id, 'q1', "an agent that never answered doesn't hold the question forever");
  assert.ok(s.answer('q1', 'because', []));
  assert.ok(s.answer('q1', 'because, fixed', []), 'a second reply replaces the answer');
  assert.equal(s.get('q1')?.answer?.markdown, 'because, fixed');
  assert.equal(s.answer('q9', 'x', []), false);
  assert.equal(s.waiting()?.id, 'q2');
  s.answer('q2', 'ok', []);
  assert.equal(s.waiting(), null);
});

test('ask session: listening while a listen is open, and for a grace period after', () => {
  let t = 0;
  const s = createAskSession(() => t);
  t = LISTEN_GRACE_MS * 2;
  assert.equal(s.state().listening, false);
  s.listenStart();
  assert.equal(s.state().listening, true);
  s.listenEnd();
  t += LISTEN_GRACE_MS - 1;
  assert.equal(s.state().listening, true, 'between reply and the next listen');
  t += 1;
  assert.equal(s.state().listening, false);
});

test('ask session: an agent answering a question still counts as there, until it likely died', () => {
  let t = 0;
  const s = createAskSession(() => t);
  s.listenStart();
  s.add(Q);
  assert.equal(s.next()?.id, 'q1');
  s.listenEnd();
  t += LISTEN_GRACE_MS * 2;
  assert.equal(s.state().listening, true, 'it has no listen open while it writes the answer');
  t = REHAND_AFTER_MS;
  assert.equal(s.state().listening, false, 'it never answered');
  s.answer('q1', 'late', []);
  assert.equal(s.state().listening, false);
});

test('ask session: a question whose agent went away goes to the next listener at once', () => {
  let t = 0;
  const s = createAskSession(() => t);
  s.listenStart();
  s.add(Q);
  assert.equal(s.next()?.id, 'q1');
  s.listenEnd();
  t += LISTEN_GRACE_MS - 1;
  s.listenStart();
  assert.equal(s.next(), null, 'a second listener, while the first agent may still be answering');
  s.listenEnd();
  t += LISTEN_GRACE_MS;
  s.listenStart();
  assert.equal(s.next()?.id, 'q1', 'nobody listened for a while: the first agent is gone');
  assert.equal(s.next(), null, "and it's handed out once");
  s.answer('q1', 'because', []);
  s.listenEnd();
  t += LISTEN_GRACE_MS;
  s.listenStart();
  assert.equal(s.next(), null, 'an answered question stays answered');
});

test("ask session: a question goes stale when its code's hash changes or it's gone", () => {
  const s = createAskSession();
  s.add(Q);
  s.add({ ...Q, file: 'b.ts', hash: 'h2' });
  s.refreshStale((q) => (q.file === 'a.ts' ? 'h1' : null));
  assert.deepEqual(
    s.state().questions.map((q) => q.stale),
    [false, true],
  );
  s.refreshStale((q) => (q.file === 'a.ts' ? 'changed' : 'h2'));
  assert.deepEqual(
    s.state().questions.map((q) => q.stale),
    [true, false],
  );
});

test("findCites keeps path:line refs that point at real lines, in the viewer's paths", () => {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'lens-cites-')));
  try {
    mkdirSync(join(root, 'src', 'ask'), { recursive: true });
    writeFileSync(join(root, 'src', 'ask', 'a.ts'), 'one\ntwo\nthree\n');
    const md =
      'See `src/ask/a.ts:2` and src/ask/a.ts:3–4, not src/ask/a.ts:40 or src/b.ts:1 or ../x.ts:1. Time 12:30, on 127.0.0.1:5326.';
    const { cites, unresolved } = findCites(md, root, join(root, 'src'));
    assert.deepEqual(cites, [
      { ref: 'src/ask/a.ts:2', file: 'ask/a.ts', line: 2 },
      { ref: 'src/ask/a.ts:3–4', file: 'ask/a.ts', line: 3 },
    ]);
    assert.deepEqual(unresolved, [
      'src/ask/a.ts:40 — the file has only 3 lines',
      'src/b.ts:1 — file not found',
      '../x.ts:1 must be a path relative to the repository root',
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('replyNotes: an answer that cites nothing, or runs long, gets a note', () => {
  assert.deepEqual(replyNotes('**Yes.** It is (a.ts:3).', 1), []);
  assert.deepEqual(replyNotes('**Yes.**', 0), ['it cites no code: back its claims with path:line cites']);
  assert.deepEqual(replyNotes('word '.repeat(401), 2), [
    'it runs 401 words: about 120 is the aim, 300 for a walkthrough',
  ]);
  assert.deepEqual(replyNotes('word '.repeat(400), 2), [], '400 is still fine');
});

test('selectionLabel names the new-side lines, or the removed ones', () => {
  assert.equal(
    selectionLabel({
      file: 'a.ts',
      lines: [
        { n: 4, side: 'new', text: '' },
        { n: 2, side: 'old', text: '' },
        { n: 5, side: 'new', text: '' },
      ],
    }),
    'a.ts:4–5',
  );
  assert.equal(selectionLabel({ file: 'a.ts', lines: [{ n: 7, side: 'new', text: '' }] }), 'a.ts:7');
  assert.equal(
    selectionLabel({
      file: 'a.ts',
      lines: [
        { n: 2, side: 'old', text: '' },
        { n: 3, side: 'old', text: '' },
      ],
    }),
    'a.ts (removed lines 2–3)',
  );
});

test("questionText: rules, the question, the selection and the unit's code, then how to reply", async () => {
  await withRepo(async (dir, git) => {
    const input = await changedRepo(dir, git);
    const unit = input.summary!.units.find((u) => u.id === 'calc.ts#total')!;
    assert.ok(unit, 'the changed function is a unit');
    const q = {
      id: 'q1',
      text: '  is reduce safe on an empty list?  ',
      file: 'calc.ts',
      unitId: unit.id,
      label: 'total',
      selection: {
        file: 'calc.ts',
        lines: [
          { n: 2, side: 'old' as const, text: '  let sum = 0;' },
          { n: 2, side: 'new' as const, text: '  return items.reduce((a, b) => a + b, 0);' },
        ],
      },
      concerns: [
        { kind: 'risk' as const, text: 'an empty list has no first item', line: 'N2' },
        { kind: 'question' as const, text: 'why drop the loop?', line: 'O3' },
      ],
      breaks: [{ summary: 'callers expecting a loop count', callers: ['main.ts:4', 'cli.ts:9'] }],
    };
    const text = questionText(q, changeContext(input, q), { root: dir, cwd: dir, port: 5326 });
    assert.ok(
      text.includes(
        "CONCERNS  the summary's open notes on this change — claims to check, not facts\n" +
          '  risk · line 2 · an empty list has no first item\n  question · removed line 3 · why drop the loop?\n',
      ),
    );
    assert.ok(
      !questionText({ ...q, concerns: [] }, changeContext(input, q), { root: dir, cwd: dir, port: 5326 }).includes(
        'CONCERNS',
      ),
      'no open concern, no block',
    );
    assert.ok(
      text.includes(
        "CALLERS IT MAY BREAK  the summary's open notes on callers outside the change — claims to check, not facts\n" +
          '  callers expecting a loop count\n    callers: main.ts:4, cli.ts:9\n',
      ),
    );
    assert.ok(
      !questionText({ ...q, breaks: [] }, changeContext(input, q), { root: dir, cwd: dir, port: 5326 }).includes(
        'CALLERS IT MAY BREAK',
      ),
      'no open break, no block',
    );
    assert.ok(text.startsWith('lens ask · q1 · total (calc.ts)\n'));
    assert.ok(text.includes(RULES));
    assert.ok(text.includes('QUESTION\nis reduce safe on an empty list?\n'));
    assert.ok(
      text.includes('SELECTION  calc.ts:2 (removed lines marked −)\n  2−   let sum = 0;\n  2    return items.reduce'),
    );
    assert.ok(text.includes('THE CHANGE  total'));
    assert.ok(text.includes('  2+   return items.reduce((a, b) => a + b, 0);'), 'changed lines are marked +');
    assert.ok(text.includes('−   for (const i of items) sum += i;'), 'removed lines are in the change');
    assert.match(
      text,
      /lens ask reply q1 ".*\/\.lens\/answer\.md" --port 5326/,
      'the answer goes in .lens/, which exists while the viewer runs',
    );
    // how to answer: the verdict first, cites as evidence, a shape per kind of question, what was read
    assert.ok(text.includes(HOW_TO_ANSWER + '\n\nREPLY\n'), 'the brief comes right before how to reply');
    for (const rule of [
      'one bold sentence',
      'path:line cite',
      "Don't restate the selected lines",
      "Can't be sure",
      '```flow',
      'Read: ',
      'about 120 words',
    ]) {
      assert.ok(HOW_TO_ANSWER.includes(rule), rule);
    }

    const wholeFileUnit = { ...q, label: 'calc.ts' };
    assert.ok(
      questionText(
        wholeFileUnit,
        { ...changeContext(input, q), label: 'calc.ts' },
        { root: dir, cwd: dir, port: 5326 },
      ).startsWith('lens ask · q1 · calc.ts\n'),
      "a whole-file unit (json, md, …) isn't named twice",
    );

    const copy = questionText(q, changeContext(input, q), { forCopy: true, root: dir, cwd: dir, port: 5326 });
    assert.ok(!copy.includes('RULES'), 'a chat paste carries no agent rules');
    assert.ok(!copy.includes('lens ask reply'));
    assert.ok(!copy.includes('HOW TO ANSWER'), "nor the agent's brief");
    assert.ok(copy.includes('is reduce safe on an empty list?'));

    const whole = { ...q, unitId: null, label: 'calc.ts', selection: null };
    const fileText = questionText(whole, changeContext(input, whole), { root: dir, cwd: dir, port: 5326 });
    assert.ok(
      fileText.includes('THE FILE  calc.ts — changed lines 2\n  (read it from disk)'),
      'a Code-tab question names the file, not its code',
    );
    const prText = questionText(
      whole,
      { ...changeContext(input, whole), blob: 'abc123' },
      { root: dir, cwd: dir, port: 5326 },
    );
    assert.ok(
      prText.includes('(read it with `git show abc123` — not from disk'),
      "a PR's code is the blob, not the working tree",
    );
  });
});

test("isLocalRequest: only this machine's host, and no foreign origin", () => {
  const req = (headers: Record<string, string>) => ({ headers }) as unknown as IncomingMessage;
  assert.ok(isLocalRequest(req({ host: '127.0.0.1:5326' }), 5326), 'lens ask: no origin');
  assert.ok(isLocalRequest(req({ host: 'localhost:5326', origin: 'http://localhost:5326' }), 5326));
  assert.ok(
    !isLocalRequest(req({ host: '127.0.0.1:5326', origin: 'https://evil.example' }), 5326),
    'a cross-site POST',
  );
  assert.ok(!isLocalRequest(req({ host: 'evil.example:5326' }), 5326), 'DNS rebinding');
  assert.ok(
    !isLocalRequest(req({ host: '127.0.0.1:5326', 'sec-fetch-site': 'cross-site' }), 5326),
    'a no-cors GET from another site',
  );
  assert.ok(isLocalRequest(req({ host: '127.0.0.1:5326', 'sec-fetch-site': 'same-origin' }), 5326));
  assert.ok(
    isLocalRequest(req({ host: '127.0.0.1:5326', 'sec-fetch-site': 'none' }), 5326),
    'typed in the address bar',
  );
  assert.ok(!isLocalRequest(req({ host: '127.0.0.1:9999' }), 5326));
});

test('readCookie: the named cookie among the ones the browser sent', () => {
  const req = (cookie?: string) => ({ headers: { cookie } }) as unknown as IncomingMessage;
  assert.equal(readCookie(req('other=1; lens-theme=github-light'), 'lens-theme'), 'github-light');
  assert.equal(readCookie(req('my-lens-theme=nord'), 'lens-theme'), null, 'the whole name, not its end');
  assert.equal(readCookie(req('lens-theme=%E0%A4%A'), 'lens-theme'), null, 'not something lens wrote');
  assert.equal(readCookie(req(), 'lens-theme'), null);
});

async function listen(handler: Parameters<typeof createServer>[1]): Promise<{ server: Server; base: string }> {
  const server = createServer(handler);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  return { server, base: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

test('ask routes: ask, listen, answer, and stale after the code changes', async () => {
  await withRepo(async (dir, git) => {
    let input = await changedRepo(dir, git);
    const routes = createAskRoutes(() => input, 5326);
    const { server, base } = await listen(async (req, res) => {
      if (!(await routes.handle(req, res, new URL(req.url ?? '/', 'http://x')))) {
        res.writeHead(404);
        res.end();
      }
    });
    try {
      const post = (path: string, body: unknown) =>
        fetch(base + path, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) });

      assert.equal((await fetch(base + '/api/ask/next?wait=0')).status, 204, 'nothing to hand out yet');
      assert.equal((await post('/api/ask', { text: '  ', file: 'calc.ts' })).status, 400);
      assert.equal((await post('/api/ask', { text: 'hi', file: 'nope.ts' })).status, 400);
      assert.equal((await post('/api/ask', null)).status, 400);

      // the unit's summary has one concern; the viewer names it (not dismissed) and one the unit doesn't have
      const real = { kind: 'risk' as const, text: 'an empty list has no first item', line: 'N2' };
      input.summary!.units.find((u) => u.id === 'calc.ts#total')!.summary = {
        headline: '',
        gist: '',
        changes: [],
        breaks: [{ summary: 'a caller sums strings', callers: [{ file: 'main.ts', line: 1, lines: [] }] }],
        concerns: [real],
      };
      const asked = await post('/api/ask', {
        text: 'why reduce?',
        file: 'calc.ts',
        unitId: 'calc.ts#total',
        label: 'total',
        concerns: [real, { kind: 'bug', text: 'made up', line: 'N2' }],
        breaks: ['a caller sums strings', 'an invented break'],
      });
      assert.equal(asked.status, 200);
      assert.equal((await asked.json()).id, 'q1');
      assert.equal((await post('/api/ask', { text: 'and?', file: 'calc.ts' })).status, 409, 'one question at a time');

      const prompt = await (await post('/api/ask/prompt', { text: 'x', file: 'calc.ts' })).json();
      assert.ok(prompt.text.includes('THE FILE  calc.ts'));

      const next = await fetch(base + '/api/ask/next?wait=0');
      const handed = await next.json();
      assert.equal(handed.id, 'q1');
      assert.ok(handed.text.includes('why reduce?'));
      assert.ok(
        handed.text.includes('  risk · line 2 · an empty list has no first item\n'),
        "the unit's open concern goes along",
      );
      assert.ok(!handed.text.includes('made up'), "only the unit's own concerns do");
      assert.ok(
        handed.text.includes('  a caller sums strings\n    callers: main.ts:1\n'),
        "the unit's open break goes along",
      );
      assert.ok(!handed.text.includes('an invented break'), "only the unit's own breaks do");
      assert.equal((await fetch(base + '/api/ask')).status, 200);
      assert.equal((await (await fetch(base + '/api/ask')).json()).listening, true, 'a listen just ended');

      assert.equal((await post('/api/ask/q7/answer', 'x')).status, 404);
      const replied = await (
        await post('/api/ask/q1/answer', 'Shorter: calc.ts:2 replaces the loop. Not calc.ts:99.')
      ).json();
      assert.deepEqual(replied, { id: 'q1', cites: 1, unresolved: ['calc.ts:99 — the file has only 3 lines'] });
      const state = await (await fetch(base + '/api/ask')).json();
      assert.deepEqual(state.questions[0].answer.cites, [{ ref: 'calc.ts:2', file: 'calc.ts', line: 2 }]);
      assert.equal(state.questions[0].stale, false);

      writeFileSync(join(dir, 'calc.ts'), NEW.replace('0);', '0) || 0;'));
      input = await analyze('diff', [], dir, DEFAULT_CONFIG);
      routes.refresh();
      assert.equal((await (await fetch(base + '/api/ask')).json()).questions[0].stale, true);
    } finally {
      server.closeAllConnections();
      await new Promise((r) => server.close(r));
    }
  });
});

const CLI = join(import.meta.dirname, '..', 'src', 'cli-app', 'cli.ts');

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const s = createServer().listen(0, '127.0.0.1', () => {
      const { port } = s.address() as AddressInfo;
      s.close(() => resolve(port));
    });
  });
}

/** Runs the lens CLI to completion. */
function lens(cwd: string, ...args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI, ...args], { cwd });
    let stdout = '',
      stderr = '';
    child.stdout.on('data', (d) => {
      stdout += d;
    });
    child.stderr.on('data', (d) => {
      stderr += d;
    });
    child.on('close', (code) => resolve({ code: code ?? -1, stdout, stderr }));
  });
}

test("lens ask: listen gets the viewer's question, reply answers it, server.json comes and goes", async () => {
  await withRepo(async (dir, git) => {
    writeFileSync(join(dir, 'calc.ts'), OLD);
    git('add', '-A');
    git('commit', '-qm', 'base');
    writeFileSync(join(dir, 'calc.ts'), NEW);

    const port = await freePort();
    const viewer = spawn(process.execPath, [CLI, 'diff', '--no-open', '--port', String(port)], { cwd: dir });
    const exited = new Promise((r) => viewer.on('close', r));
    try {
      await new Promise<void>((resolve, reject) => {
        viewer.stdout.on('data', (d) => {
          if (String(d).includes('lens viewer on')) resolve();
        });
        viewer.on('close', () => reject(new Error('the viewer exited')));
      });
      const base = `http://127.0.0.1:${port}`;
      assert.ok(existsSync(join(dir, '.lens', 'server.json')), 'the viewer says where it runs');
      assert.ok(existsSync(join(dir, '.lens', '.gitignore')), 'and .lens/ keeps itself out of git');

      // listen first: it waits for a question (found via .lens/server.json, no --port)
      const listening = lens(join(dir), 'ask', 'listen');
      const asked = await fetch(base + '/api/ask', {
        method: 'POST',
        body: JSON.stringify({ text: 'why reduce?', file: 'calc.ts', unitId: 'calc.ts#total', label: 'total' }),
      });
      assert.equal(asked.status, 200);
      const heard = await listening;
      assert.equal(heard.code, 0, heard.stderr);
      assert.ok(heard.stdout.startsWith('lens ask · q1 · total (calc.ts)'));
      assert.ok(heard.stdout.includes('why reduce?'));

      writeFileSync(join(dir, 'answer.md'), 'It replaces the loop at calc.ts:2.\n');
      const replied = await lens(dir, 'ask', 'reply', 'q1', 'answer.md');
      assert.equal(replied.code, 0, replied.stderr);
      assert.equal(replied.stdout.trim(), 'lens: answered q1 (1 cite linked)');
      writeFileSync(join(dir, 'bare.md'), "Because it's shorter.\n");
      const bare = await lens(dir, 'ask', 'reply', 'q1', 'bare.md');
      assert.equal(bare.code, 0, 'a note, not a failure: the answer is in');
      assert.match(bare.stdout, /reply to q1 again if these matter:\n  - it cites no code/);
      writeFileSync(join(dir, 'answer.md'), 'It replaces the loop at calc.ts:2.\n');
      await lens(dir, 'ask', 'reply', 'q1', 'answer.md');
      const state = await (await fetch(base + '/api/ask')).json();
      assert.equal(state.questions[0].answer.markdown, 'It replaces the loop at calc.ts:2.');

      const unknown = await lens(dir, 'ask', 'reply', 'q5', 'answer.md');
      assert.equal(unknown.code, 1);
      assert.match(unknown.stderr, /no question q5/);

      await fetch(base + '/api/shutdown', { method: 'POST' });
      await exited;
      assert.ok(!existsSync(join(dir, '.lens', 'server.json')), 'removed when the viewer stops');

      const orphan = await lens(dir, 'ask', 'listen', '--port', String(port));
      assert.equal(orphan.code, 1);
      assert.match(orphan.stderr, /no lens viewer is answering on port/);
    } finally {
      viewer.kill();
      await exited; // Windows keeps the temp dir busy while the process lives
    }
  });
}, 60_000);
