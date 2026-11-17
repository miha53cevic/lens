// Which folder of src/ may import which: ui/ is what the pages share and knows neither of them,
// the viewer and the desktop app know ui/ and not each other's pages, and the command knows none.

import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { relPath } from '../src/cli-app/paths.ts';

const SRC = join(import.meta.dirname, '..', 'src');

/** What each folder may import from, besides itself and packages. */
const MAY_IMPORT: Record<string, string[]> = {
  'cli-app': [],
  ui: [],
  viewer: ['ui', 'cli-app'],
  desktop: ['ui', 'cli-app'],
};

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(?:tsx?|css)$/.test(name) ? [path] : [];
  });
}

/** The imports that cross into a folder theirs may not use, as `file → folder` lines. */
function crossings(folder: string): string[] {
  const found = new Set<string>();
  for (const file of sources(join(SRC, folder))) {
    const source = readFileSync(file, 'utf8');
    for (const [, specifier] of source.matchAll(/(?:from|import)\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g)) {
      const target = relPath(SRC, resolve(dirname(file), specifier)).split('/')[0];
      // a file outside src/ (lens.defaults.json, package.json) is no folder's code
      if (target === '..') continue;
      if (target !== folder && !MAY_IMPORT[folder].includes(target)) found.add(`${relPath(SRC, file)} → ${target}`);
    }
  }
  return [...found];
}

test('every folder of src/ has its rule', () => {
  assert.deepEqual(
    readdirSync(SRC)
      .filter((name) => statSync(join(SRC, name)).isDirectory())
      .sort(),
    Object.keys(MAY_IMPORT).sort(),
  );
});

for (const folder of Object.keys(MAY_IMPORT)) {
  test(`src/${folder} imports only what it may: ${MAY_IMPORT[folder].join(', ') || 'nothing of the others'}`, () => {
    assert.deepEqual(crossings(folder), []);
  });
}

// Agent runners (src/cli-app/agents/): only that folder knows any runner. Everything else goes
// through AgentRunner and sees a runner's id and name as data, so a second runner changes nothing
// outside it. A runner's file is any there but the shared ones.
const AGENTS = join(SRC, 'cli-app', 'agents');
const SHARED_AGENT_FILES = ['index.ts', 'run.ts', 'types.ts'];

test("only src/cli-app/agents/ knows a runner: no import of a runner's file, and no name of one, outside it", () => {
  const runnerFiles = readdirSync(AGENTS).filter((name) => !SHARED_AGENT_FILES.includes(name));
  const runnerIds = runnerFiles.map((name) => name.replace(/\.ts$/, ''));
  const found: string[] = [];
  for (const file of sources(SRC)) {
    if (file.startsWith(AGENTS)) continue;
    const where = relPath(SRC, file);
    const source = readFileSync(file, 'utf8');
    for (const [, specifier] of source.matchAll(/(?:from|import)\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g)) {
      const target = resolve(dirname(file), specifier);
      if (dirname(target) === AGENTS && runnerFiles.includes(target.slice(AGENTS.length + 1)))
        found.push(`${where} imports ${specifier}`);
    }
    // a folder an agent reads (`.claude/skills`) is a path, not the runner
    const text = source.replace(/['"`]\.\w+['"`]|\.\w+\//g, '');
    for (const id of runnerIds) if (new RegExp(id, 'i').test(text)) found.push(`${where} names ${id}`);
  }
  assert.deepEqual(found, []);
});
