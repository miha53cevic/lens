// The Plan tab's server side: whether Lavish is set up (plan/lavish.ts), the root's plans with their
// sessions (plan/plans.ts), the proxy that lets the viewer frame Lavish's page (plan/proxy.ts), and
// the routes that tie them together (plan/routes.ts). Lavish itself is faked: its CLI by a script
// on the PATH, its server by a local one that guards itself as Lavish does.

import { afterAll, test } from 'bun:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { lavishSessions, lavishSetup, openLavish, parseOpened, type LavishEnv } from '../src/cli-app/plan/lavish.ts';
import { isListedPlan, listPlans, readPlans } from '../src/cli-app/plan/plans.ts';
import { frameablePolicy, pathKey, startPlanProxy, upstreamHeaders } from '../src/cli-app/plan/proxy.ts';
import { createPlanRoutes } from '../src/cli-app/plan/routes.ts';

const temps: string[] = [];
const temp = (name: string) => {
  const dir = mkdtempSync(join(tmpdir(), 'lens-plan-' + name + '-'));
  temps.push(dir);
  return dir;
};
const closers: (() => void)[] = [];
afterAll(() => {
  for (const close of closers) close();
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

/** A folder of scripts on the PATH: `node` prints its version, the rest print `output` */
function fakeBin(version: string | null, scripts: Record<string, string> = {}): string {
  const bin = temp('bin');
  const write = (name: string, body: string) => {
    writeFileSync(join(bin, name), '#!/bin/sh\n' + body + '\n');
    chmodSync(join(bin, name), 0o755);
  };
  if (version) write('node', `echo v${version}`);
  for (const [name, body] of Object.entries(scripts)) write(name, body);
  return bin;
}

/** A home with (or without) the skill, a PATH of only `bin`, and Lavish's state in the home. Linux: no Homebrew folders are looked in. */
function lavishEnv(bin: string, skill: boolean): LavishEnv {
  const home = temp('home');
  if (skill) {
    mkdirSync(join(home, '.claude', 'skills', 'lavish'), { recursive: true });
    writeFileSync(join(home, '.claude', 'skills', 'lavish', 'SKILL.md'), '# Lavish\n');
  }
  return { env: { PATH: bin, LAVISH_AXI_STATE_DIR: join(home, 'state') }, home, platform: 'linux' };
}

function writeState(lavish: LavishEnv, sessions: Record<string, unknown>[]) {
  const dir = lavish.env.LAVISH_AXI_STATE_DIR!;
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'state.json'),
    JSON.stringify({ sessions: Object.fromEntries(sessions.map((s) => [s.key, s])) }),
  );
}

/** A root with these files under .lavish/, each modified `at` seconds into 2026 */
function planRoot(files: Record<string, { html: string; at: number }>): string {
  const root = temp('root');
  for (const [file, { html, at }] of Object.entries(files)) {
    const path = join(root, '.lavish', file);
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, html);
    const when = new Date(Date.UTC(2026, 0, 1) + at * 1000);
    utimesSync(path, when, when);
  }
  return root;
}

test('Lavish is set up with the skill and a node 22+ with npx; lavish-axi on the PATH wins over npx', () => {
  const root = temp('root');
  assert.deepEqual(lavishSetup(root, lavishEnv(fakeBin('24.11.1', { npx: 'true' }), true)), {
    skill: '~/.claude/skills/lavish',
    node: '24.11.1',
    nodeNeeded: 22,
    cli: 'npx',
  });
  const both = lavishEnv(fakeBin('22.0.0', { npx: 'true', 'lavish-axi': 'true' }), true);
  assert.equal(lavishSetup(temp('root'), both).cli, 'lavish-axi');
});

test('Lavish is not set up without the skill, with an old node, or with none', () => {
  assert.equal(lavishSetup(temp('root'), lavishEnv(fakeBin('24.0.0', { npx: 'true' }), false)).skill, null);
  const old = lavishSetup(temp('root'), lavishEnv(fakeBin('20.9.0', { npx: 'true' }), true));
  assert.deepEqual([old.node, old.cli], ['20.9.0', null]);
  const none = lavishSetup(temp('root'), lavishEnv(fakeBin(null, { npx: 'true' }), true));
  assert.deepEqual([none.node, none.cli], [null, null]);
});

test("a project's own skill counts, as an agent there finds it", () => {
  const root = temp('root');
  mkdirSync(join(root, '.claude', 'skills', 'lavish'), { recursive: true });
  writeFileSync(join(root, '.claude', 'skills', 'lavish', 'SKILL.md'), '# Lavish\n');
  const setup = lavishSetup(root, lavishEnv(fakeBin('24.0.0', { npx: 'true' }), false));
  assert.equal(setup.skill, join(root, '.claude', 'skills', 'lavish'));
});

