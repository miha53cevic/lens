// The code rules of CLAUDE.md that a reading of the sources can hold: each test names the rule it
// keeps. What layers.test.ts (which folder imports which) and tokens.test.ts (the design scales)
// hold isn't repeated here.

import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { relPath } from '../src/cli-app/paths.ts';
import { KEY_TABS } from '../src/viewer/components/KeysDialog/const.ts';

const ROOT = join(import.meta.dirname, '..');
const SRC = join(ROOT, 'src');

/** The files under a folder of src/ whose names match, as paths from the checkout's root. */
function files(folder: string, name = /\.tsx?$/): string[] {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((entry) => {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) return walk(path);
      return name.test(entry) ? [relPath(ROOT, path)] : [];
    });
  return walk(join(SRC, folder));
}

const read = (file: string) => readFileSync(join(ROOT, file), 'utf8');

/** The code of the pages: the viewer, the primitives, and the app's own pages (not its main process) */
const PAGES = [
  ...files('viewer'),
  ...files('ui'),
  ...files('desktop').filter((file) => !file.startsWith('src/desktop/main/')),
];

/** `file:line` for each line of the files that matches, and isn't let off */
function lines(paths: string[], pattern: RegExp, exempt = (_line: string, _file: string) => false): string[] {
  return paths.flatMap((file) =>
    read(file)
      .split('\n')
      .flatMap((line, at) => (pattern.test(line) && !exempt(line, file) ? [`${file}:${at + 1}`] : [])),
  );
}

// "Fetch with `api`, `request` or `reach`, never bare `fetch`: they notice a server that stopped.
// The one exception is the shutdown call."
test('the pages reach the server through actions/status.ts, never with a bare fetch', () => {
  const bare = lines(
    PAGES,
    /(?<![\w.])fetch\(/,
    (line, file) => file === 'src/viewer/actions/status.ts' || line.includes("fetch('/api/shutdown'"),
  );
  assert.deepEqual(bare, [], 'call api / request / reach (src/viewer/actions/status.ts) instead');
});

// "Avoid useEffect and useLayoutEffect ... when none of those fit, use an effect and say why in a comment."
test('an effect says why it is one, in a comment right above it', () => {
  const unexplained = PAGES.flatMap((file) => {
    const source = read(file).split('\n');
    return source.flatMap((line, at) =>
      /\buse(Layout)?Effect\(/.test(line) && !/^\s*(\/\/|\*|\/\*)/.test(source[at - 1] ?? '')
        ? [`${file}:${at + 1}`]
        : [],
    );
  });
  assert.deepEqual(unexplained, [], 'put the work in an action, a handler, a key or a ref callback, or say why not');
});

// "Paths that lens shows, matches config patterns against, or uses in unit ids are always
// `/`-separated ... Build them with `relPath` / `toPosix`, never with `path.relative`."
test('only paths.ts takes relative paths from node:path; the rest use relPath', () => {
  const cli = files('cli-app');
  const pathImports = cli.flatMap((file) =>
    [...read(file).matchAll(/import\s+(.+?)\s+from\s+['"](?:node:)?path['"]/gs)].map((found) => ({
      file,
      what: found[1],
    })),
  );
  const wholeModule = pathImports.filter(({ what }) => !what.trim().startsWith('{')).map(({ file }) => file);
  assert.deepEqual(wholeModule, [], "import node:path's functions by name, so relative can't come in unseen");
  const relative = pathImports.filter(({ file, what }) => /\brelative\b/.test(what) && file !== 'src/cli-app/paths.ts');
  assert.deepEqual(
    relative.map(({ file }) => file),
    [],
    'use relPath / toPosix (src/cli-app/paths.ts)',
  );
});

// "A component that is one file is `ComponentName.tsx`. Never wrap it in a folder that only holds an `index.tsx`."
test('no component folder holds only its index.tsx', () => {
  const folders = [...files('viewer'), ...files('desktop'), ...files('ui')]
    .filter((file) => file.endsWith('/index.tsx'))
    .map((file) => file.slice(0, -'/index.tsx'.length))
    .filter((folder) => readdirSync(join(ROOT, folder)).filter((entry) => !entry.endsWith('.css')).length === 1);
  assert.deepEqual(folders, [], 'make each ComponentName.tsx, next to its stylesheet');
});

// "Around 150 lines is a soft ceiling: past that, split the file by concern into a folder."
// A soft one, so this says which are past it and fails nothing.
test('components past the soft ceiling are named (not failed)', () => {
  const CEILING = 200;
  const long = [...files('viewer'), ...files('desktop'), ...files('ui')]
    .filter((file) => file.endsWith('.tsx'))
    .map((file) => ({ file, count: read(file).split('\n').length }))
    .filter(({ count }) => count > CEILING);
  for (const { file, count } of long) console.warn(`${file}: ${count} lines, past the ~150-line ceiling`);
});

// "New keys go in src/viewer/keys.ts (and its SUMMARY_KEYS when they act on a unit), and in the ? help."
test('every shortcut key is in the ? help, and a Summary key is on its Global or Summary tab', () => {
  const source = read('src/viewer/keys.ts');
  const list = (name: string) => {
    const found = new RegExp(`^const ${name} = (\\[.*\\]);$`, 'm').exec(source);
    assert.ok(found, name + ' is in keys.ts');
    return found[1];
  };
  const summaryKeys: string[] = new Function(`return ${list('SUMMARY_KEYS')}`)();
  const shortcutKeys: string[] = new Function('SUMMARY_KEYS', `return ${list('SHORTCUT_KEYS')}`)(summaryKeys);
  const helped = (tabs: string[]) =>
    new Set(KEY_TABS.filter((tab) => tabs.includes(tab.id)).flatMap((tab) => tab.keys.flatMap((row) => row.keys)));
  const anywhere = helped(['global', 'code', 'summary']);
  assert.deepEqual(
    shortcutKeys.filter((key) => !anywhere.has(key)),
    [],
    'a key with no row in KEY_TABS (components/KeysDialog/const.ts)',
  );
  const onSummary = helped(['global', 'summary']);
  assert.deepEqual(
    summaryKeys.filter((key) => !onSummary.has(key)),
    [],
    "a key that works on the Summary tab isn't on its tabs of the help",
  );
});
