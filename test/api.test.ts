// The server's API contract (src/cli-app/api/): the server serves every route of it, the viewer
// calls no path outside it, and the router answers as the routes expect.

import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { mkdtempSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { API_ROUTES, type ApiRoute } from '../src/cli-app/api/contract.ts';
import { createRouter, HttpError, noBody, type Router } from '../src/cli-app/api/router.ts';

const CLI = fileURLToPath(new URL('../src/cli-app/cli.ts', import.meta.url));
const VIEWER = fileURLToPath(new URL('../src/viewer', import.meta.url));

function makeRepo(): string {
  const dir = realpathSync.native(mkdtempSync(join(tmpdir(), 'lens-api-')));
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, stdio: 'pipe' });
  git('init', '-q');
  writeFileSync(join(dir, 'a.ts'), 'export const a = 1;\n');
  git('add', '-A');
  git('-c', 'user.email=lens@test', '-c', 'user.name=lens', 'commit', '-q', '-m', 'base');
  writeFileSync(join(dir, 'a.ts'), 'export const a = 2;\n');
  return dir;
}

/** Runs `lens diff --no-open` in `dir` until it says its port. */
function startLens(dir: string): Promise<{ port: number; exited: Promise<void> }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI, 'diff', '--no-open'], { cwd: dir });
    const exited = new Promise<void>((done) => child.on('exit', () => done()));
    let output = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('lens never said its port:\n' + output));
    }, 20_000);
    const read = (chunk: Buffer) => {
      output += chunk;
      const ready = /lens viewer on http:\/\/127\.0\.0\.1:(\d+)\//.exec(output);
      if (ready) {
        clearTimeout(timer);
        resolve({ port: Number(ready[1]), exited });
      }
    };
    child.stdout.on('data', read);
    child.stderr.on('data', read);
  });
}

test('the server serves every route of the contract', async () => {
  const { port, exited } = await startLens(makeRepo());
  const routes = (Object.keys(API_ROUTES) as ApiRoute[]).sort(
    // ⏻ last: it stops the server
    (a, b) => Number(a === 'POST /api/shutdown') - Number(b === 'POST /api/shutdown'),
  );
  for (const route of routes) {
    const [method, path] = route.split(' ');
    const response = await fetch(`http://127.0.0.1:${port}${path.replace(':id', 'x')}`, {
      method,
      ...(method === 'POST' && route !== 'POST /api/shutdown' && { body: '{}' }),
    });
    const answer = await response.json();
    assert.notEqual(answer?.error, 'not found', route + ' is not served');
  }
  await exited;
}, 30_000);

/** Every `/api/…` path written in a file of the viewer: a string literal, or a contract route's path. */
function viewerPaths(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return viewerPaths(path);
    if (!/\.tsx?$/.test(name)) return [];
    const source = readFileSync(path, 'utf8');
    return [...source.matchAll(/['"`](?:[A-Z]+ )?(\/api\/[^'"`?]*)/g)].map((found) => found[1]);
  });
}

test('the viewer calls no path outside the contract', () => {
  const contract = new Set(Object.keys(API_ROUTES).map((route) => route.split(' ')[1]));
  const paths = viewerPaths(VIEWER);
  assert.ok(paths.length > 10, 'the viewer calls the server: ' + paths.length + ' paths found');
  const strays = paths.filter((path) => !contract.has(path));
  assert.deepEqual(strays, [], 'paths the contract (src/cli-app/api/contract.ts) does not have');
});

async function serve(router: Router): Promise<{ url: string; server: Server }> {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    try {
      if (!(await router.handle(req, res, url))) res.writeHead(404).end('{"error":"not found"}');
    } catch (error) {
      res.writeHead(500).end(JSON.stringify({ error: (error as Error).message }));
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, server };
}

test('the router: params, bodies, and the reasons it answers with', async () => {
  const seen: string[] = [];
  const { url, server } = await serve(
    createRouter()
      .json('DELETE /api/notes/:id', noBody, (_, { params }) => {
        seen.push(params.id);
        return { notes: [] };
      })
      .json(
        'POST /api/marks',
        (raw) =>
          raw && typeof raw === 'object' && 'key' in raw
            ? { list: 'files', key: 'a@1', on: true }
            : { error: 'not a mark' },
        () => ({ ok: true }),
      )
      .json('GET /api/stamp', noBody, () => {
        throw new HttpError(409, 'busy');
      })
      .raw('GET /api/preview/*', ({ res, params }) => {
        res.end(params['*']);
      }),
  );
  try {
    assert.equal((await fetch(url + '/api/notes/a%2Fb', { method: 'DELETE' })).status, 200);
    assert.deepEqual(seen, ['a/b'], 'a param is decoded');
    assert.equal(
      (await fetch(url + '/api/notes/', { method: 'DELETE' })).status,
      404,
      'an empty param matches nothing',
    );
    assert.equal(
      (await fetch(url + '/api/notes/x', { method: 'POST' })).status,
      404,
      'the method is part of the route',
    );

    const post = (body: string) => fetch(url + '/api/marks', { method: 'POST', body });
    assert.deepEqual(await (await post('nope')).json(), { error: 'not JSON' });
    assert.deepEqual(await (await post('{}')).json(), { error: 'not a mark' });
    assert.deepEqual(await (await post('{"key":1}')).json(), { ok: true });

    const busy = await fetch(url + '/api/stamp');
    assert.equal(busy.status, 409);
    assert.deepEqual(await busy.json(), { error: 'busy' });

    assert.equal(await (await fetch(url + '/api/preview/a/b.html')).text(), 'a/b.html', '* is the rest of the path');
  } finally {
    server.close();
  }
});