test("the plans are .lavish/'s HTML files, newest first, with their titles and sessions", () => {
  const root = planRoot({
    'plan-tab.html': { html: '<!doctype html><title>Plan &amp; tab</title>', at: 30 },
    'notes.html': { html: '<p>no title</p>', at: 20 },
    'plan-tab.export.html': { html: '<title>an export</title>', at: 40 },
    'shadcn/index.html': { html: '<title>Folder plan</title>', at: 10 },
    'shadcn/deeper/too-far/x.html': { html: '<title>too deep</title>', at: 50 },
    'shot.png': { html: '', at: 60 },
  });
  const sessions = [
    {
      key: 'k1',
      file: join(root, '.lavish', 'plan-tab.html'),
      url: '',
      status: 'open' as const,
      endedByUser: false,
      revision: 3,
      pending: 1,
    },
    {
      key: 'k2',
      file: join(root, '.lavish', 'shadcn', 'index.html'),
      url: '',
      status: 'ended' as const,
      endedByUser: true,
      revision: 1,
      pending: 0,
    },
  ];
  assert.deepEqual(listPlans(root, sessions, new Set(['k1'])), [
    {
      file: '.lavish/plan-tab.html',
      title: 'Plan & tab',
      modified: Date.UTC(2026, 0, 1) + 30_000,
      session: { status: 'open', endedByUser: false, revision: 3, pending: 1, listening: true },
    },
    { file: '.lavish/notes.html', title: null, modified: Date.UTC(2026, 0, 1) + 20_000, session: null },
    {
      file: '.lavish/shadcn/index.html',
      title: 'Folder plan',
      modified: Date.UTC(2026, 0, 1) + 10_000,
      session: { status: 'ended', endedByUser: true, revision: 1, pending: 0, listening: false },
    },
  ]);
  assert.ok(isListedPlan(root, '.lavish/notes.html'));
  for (const file of [
    '.lavish/plan-tab.export.html',
    '../.lavish/notes.html',
    '.lavish/shadcn/deeper/too-far/x.html',
    'README.md',
  ]) {
    assert.ok(!isListedPlan(root, file), file);
  }
});

test("Lavish's state file gives the sessions; one it can't read gives none, and another root's aren't listed", async () => {
  const root = planRoot({ 'a.html': { html: '<title>A</title>', at: 1 } });
  const lavish = lavishEnv(fakeBin('24.0.0'), true);
  assert.deepEqual(lavishSessions(lavish), []);
  writeState(lavish, [
    {
      key: 'a1',
      file: join(root, '.lavish', 'a.html'),
      url: 'http://127.0.0.1:1/session/a1',
      status: 'ended',
      ended_by: 'user',
      artifact_revision: 4,
      pending_prompts: 0,
      chat: [],
    },
    { key: 'b1', file: join(temp('other'), '.lavish', 'a.html'), url: 'http://127.0.0.1:1/session/b1', status: 'open' },
    { file: 'no key' },
  ]);
  assert.deepEqual(
    lavishSessions(lavish).map((session) => session.key),
    ['a1', 'b1'],
  );
  const plans = await readPlans(root, lavish);
  assert.deepEqual(
    plans.map((plan) => plan.session),
    [{ status: 'ended', endedByUser: true, revision: 4, pending: 0, listening: false }],
  );
  writeFileSync(join(lavish.env.LAVISH_AXI_STATE_DIR!, 'state.json'), '{ half a fi');
  assert.deepEqual(lavishSessions(lavish), []);
});

test("what lavish-axi printed: the session's URL, a session the reader ended, or its error", () => {
  assert.deepEqual(
    parseOpened(
      'session:\n  file: /x/.lavish/a.html\n  url: "http://127.0.0.1:4387/session/abc123"\n  status: opened\n',
    ),
    { url: 'http://127.0.0.1:4387/session/abc123', key: 'abc123' },
  );
  assert.deepEqual(parseOpened('session:\n  url: "http://127.0.0.1:4387/session/abc"\n  status: user-ended\n'), {
    error: 'This plan was ended in Lavish: reopen it to go on',
  });
  assert.deepEqual(parseOpened('error: File not found: /x/a.html\ncode: NOT_FOUND\n'), {
    error: 'File not found: /x/a.html',
  });
});

