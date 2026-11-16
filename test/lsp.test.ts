// TypeScript on the viewer server (src/cli-app/lsp/): the real `tsc --lsp` of lens's own
// TypeScript 7, asked through the routes the viewer calls, on a real temp repository.

import { afterAll, beforeAll, test } from 'bun:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CodePlace, LspDefinitionResponse, LspHoverResponse } from '../src/cli-app/api/contract.ts';
import { findTsc } from '../src/cli-app/lsp/find.ts';
import { createLspRoutes, type LspRoutes } from '../src/cli-app/lsp/routes.ts';
import { hoverInfo } from '../src/cli-app/lsp/service.ts';
import type { ViewerInput } from '../src/cli-app/render/web/server.ts';

const LIB = '/** Says hello. */\nexport function greet(name: string): string {\n  return "hi " + name;\n}\n';
const MAIN = 'import { greet } from "./lib";\n\nexport const message = greet("you");\n';

let dir = '';
let input: ViewerInput;
let routes: LspRoutes;
let server: Server;
let base = '';

beforeAll(async () => {
  dir = realpathSync.native(mkdtempSync(join(tmpdir(), 'lens-lsp-')));
  writeFileSync(join(dir, 'lib.ts'), LIB);
  writeFileSync(join(dir, 'main.ts'), MAIN);
  writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({ compilerOptions: { strict: true } }));
  input = {
    root: dir,
    cwd: dir,
    typescriptLsp: true,
    files: [
      { file: 'main.ts', language: 'typescript', source: MAIN },
      { file: 'notes.md', language: null, source: '' },
    ],
  } as unknown as ViewerInput;
  routes = createLspRoutes(
    () => input,
    () => 'github-light',
  );
  server = createServer((req, res) => void routes.router.handle(req, res, new URL(req.url ?? '/', 'http://x')));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
});

afterAll(() => {
  routes.stop();
  server.close();
});

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(base + path, { method: 'POST', body: JSON.stringify(body) });
  return (await response.json()) as T;
}

const GREET: CodePlace = { file: 'main.ts', line: 3, character: MAIN.split('\n')[2].indexOf('greet') };

test('lens finds its own TypeScript 7', () => {
  assert.ok(findTsc(), 'the checkout has typescript@7 installed');
});

test("a name's hover is its declaration and its doc", async () => {
  const answer = await post<LspHoverResponse>('/api/lsp/hover', GREET);
  assert.equal(answer.unavailable, null);
  assert.match(answer.hover!.code, /function greet\(name: string\): string/);
  assert.equal(answer.hover!.doc, 'Says hello.');
  assert.equal(
    answer.tokens!.map((line) => line.map(([text]) => text).join('')).join('\n'),
    answer.hover!.code,
    'its code highlighted, token for character',
  );
  assert.ok(
    answer.tokens!.flat().some(([, color]) => color !== null),
    'in colors',
  );
});

test("the status bar's state: running once asked, with its version", async () => {
  assert.deepEqual(routes.status(), { state: 'running', version: findTsc()!.version });
});

test('its definition is the line it is declared on, relative to the cwd', async () => {
  const answer = await post<LspDefinitionResponse>('/api/lsp/definition', GREET);
  assert.deepEqual(answer, { places: [{ file: 'lib.ts', line: 2, character: 16 }], unavailable: null });
});

test("what can't be asked about says why, and asks nothing", async () => {
  const notTs = await post<LspHoverResponse>('/api/lsp/hover', { ...GREET, file: 'notes.md' });
  assert.match(notTs.unavailable!, /not a TypeScript or JavaScript file/);
  const notShown = await post<LspHoverResponse>('/api/lsp/hover', { ...GREET, file: 'lib.ts' });
  assert.match(notShown.unavailable!, /not a TypeScript or JavaScript file/);

  // the code shown isn't the file on disk: its types would be another file's
  input = { ...input, files: [{ ...input.files[0], source: MAIN + '// more\n' }] };
  const moved = await post<LspHoverResponse>('/api/lsp/hover', GREET);
  assert.deepEqual(moved, {
    hover: null,
    tokens: null,
    unavailable: "the file on disk isn't the code shown (another branch, or changed since: ↻)",
  });

  input = { ...input, typescriptLsp: false };
  const off = await post<LspDefinitionResponse>('/api/lsp/definition', GREET);
  assert.deepEqual(off.places, []);
  assert.match(off.unavailable!, /TypeScript is off/);
  assert.equal(routes.status(), null, 'nothing to show while off');
});

test('a bad place is a 400 with the reason', async () => {
  const response = await fetch(base + '/api/lsp/hover', {
    method: 'POST',
    body: JSON.stringify({ file: 'main.ts', line: 0, character: 0 }),
  });
  assert.equal(response.status, 400);
});

test('hoverInfo splits the markdown TypeScript sends into code and doc', () => {
  assert.deepEqual(hoverInfo({ contents: { kind: 'markdown', value: '```typescript\nconst a: 1\n```\nThe one.' } }), {
    code: 'const a: 1',
    doc: 'The one.',
  });
  assert.deepEqual(hoverInfo({ contents: { kind: 'markdown', value: 'only words' } }), { code: '', doc: 'only words' });
  assert.equal(hoverInfo(null), null);
  assert.equal(hoverInfo({ contents: { kind: 'markdown', value: '' } }), null);
});