test('opening runs the CLI with --no-open in the root, and --reopen only when asked', async () => {
  const root = planRoot({ 'a.html': { html: '<title>A</title>', at: 1 } });
  const log = join(temp('log'), 'args');
  const bin = fakeBin('24.0.0', {
    npx: `echo "$PWD $LAVISH_AXI_NO_OPEN $*" >> ${log}; echo 'session:'; echo '  url: "http://127.0.0.1:4387/session/k9"'`,
  });
  const lavish = lavishEnv(bin, true);
  assert.deepEqual(await openLavish(root, '.lavish/a.html', false, lavish), {
    url: 'http://127.0.0.1:4387/session/k9',
    key: 'k9',
  });
  await openLavish(root, '.lavish/a.html', true, lavish);
  const { readFileSync, realpathSync } = await import('node:fs');
  assert.deepEqual(readFileSync(log, 'utf8').trim().split('\n'), [
    `${realpathSync(root)} 1 -y lavish-axi .lavish/a.html --no-open`,
    `${realpathSync(root)} 1 -y lavish-axi .lavish/a.html --no-open --reopen`,
  ]);
});

test('the proxy forwards only what a session page loads, and only for sessions it admitted', () => {
  assert.equal(pathKey('/chrome.css'), '');
  assert.equal(pathKey('/design/lavish.css'), '');
  assert.equal(pathKey('/session/abc'), 'abc');
  assert.equal(pathKey('/artifact/abc/index.html'), 'abc');
  assert.equal(pathKey('/api/abc/prompts'), 'abc');
  assert.equal(pathKey('/events/abc'), 'abc');
  for (const path of ['/', '/health', '/shutdown', '/api/poll', '/api/sessions', '/api/end', '/state.json']) {
    assert.equal(pathKey(path), null, path);
  }
  assert.equal(
    frameablePolicy("frame-ancestors 'none'; default-src 'self'", 5326),
    "default-src 'self'; frame-ancestors http://127.0.0.1:5326 http://localhost:5326",
  );
  assert.deepEqual(
    upstreamHeaders(
      {
        host: '127.0.0.1:7000',
        origin: 'http://127.0.0.1:7000',
        referer: 'http://127.0.0.1:7000/session/a',
        'x-forwarded-host': 'evil',
      },
      'http://127.0.0.1:7000',
      'http://127.0.0.1:4387',
    ),
    { host: '127.0.0.1:4387', origin: 'http://127.0.0.1:4387', referer: 'http://127.0.0.1:4387/session/a' },
  );
});

/** A stand-in for Lavish's server: a loopback Host and its own Origin only, a session page that refuses framing, and a WebSocket. */
async function fakeLavish(): Promise<{ origin: string; seen: { path: string; origin?: string }[] }> {
  const seen: { path: string; origin?: string }[] = [];
  let origin = '';
  const server: Server = createServer((req, res) => {
    seen.push({ path: req.url!, origin: req.headers.origin });
    if (req.headers.host !== new URL(origin).host) return void res.writeHead(403).end('forbidden host');
    if (req.headers.origin && req.headers.origin !== origin) return void res.writeHead(403).end('cross-origin');
    if (req.url === '/session/k1') {
      res.writeHead(200, { 'x-frame-options': 'DENY', 'content-security-policy': "frame-ancestors 'none'" });
      return void res.end('<html>lavish</html>');
    }
    if (req.url === '/artifact/k1')
      return void res.writeHead(302, { location: origin + '/artifact/k1/index.html' }).end();
    res.writeHead(200).end('ok ' + req.url);
  });
  server.on('upgrade', (req, socket) => {
    if (req.headers.origin !== origin || req.headers.host !== new URL(origin).host)
      return void socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
    const accept = createHash('sha1')
      .update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
      .digest('base64');
    socket.write(
      `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`,
    );
    socket.write(Buffer.from([0x81, 5, ...Buffer.from('hello')]));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
  closers.push(() => server.close());
  return { origin, seen };
}

test("the proxy shows Lavish's page to this viewer's frame: its Host and Origin, a framing guard for the viewer only", async () => {
  const lavish = await fakeLavish();
  const proxy = await startPlanProxy(5326);
  closers.push(proxy.close);
  assert.equal((await fetch(proxy.origin + '/session/k1')).status, 404, 'not admitted yet');
  proxy.admit('k1', lavish.origin);

  const page = await fetch(proxy.origin + '/session/k1');
  assert.equal(await page.text(), '<html>lavish</html>');
  assert.equal(page.headers.get('x-frame-options'), null);
  assert.equal(
    page.headers.get('content-security-policy'),
    'frame-ancestors http://127.0.0.1:5326 http://localhost:5326',
  );

  const post = await fetch(proxy.origin + '/api/k1/prompts', {
    method: 'POST',
    headers: { origin: proxy.origin },
    body: '{}',
  });
  assert.equal(await post.text(), 'ok /api/k1/prompts');
  assert.equal(lavish.seen.at(-1)!.origin, lavish.origin);

  const redirect = await fetch(proxy.origin + '/artifact/k1', { redirect: 'manual' });
  assert.equal(redirect.headers.get('location'), proxy.origin + '/artifact/k1/index.html');

  assert.equal((await fetch(proxy.origin + '/session/k2')).status, 404, "another repository's session");
  assert.equal((await fetch(proxy.origin + '/api/poll', { method: 'POST' })).status, 404, "the agent's endpoint");
  const rebound = await fetch(proxy.origin + '/session/k1', { headers: { host: 'evil.example:80' } });
  assert.equal(rebound.status, 403);

  const message = await new Promise<string>((resolve, reject) => {
    const socket = new WebSocket(proxy.origin.replace('http', 'ws') + '/events/k1', {
      headers: { origin: proxy.origin },
    } as unknown as string[]);
    socket.onmessage = (event) => {
      resolve(String(event.data));
      socket.close();
    };
    socket.onerror = () => reject(new Error('the socket failed'));
  });
  assert.equal(message, 'hello');
});

test('the routes list the plans and open one into the proxy; a file that is no plan is refused', async () => {
  const lavishServer = await fakeLavish();
  const root = planRoot({ 'a.html': { html: '<title>A</title>', at: 1 } });
  const bin = fakeBin('24.0.0', { npx: `echo '  url: "${lavishServer.origin}/session/k1"'` });
  const lavish = lavishEnv(bin, true);
  const proxy = await startPlanProxy(5326);
  closers.push(proxy.close);
  const router = createPlanRoutes(() => root, proxy, lavish);
  const server = createServer((req, res) => void router.handle(req, res, new URL(req.url!, 'http://localhost')));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  closers.push(() => server.close());
  const base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;

  const list = await (await fetch(base + '/api/plans')).json();
  assert.equal(list.setup.cli, 'npx');
  assert.deepEqual(
    list.plans.map((plan: { file: string }) => plan.file),
    ['.lavish/a.html'],
  );
  assert.match(list.stamp, /^[0-9a-f]{16}$/);

  const post = (file: string) => fetch(base + '/api/plans/open', { method: 'POST', body: JSON.stringify({ file }) });
  const opened = await (await post('.lavish/a.html')).json();
  assert.deepEqual(opened, { url: proxy.origin + '/session/k1' });
  assert.equal(await (await fetch(opened.url)).text(), '<html>lavish</html>');
  for (const file of ['../a.html', 'README.md', '.lavish/missing.html'])
    assert.equal((await post(file)).status, 404, file);
});

test("the Plan tab is on unless the config or the reader's switch turns it off, and the switch wins", async () => {
  const { planTabOn, writeSettings } = await import('../src/cli-app/summary/settings.ts');
  const { DEFAULT_CONFIG } = await import('../src/cli-app/config.ts');
  const root = temp('root');
  assert.equal(planTabOn(root, DEFAULT_CONFIG), true);
  assert.equal(planTabOn(root, { ...DEFAULT_CONFIG, planTab: true }), true);
  writeSettings(root, { planTab: false });
  assert.equal(planTabOn(root, { ...DEFAULT_CONFIG, planTab: true }), false);
});

test("a node that gives no version (bun's own, first on the PATH under `bun --bun run`) is passed over", () => {
  const shim = fakeBin(null, { node: 'true' });
  const old = fakeBin('18.19.0');
  const real = fakeBin('24.11.1', { npx: 'true' });
  const lavish = lavishEnv(shim, true);
  lavish.env.PATH = [shim, old, real].join(':');
  assert.deepEqual(lavishSetup(temp('root'), lavish), {
    skill: '~/.claude/skills/lavish',
    node: '24.11.1',
    nodeNeeded: 22,
    cli: 'npx',
  });
  // with only an old one, it's the one named
  lavish.env.PATH = [shim, old].join(':');
  assert.equal(lavishSetup(temp('root'), lavish).node, '18.19.0');
});

test('closing runs `lavish-axi end` on the plan, and fails with what Lavish said when it ends nothing', async () => {
  const { endLavish } = await import('../src/cli-app/plan/lavish.ts');
  const root = planRoot({ 'a.html': { html: '<title>A</title>', at: 1 } });
  const log = join(temp('log'), 'args');
  const ends = fakeBin('24.0.0', { npx: `echo "$*" >> ${log}; echo 'session:'; echo '  status: ended'` });
  await endLavish(root, '.lavish/a.html', lavishEnv(ends, true));
  const { readFileSync } = await import('node:fs');
  assert.equal(readFileSync(log, 'utf8').trim(), '-y lavish-axi end .lavish/a.html');
  const fails = fakeBin('24.0.0', { npx: `echo 'error: No session for that file'` });
  // another root: the setup found is held per root
  const other = planRoot({ 'a.html': { html: '<title>A</title>', at: 1 } });
  await assert.rejects(endLavish(other, '.lavish/a.html', lavishEnv(fails, true)), /No session for that file/);
});
