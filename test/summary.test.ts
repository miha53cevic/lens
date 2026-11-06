import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  writeFileSync,
  rmSync,
  mkdirSync,
  readFileSync,
  existsSync,
  realpathSync,
  utimesSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Window } from 'happy-dom';
import { parseDiff, uncheckedOutRevision } from '../src/cli-app/git.ts';
import {
  extractUnits,
  checkCoverage,
  citeableLabels,
  removalAnchors,
  type UnitFileInput,
} from '../src/cli-app/summary/units.ts';
import { analyze } from '../src/cli-app/analyze.ts';
import {
  checkoutFirst,
  summaryKey,
  summaryPath,
  readStored,
  writeStored,
  unitSetHash,
  type Bundle,
} from '../src/cli-app/summary/store.ts';
import { runSummary } from '../src/cli-app/summary/command.ts';
import { validateResult } from '../src/cli-app/summary/validate.ts';
import { LIMITS, prepareBundle, renderUnit } from '../src/cli-app/summary/bundle.ts';
import { MAX_USAGES } from '../src/cli-app/summary/usages.ts';
import { loadDiff, collectUnits, commitLog } from '../src/cli-app/summary/collect.ts';
import { buildSummaryView } from '../src/cli-app/summary/view.ts';
import { previewProblems, previewResponse, writeAssets } from '../src/cli-app/summary/previews.ts';
import { buildPreviewsOn, readSettings, writeSettings } from '../src/cli-app/summary/settings.ts';
import { buildProgressReader } from '../src/cli-app/summary/progress.ts';
import { DEFAULT_CONFIG } from '../src/cli-app/config.ts';

/** Builds a unit input from two versions of a file, via a real unified=0 diff. */
function inputFor(file: string, oldSource: string | null, newSource: string | null, isTest = false): UnitFileInput {
  const dir = mkdtempSync(join(tmpdir(), 'lens-units-'));
  try {
    const a = join(dir, 'a'),
      b = join(dir, 'b');
    writeFileSync(a, oldSource ?? '');
    writeFileSync(b, newSource ?? '');
    let out = '';
    try {
      execFileSync('git', ['diff', '--no-index', '--unified=0', '--no-color', a, b], { encoding: 'utf8' });
    } catch (err) {
      out = (err as { stdout: string }).stdout; // exit 1 = files differ
    }
    const header = out.replace(/^--- .*$/m, '--- a/' + file).replace(/^\+\+\+ .*$/m, '+++ b/' + file);
    const parsed = parseDiff(header).files[0];
    return {
      file,
      oldSource,
      newSource,
      changedLines: parsed?.changedLines ?? [],
      removals: parsed?.removals ?? [],
      isTest,
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function unitsFor(input: UnitFileInput) {
  const units = await extractUnits(input);
  assert.deepEqual(checkCoverage(input, units), [], 'every changed/removed line is in exactly one unit');
  return units;
}

const OLD_REPO = `import { db } from "../db";

export async function findOrders(userId: string): Promise<Order[]> {
  const rows = await db.query("SELECT * FROM orders ORDER BY created_at DESC", [userId]);
  return rows.map(toOrder);
}

function toOrder(row: any) {
  return { id: row.id, total: row.total_cents / 100 };
}

function gone() {
  return 1;
}

export class Svc {
  private limit = 10;
  run() { return this.limit; }
}
`;

const NEW_REPO = `import { db } from "../db";
import type { PageOpts } from "./types";

/** Fetches one page. */
export async function findOrders(userId: string, opts: PageOpts = {}): Promise<Order[]> {
  const limit = Math.min(opts.limit ?? 50, 200);
  const rows = await db.query("SELECT * FROM orders ORDER BY id LIMIT $2", [userId, limit]);
  return rows.map(toOrder);
}

function toOrder(row: any) {
  return { id: row.id, total: row.total_cents };
}

export class Svc {
  private limit = 20;
  run() { return this.limit; }
  stop() {}
}

router.get("/orders", async (req, res) => {
  res.json(await findOrders(req.user.id));
});
`;

test('units: functions, methods, class members, top-level calls, deleted functions, module leftovers', async () => {
  const units = await unitsFor(inputFor('src/repo.ts', OLD_REPO, NEW_REPO));
  const byId = new Map(units.map((u) => [u.id, u]));

  const find = byId.get('src/repo.ts#findOrders');
  assert.equal(find?.kind, 'function');
  assert.equal(find?.status, 'modified');
  // the doc comment above belongs to the function
  assert.deepEqual(find?.ranges, [{ start: 4, end: 9 }]);
  assert.ok(find?.changedLines.includes(4));

  assert.equal(byId.get('src/repo.ts#toOrder')?.status, 'modified');
  assert.equal(byId.get('src/repo.ts#gone')?.status, 'deleted');
  assert.deepEqual(byId.get('src/repo.ts#gone')?.ranges, []);
  assert.equal(byId.get('src/repo.ts#Svc.limit')?.kind, 'property');
  assert.equal(byId.get('src/repo.ts#Svc.stop')?.status, 'new');
  assert.equal(byId.get('src/repo.ts#Svc.run'), undefined, 'an untouched method is no unit');
  assert.equal(byId.get('src/repo.ts#router.get("/orders")')?.kind, 'call');
  assert.equal(byId.get('src/repo.ts#(module)')?.kind, 'module'); // the new import
  assert.equal(byId.get('src/repo.ts#(module)')?.importsOnly, true);
});

test('units: a module-level change is imports only while every changed and removed line is an import', async () => {
  const only = await unitsFor(
    inputFor(
      'src/f.ts',
      'import { a } from "./a";\n\nexport const x = a;\n',
      'import {\n  a,\n  b,\n} from "./a";\n\nexport const x = a;\n',
    ),
  );
  assert.equal(only.find((u) => u.name === '(module)')?.importsOnly, true, 'a multi-line import, old line removed');
  const mixed = await unitsFor(
    inputFor(
      'src/f.ts',
      'import { a } from "./a";\n\nexport const x = a;\n',
      'import { a } from "./a";\nif (a) start();\n\nexport const x = a;\n',
    ),
  );
  assert.equal(mixed.find((u) => u.name === '(module)')?.importsOnly, undefined, 'top-level code is no import');
  const comment = await unitsFor(
    inputFor('src/f.ts', 'import { a } from "./a";\n', '// the a we need\nimport { a } from "./a";\n'),
  );
  assert.equal(
    comment.find((u) => u.name === '(module)')?.importsOnly,
    undefined,
    'a comment above an import says something',
  );
});

test('units: TSX components, memo/forwardRef wrappers and hooks', async () => {
  const oldSrc = `export function List({ items }: Props) {
  return <ul>{items.map((i) => <li key={i}>{i}</li>)}</ul>;
}
`;
  const newSrc = `import { memo, forwardRef } from "react";

export const List = memo(function List({ items }: Props) {
  const onClick = () => console.log("x");
  return <ul className="list" onClick={onClick}>{items.map((i) => <li key={i}>{i}</li>)}</ul>;
});

export const Input = forwardRef((props: P, ref) => <input ref={ref} {...props} />);

export function useItems(id: string) {
  return fetch("/items/" + id);
}

const helper = () => 1;
`;
  const units = await unitsFor(inputFor('src/List.tsx', oldSrc, newSrc));
  const byId = new Map(units.map((u) => [u.id, u]));
  assert.equal(byId.get('src/List.tsx#List')?.kind, 'component');
  assert.equal(byId.get('src/List.tsx#List')?.status, 'modified');
  assert.equal(byId.get('src/List.tsx#Input')?.kind, 'component');
  assert.equal(byId.get('src/List.tsx#useItems')?.kind, 'hook');
  assert.equal(byId.get('src/List.tsx#helper')?.kind, 'function');
  // the inline handler belongs to its component, not a unit of its own
  assert.equal(byId.get('src/List.tsx#onClick'), undefined);
});

test('units: capitalized functions in .ts files are not components', async () => {
  const units = await unitsFor(inputFor('src/f.ts', null, 'export function Factory() { return 1; }\n'));
  assert.equal(units[0].kind, 'function');
  assert.equal(units[0].status, 'new');
});

test('units: formatting-only changes are flagged', async () => {
  const units = await unitsFor(
    inputFor('src/f.ts', 'function a(x){return x+1}\n', 'function a(x) {\n  return x + 1\n}\n'),
  );
  assert.equal(units[0].formattingOnly, true);
});

test('units: test files, unsupported files, syntax errors and deleted files are whole-file units', async () => {
  const testUnits = await unitsFor(
    inputFor('src/a.test.ts', "it('a', () => {});\n", "it('a', () => {});\nit('b', () => {});\n", true),
  );
  assert.deepEqual(
    testUnits.map((u) => [u.id, u.kind]),
    [['src/a.test.ts#(file)', 'file']],
  );

  const json = await unitsFor(inputFor('config.json', '{"a":1}\n', '{"a":2}\n'));
  assert.equal(json[0].id, 'config.json#(file)');

  const broken = await unitsFor(inputFor('src/b.ts', 'const a = 1;\n', 'const a = ;\nfunction (\n'));
  assert.equal(broken[0].kind, 'file');

  const deleted = await extractUnits({
    file: 'src/gone.ts',
    oldSource: 'a\nb\n',
    newSource: null,
    changedLines: [],
    removals: [],
    isTest: false,
  });
  assert.equal(deleted[0].status, 'deleted');
  assert.deepEqual(deleted[0].removals, [{ afterLine: 0, oldStart: 1, lines: ['a', 'b', ''] }]);
});

test('units: hashes change with the code; labels are the changed and removed lines', async () => {
  const input = inputFor('src/f.ts', 'function a() {\n  return 1;\n}\n', 'function a() {\n  return 2;\n}\n');
  const [unit] = await unitsFor(input);
  assert.deepEqual([...citeableLabels(unit)].sort(), ['N2', 'O2']);
  const [other] = await unitsFor(
    inputFor('src/f.ts', 'function a() {\n  return 1;\n}\n', 'function a() {\n  return 3;\n}\n'),
  );
  assert.notEqual(unit.hash, other.hash);
  assert.match(renderUnit(unit, input.newSource!), /O2 -   return 1;\n\s+N2 \+   return 2;/);
});

test('units: code holding a fence of its own is fenced with a longer one', async () => {
  const readme = '# a\n\n```sh\nnpm test\n```\n';
  const [unit] = await unitsFor(inputFor('README.md', readme, readme.replace('npm test', 'npm run test')));
  const rendered = renderUnit(unit, readme.replace('npm test', 'npm run test'));
  assert.match(rendered, /\n\n````\n[\s\S]*N4 \+ npm run test\n[\s\S]*\n````\n$/);
});

test('units: a trailing comment stays with its line, not the next declaration', async () => {
  const old = 'const a = 1; // note\nfunction b() {\n  return 1;\n}\n';
  const [b] = await unitsFor(inputFor('src/f.ts', old, old.replace('return 1', 'return 2')));
  assert.equal(b.name, 'b');
  assert.equal(b.ranges[0].start, 2);
});

test('units: a blank line added between declarations is shown with the one it joined', async () => {
  const old = 'function a() {\n  return 1;\n}\nfunction b() {\n  return 2;\n}\n';
  const units = await unitsFor(inputFor('src/f.ts', old, old.replace('}\nfunction b', '}\n\nfunction b')));
  assert.equal(units.length, 1);
  assert.deepEqual(units[0].changedLines, [4]);
  assert.deepEqual(units[0].ranges, [{ start: 4, end: 7 }]);
});

test('units: deleting a function and the blank after it leaves the next one alone', async () => {
  const old = 'function a() {\n  return 1;\n}\n\nfunction b() {\n  return 2;\n}\n\nfunction c() {\n  return 3;\n}\n';
  const units = await unitsFor(inputFor('src/f.ts', old, old.replace('function b() {\n  return 2;\n}\n\n', '')));
  assert.deepEqual(
    units.map((u) => [u.name, u.status]),
    [['b', 'deleted']],
  );
});

test("units: a method's decorator belongs to the method", async () => {
  const old = `export class Orders {\n  @Get("/list")\n  list() {\n    return 1;\n  }\n}\n`;
  const units = await unitsFor(inputFor('src/f.ts', old, old.replace(`@Get("/list")`, `@Get("/all")`)));
  assert.deepEqual(
    units.map((u) => [u.name, u.changedLines]),
    [['Orders.list', [2]]],
  );
});

test('the summary view leaves out deleted files, but keeps a function deleted from a file', async () => {
  const root = mkdtempSync(join(tmpdir(), 'lens-view-'));
  try {
    const units = [
      ...(await unitsFor(inputFor('src/gone.ts', 'export const a = 1;\n', null))),
      ...(await unitsFor(inputFor('src/repo.ts', OLD_REPO, NEW_REPO))),
      ...(await unitsFor(
        inputFor('src/left.ts', 'export function a() {}\n\nexport function b() {}\n', 'export function a() {}\n'),
      )),
    ];
    const view = buildSummaryView({ root, cwd: root, command: 'diff', args: [], units });
    const ids = view.units.map((unit) => unit.id);
    assert.ok(!ids.some((id) => id.startsWith('src/gone.ts')), 'the deleted file');
    assert.ok(ids.includes('src/left.ts#b'), 'a deleted function is still a change to read');
    assert.ok(ids.includes('src/repo.ts#findOrders'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a deleted file opens in the Code view: no lines of its own, its old text one removed block', async () => {
  const dir = realpathSync.native(mkdtempSync(join(tmpdir(), 'lens-deleted-')));
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, stdio: 'pipe' });
  try {
    git('init', '-q');
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src/gone.ts'), 'export function gone() {\n  return 1;\n}\n');
    writeFileSync(join(dir, 'src/kept.ts'), 'export const kept = 1;\n');
    writeFileSync(join(dir, 'yarn.lock'), 'lots\n');
    git('add', '-A');
    git('-c', 'user.email=lens@test', '-c', 'user.name=lens', 'commit', '-q', '-m', 'base');
    git('rm', '-q', 'src/gone.ts', 'yarn.lock');
    writeFileSync(join(dir, 'src/kept.ts'), 'export const kept = 2;\n');
    const input = await analyze('diff', ['HEAD'], dir, { ...DEFAULT_CONFIG, exclude: ['*.lock'] }, false);
    const gone = input.files.find((file) => file.file === 'src/gone.ts')!;
    assert.equal(gone.status, 'deleted');
    assert.equal(gone.lineCount, 0);
    assert.equal(gone.source, '');
    assert.deepEqual(gone.removals, [
      { afterLine: 0, oldStart: 1, lines: ['export function gone() {', '  return 1;', '}'] },
    ]);
    // listed only, as before: what the config excludes
    assert.deepEqual(input.deleted, ['yarn.lock']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the summary view puts each unit in one flow, and files import-only units under Housekeeping', async () => {
  const root = mkdtempSync(join(tmpdir(), 'lens-view-'));
  try {
    const units = await unitsFor(inputFor('src/repo.ts', OLD_REPO, NEW_REPO));
    const key = buildSummaryView({ root, cwd: root, command: 'diff', args: [], units }).key;
    const flows = (stored: { title: string; path: string; units: Record<string, string> }[]) => {
      writeStored(root, key, { version: 1, updatedAt: '', units: {}, flows: stored });
      return buildSummaryView({ root, cwd: root, command: 'diff', args: [], units }).flows.map((f) => [
        f.title,
        Object.keys(f.units).map((id) => id.split('#')[1]),
      ]);
    };
    // an older summary listing findOrders twice: the first flow keeps it
    assert.deepEqual(
      flows([
        { title: 'Paging', path: 'a', units: { 'src/repo.ts#findOrders': 'a', 'src/repo.ts#toOrder': 'b' } },
        {
          title: 'Svc',
          path: 'a',
          units: { 'src/repo.ts#findOrders': 'a', 'src/repo.ts#Svc.limit': 'b', 'src/repo.ts#Svc.stop': 'b' },
        },
      ]),
      [
        ['Paging', ['findOrders', 'toOrder']],
        ['Svc', ['Svc.limit', 'Svc.stop']],
        ['Housekeeping', ['(module)']],
      ],
    );
    // the agent's own Housekeeping takes them in
    assert.deepEqual(
      flows([
        { title: 'Paging', path: 'a', units: { 'src/repo.ts#findOrders': 'a', 'src/repo.ts#toOrder': 'b' } },
        { title: 'Housekeeping', path: '', units: { 'src/repo.ts#gone': '' } },
      ]),
      [
        ['Paging', ['findOrders', 'toOrder']],
        ['Housekeeping', ['gone', '(module)']],
      ],
    );
    assert.deepEqual(flows([]), [['Housekeeping', ['(module)']]], 'no flows yet: Housekeeping all the same');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('readStored tolerates a summary.json without flows, or with a malformed overview', () => {
  const root = mkdtempSync(join(tmpdir(), 'lens-store-'));
  try {
    writeStored(root, 'diff', { version: 1, updatedAt: '', units: {}, flows: [] });
    writeFileSync(summaryPath(root, 'diff'), JSON.stringify({ version: 1, units: {} }));
    assert.deepEqual(readStored(root, 'diff')?.flows, []);
    writeFileSync(summaryPath(root, 'diff'), JSON.stringify({ version: 1, units: {}, overview: { what: 42 } }));
    assert.equal(readStored(root, 'diff')?.overview, undefined);
    writeFileSync(summaryPath(root, 'diff'), JSON.stringify({ version: 1 }));
    assert.equal(readStored(root, 'diff'), null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("readStored leaves out a unit stored without its anchor: its labels can't be placed", () => {
  const root = mkdtempSync(join(tmpdir(), 'lens-store-'));
  try {
    const unit = { headline: 'A', gist: '', needsLook: false, changes: [], breaks: [], concerns: [], hash: 'h' };
    writeStored(root, 'diff', { version: 1, updatedAt: '', units: {}, flows: [] });
    writeFileSync(
      summaryPath(root, 'diff'),
      JSON.stringify({ version: 1, units: { a: unit, b: { ...unit, anchor: { n: 3, o: 0 } } } }),
    );
    assert.deepEqual(Object.keys(readStored(root, 'diff')!.units), ['b']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('submit finds a bundle whose key ends in .json', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lens-submit-'));
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
  const log = console.log;
  console.log = () => {};
  try {
    git('init', '-q', '-b', 'notes.json'); // the key ends in its branch
    writeFileSync(join(dir, 'package.json'), '{}\n');
    git('add', '-A');
    await runSummary(['prepare', '--staged'], dir);
    const bundle = join(dir, '.lens/summary/diff-staged@notes.json');
    writeFileSync(
      join(bundle, 'result.json'),
      JSON.stringify({
        units: {
          'package.json#(file)': {
            headline: 'Adds an empty package.json',
            gist: 'new file',
            needsLook: false,
            changes: [],
            breaks: [],
          },
        },
      }),
    );
    await runSummary(['submit', '.lens/summary/diff-staged@notes.json'], dir);
    assert.ok(readStored(dir, 'diff-staged@notes.json')?.units['package.json#(file)']);
  } finally {
    console.log = log;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a submit that asks for fixes keeps the run shown until one that asks for nothing, or the agent goes quiet', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lens-submit-'));
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
  const log = console.log;
  console.log = () => {};
  try {
    git('init', '-q', '-b', 'main');
    writeFileSync(join(dir, 'package.json'), '{}\n');
    git('add', '-A');
    await runSummary(['prepare', '--staged'], dir);
    const key = 'diff-staged@main';
    const folder = join(dir, '.lens/summary', key);
    const read = buildProgressReader(dir, key);
    const unit = {
      headline: 'Adds an empty package.json',
      gist: 'new file',
      needsLook: false,
      changes: [],
      breaks: [],
    };
    const overview = { what: 'Adds a package.json.' };
    // the unit and the overview are in, so nothing on disk is missing, but a flow was rejected
    writeFileSync(
      join(folder, 'result.json'),
      JSON.stringify({ units: { 'package.json#(file)': unit }, overview, flows: [{ title: 'x' }] }),
    );
    await runSummary(['submit', folder], dir);
    assert.equal(read()?.stage, 'fixes', 'the agent was told to fix and submit again');

    // no write for minutes after it: the agent left the fixes, and the run is over
    const before = (Date.now() - 4 * 60 * 1000) / 1000;
    for (const name of ['bundle.json', 'summary.json', 'submit.json']) utimesSync(join(folder, name), before, before);
    assert.equal(buildProgressReader(dir, key)(), null, 'fixes left: done');

    writeFileSync(join(folder, 'result.json'), JSON.stringify({ units: {}, overview }));
    await runSummary(['submit', folder], dir);
    assert.equal(read(), null, 'a clean submit: done');
  } finally {
    console.log = log;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('summaryKey is readable and filesystem-safe', () => {
  assert.equal(summaryKey('diff', []), 'diff');
  assert.equal(summaryKey('diff', ['--staged']), 'diff-staged');
  assert.equal(summaryKey('pr', ['87']), 'pr-87');
  assert.equal(summaryKey('pr', ['https://github.com/o/r/pull/87/files']), 'pr-87', 'URL and number share a key');
  assert.equal(summaryKey('diff', ['main...feature/x']), 'diff-main...feature-x');
  assert.ok(summaryKey('diff', ['a'.repeat(100)]).length <= 60);
  assert.equal(summaryKey('diff', ['main'], 'features/x'), 'diff-main@features-x', 'a diff names its branch');
  assert.equal(summaryKey('diff', [], 'main'), 'diff@main');
  assert.equal(summaryKey('pr', ['87'], 'main'), 'pr-87', 'a PR is the same on any branch');
  assert.notEqual(summaryKey('diff', ['a'.repeat(100)], 'x'), summaryKey('diff', ['a'.repeat(100)], 'y'));
});

function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'lens-validate-'));
  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(
    join(root, 'src/jobs.ts'),
    "import { findOrders } from './repo';\nconst o = await findOrders(u);\nconsole.log(o);\n",
  );
  return root;
}

const BUNDLE: Bundle = {
  version: 1,
  key: 'diff-staged',
  command: 'diff',
  args: ['--staged'],
  createdAt: '',
  units: [
    {
      id: 'src/repo.ts#findOrders',
      file: 'src/repo.ts',
      name: 'findOrders',
      kind: 'function',
      status: 'modified',
      hash: 'h1',
      anchor: { n: 1, o: 1 },
      labels: ['N5', 'N6', 'O4'],
      ranges: [{ start: 3, end: 9 }],
      done: false,
    },
    {
      id: 'src/repo.ts#toOrder',
      file: 'src/repo.ts',
      name: 'toOrder',
      kind: 'function',
      status: 'modified',
      hash: 'h2',
      anchor: { n: 1, o: 1 },
      labels: ['N11'],
      ranges: [],
      done: false,
    },
    {
      id: 'src/repo.ts#fetchAll',
      file: 'src/repo.ts',
      name: 'fetchAll',
      kind: 'function',
      status: 'new',
      hash: 'h3',
      anchor: { n: 1, o: 1 },
      labels: ['N20'],
      ranges: [],
      done: false,
    },
    {
      id: 'src/repo.ts#getAll',
      file: 'src/repo.ts',
      name: 'getAll',
      kind: 'function',
      status: 'deleted',
      hash: 'h4',
      anchor: { n: 1, o: 1 },
      labels: ['O30'],
      ranges: [],
      done: false,
    },
  ],
};

const ok = (extra: object = {}) => ({
  headline: 'Does a thing',
  gist: 'does it',
  needsLook: false,
  changes: [],
  breaks: [],
  ...extra,
});

test('validate: accepts grounded claims and drops the rest with reasons', () => {
  const root = fixtureRoot();
  try {
    const out = validateResult(
      BUNDLE,
      {
        units: {
          'src/repo.ts#findOrders': ok({
            needsLook: true,
            changes: [
              { when: 'Called without a limit', before: 'all orders', now: 'first 50', line: 'N5' },
              { when: 'Removed path', before: 'x', now: 'y', line: 'o4' }, // case-insensitive label
              { when: 'Context line', before: null, now: 'y', line: 'N9' },
              { when: 'x'.repeat(70), before: null, now: 'y', line: 'N5' },
            ],
            breaks: [
              {
                summary: 'caller gets 50',
                callers: ['src/jobs.ts:2', 'src/jobs.ts:3', 'src/nope.ts:1', '../etc/passwd:1'],
              },
              { summary: 'all bad', callers: ['src/jobs.ts:99'] },
            ],
          }),
          'src/repo.ts#toOrder': ok({ headline: 'h'.repeat(81) }),
          'src/repo.ts#fetchAll': ok({ renamedFrom: 'src/repo.ts#getAll' }),
          'src/other.ts#x': ok(),
        },
        flows: [
          {
            title: 'Paging',
            path: 'repo → jobs',
            units: { 'src/repo.ts#findOrders': 'repo', 'src/repo.ts#fetchAll': 'repo' },
          },
          { title: 'Solo', path: 'x', units: { 'src/repo.ts#findOrders': 'repo' } },
        ],
      },
      root,
      null,
    );

    assert.deepEqual(out.accepted, ['src/repo.ts#findOrders', 'src/repo.ts#fetchAll']);
    const find = out.stored.units['src/repo.ts#findOrders'];
    assert.equal(find.hash, 'h1');
    assert.deepEqual(
      find.changes.map((c) => c.line),
      ['N5', 'O4'],
    );
    assert.deepEqual(find.breaks, [{ summary: 'caller gets 50', callers: ['src/jobs.ts:2'] }]);
    assert.equal(out.stored.units['src/repo.ts#fetchAll'].renamedFrom, 'src/repo.ts#getAll');
    assert.deepEqual(
      out.stored.flows.map((f) => f.title),
      ['Paging'],
    );

    const reasons = out.dropped.join('\n');
    assert.match(reasons, /changes\[2\]: line "N9" is not a changed or removed line/);
    assert.match(reasons, /changes\[3\]: when\/now must be 1–60 chars/);
    assert.match(reasons, /"src\/jobs.ts:3" — that line doesn't mention findOrders/);
    assert.match(reasons, /"src\/nope.ts:1" — file not found/);
    assert.match(reasons, /"\.\.\/etc\/passwd:1" must be a path relative to the repository root/);
    assert.match(reasons, /breaks\[1\]: no valid callers left/);
    assert.match(reasons, /toOrder: headline 81 chars, max 80 — unit dropped/);
    assert.match(reasons, /src\/other.ts#x: unknown unit id/);
    assert.match(
      reasons,
      /flows\[1\] "Solo": src\/repo.ts#findOrders is already in "Paging" — a unit goes in one flow/,
    );
    assert.match(reasons, /flows\[1\] "Solo": a flow needs 2\+ known units/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('validate: callers are stored trimmed; over-long flow layers are reported', () => {
  const root = fixtureRoot();
  try {
    const out = validateResult(
      BUNDLE,
      {
        units: { 'src/repo.ts#findOrders': ok({ breaks: [{ summary: 's', callers: ['  src/jobs.ts:2 '] }] }) },
        flows: [
          {
            title: 'F',
            path: 'a → b',
            units: { 'src/repo.ts#findOrders': 'a-very-long-layer-name', 'src/repo.ts#toOrder': 'b' },
          },
        ],
      },
      root,
      null,
    );
    assert.deepEqual(out.stored.units['src/repo.ts#findOrders'].breaks[0].callers, ['src/jobs.ts:2']);
    assert.equal(out.stored.flows[0].units['src/repo.ts#findOrders'], '');
    assert.match(out.dropped.join('\n'), /layer for src\/repo.ts#findOrders 22 chars, max 12 — left blank/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('validate: concerns may cite any shown line; needsLook comes from concerns and breaks, not the agent', () => {
  const out = validateResult(
    BUNDLE,
    {
      units: {
        'src/repo.ts#findOrders': ok({
          concerns: [
            { kind: 'bug', text: '  skips the  first page ', line: 'n9' }, // unchanged context line, in range
            { kind: 'question', text: 'intended?', line: 'O4' },
            { kind: 'bug', text: 'out of range', line: 'N12' },
            { kind: 'nit', text: 'style', line: 'N5' },
            { kind: 'risk', text: 'x'.repeat(LIMITS.concern + 1), line: 'N5' },
          ],
        }),
        'src/repo.ts#toOrder': ok({ concerns: [{ kind: 'question', text: 'why?', line: 'N11' }] }),
      },
    },
    '/nonexistent',
    null,
  );
  const find = out.stored.units['src/repo.ts#findOrders'];
  assert.deepEqual(find.concerns, [
    { kind: 'bug', text: 'skips the first page', line: 'N9' },
    { kind: 'question', text: 'intended?', line: 'O4' },
  ]);
  assert.equal(find.needsLook, true, 'a concern flags the unit');
  assert.equal(out.stored.units['src/repo.ts#toOrder'].needsLook, true, 'a question too');
  const bare = validateResult(
    BUNDLE,
    { units: { 'src/repo.ts#toOrder': ok({ needsLook: true }) } },
    '/nonexistent',
    null,
  );
  assert.equal(
    bare.stored.units['src/repo.ts#toOrder'].needsLook,
    false,
    "the agent's own flag, with no reason, is ignored",
  );
  const reasons = out.dropped.join('\n');
  assert.match(reasons, /concerns\[2\]: line "N12" is not a line of this unit/);
  assert.match(reasons, /concerns\[3\]: kind must be one of bug, risk, question/);
  assert.match(reasons, /concerns\[4\]: text 301 chars, max 300/);
});

test('validate: flows keep priority and why; bad ones are reported; coverage counts flowed units', () => {
  const out = validateResult(
    BUNDLE,
    {
      units: {
        'src/repo.ts#findOrders': ok({ concerns: [{ kind: 'risk', text: 'r', line: 'N5' }] }),
        'src/repo.ts#toOrder': ok({ concerns: [{ kind: 'question', text: 'q', line: 'N11' }] }),
        'src/repo.ts#fetchAll': ok(),
      },
      flows: [
        {
          title: 'Paging',
          path: 'a',
          priority: 1,
          why: '  changes  every caller ',
          units: { 'src/repo.ts#findOrders': 'repo', 'src/repo.ts#fetchAll': 'repo' },
        },
        {
          title: 'Odd',
          path: 'b',
          priority: 7,
          why: 'w'.repeat(101),
          units: { 'src/repo.ts#toOrder': 'x', 'src/repo.ts#getAll': 'y' },
        },
      ],
    },
    '/nonexistent',
    null,
  );
  assert.deepEqual(
    out.stored.flows.map((f) => [f.title, f.priority, f.why]),
    [
      ['Paging', 1, 'changes every caller'],
      ['Odd', undefined, undefined],
    ],
  );
  const reasons = out.dropped.join('\n');
  assert.match(reasons, /"Odd": priority must be 1, 2 or 3/);
  assert.match(reasons, /"Odd": why 101 chars, max 100/);
  assert.deepEqual(out.coverage, { summarized: 3, inFlows: 3, outside: [], advice: [] });
  // a flow without a usable title or path: each bad field, by how much, and what it took with it
  const long = 'Prepare lists callers and files housekeeping';
  const bad = validateResult(
    BUNDLE,
    {
      units: {},
      flows: [
        { title: long, path: 'a', units: { 'src/repo.ts#findOrders': 'repo', 'src/repo.ts#fetchAll': 'repo' } },
        { title: 'T', units: { 'src/repo.ts#toOrder': 'x' } },
      ],
    },
    '/nonexistent',
    null,
  );
  assert.deepEqual(bad.dropped, [
    `flows[0] "${long}": title ${long.length} chars, max 40 — dropped with its 2 units`,
    `flows[1] "T": path missing — dropped with its 1 unit`,
  ]);
  const fewer = validateResult(BUNDLE, { units: {}, flows: [] }, '/nonexistent', out.stored);
  assert.equal(fewer.stored.flows.length, 2, 'an empty flows list changes nothing');
  const loose = validateResult(
    BUNDLE,
    {
      units: {
        'src/repo.ts#findOrders': ok(),
        'src/repo.ts#toOrder': ok({ concerns: [{ kind: 'question', text: 'q', line: 'N11' }] }),
        'src/repo.ts#fetchAll': ok(),
      },
    },
    '/nonexistent',
    null,
  );
  assert.deepEqual(
    loose.coverage.outside,
    ['src/repo.ts#toOrder', 'src/repo.ts#findOrders', 'src/repo.ts#fetchAll'],
    'the flagged one first',
  );
});

test("validate: a unit goes in one flow — a later submit's flow takes it from the stored ones", () => {
  const first = validateResult(
    BUNDLE,
    {
      units: {},
      flows: [
        { title: 'Paging', path: 'a', units: { 'src/repo.ts#findOrders': 'a', 'src/repo.ts#toOrder': 'b' } },
        { title: 'Fetch', path: 'a', units: { 'src/repo.ts#fetchAll': 'a', 'src/repo.ts#getAll': 'b' } },
      ],
    },
    '/nonexistent',
    null,
  );
  const second = validateResult(
    BUNDLE,
    {
      units: {},
      flows: [{ title: 'Rows', path: 'a', units: { 'src/repo.ts#toOrder': 'a', 'src/repo.ts#fetchAll': 'b' } }],
    },
    '/nonexistent',
    first.stored,
  );
  // Paging and Fetch are left with one unit each: too few for a story
  assert.deepEqual(
    second.stored.flows.map((f) => [f.title, Object.keys(f.units)]),
    [['Rows', ['src/repo.ts#toOrder', 'src/repo.ts#fetchAll']]],
  );
});

test("validate: Housekeeping may hold one unit; lens's own housekeeping units count as covered", () => {
  const bundle: Bundle = {
    ...BUNDLE,
    units: [
      ...BUNDLE.units,
      {
        id: 'src/repo.ts#(module)',
        file: 'src/repo.ts',
        name: '(module)',
        kind: 'module',
        status: 'modified',
        hash: 'h5',
        anchor: { n: 1, o: 1 },
        labels: ['N1'],
        ranges: [],
        importsOnly: true,
        done: false,
      },
    ],
  };
  const out = validateResult(
    bundle,
    {
      units: Object.fromEntries(bundle.units.map((u) => [u.id, ok()])),
      flows: [
        {
          title: 'Paging',
          path: 'a',
          units: { 'src/repo.ts#findOrders': 'a', 'src/repo.ts#toOrder': 'b', 'src/repo.ts#fetchAll': 'c' },
        },
        { title: 'Housekeeping', path: '', priority: 3, units: { 'src/repo.ts#getAll': '' } },
      ],
    },
    '/nonexistent',
    null,
  );
  assert.deepEqual(out.dropped, []);
  assert.deepEqual(
    out.stored.flows.map((f) => f.title),
    ['Paging', 'Housekeeping'],
  );
  assert.deepEqual(out.coverage, { summarized: 5, inFlows: 5, outside: [], advice: [] });
});

test('validate: advice for flows that look split up — inside one file, or too small', () => {
  const unit = (file: string, name: string) => ({
    id: `${file}#${name}`,
    file,
    name,
    kind: 'function' as const,
    status: 'modified' as const,
    hash: name,
    anchor: { n: 1, o: 1 },
    labels: ['N1'],
    ranges: [],
    done: false,
  });
  const bundle: Bundle = {
    ...BUNDLE,
    units: ['a', 'b', 'c'].flatMap((file) => [unit(`${file}.ts`, 'one'), unit(`${file}.ts`, 'two')]),
  };
  const out = validateResult(
    bundle,
    {
      units: {},
      flows: [
        { title: 'Store', path: 'a', units: { 'a.ts#one': 'a', 'a.ts#two': 'a' } },
        { title: 'Page', path: 'a', units: { 'b.ts#one': 'a', 'c.ts#one': 'b' } },
        { title: 'Keys', path: 'a', units: { 'b.ts#two': 'a', 'c.ts#two': 'b' } },
      ],
    },
    '/nonexistent',
    null,
  );
  assert.equal(out.coverage.advice.length, 2);
  assert.match(out.coverage.advice[0], /"Store" is all a.ts: .* fold it into the one that needs it/);
  assert.match(out.coverage.advice[1], /3 stories hold 6 units between them/);
  const two = validateResult(
    bundle,
    {
      units: {},
      flows: [
        { title: 'Page', path: 'a', units: { 'a.ts#one': 'a', 'b.ts#one': 'b' } },
        { title: 'Keys', path: 'a', units: { 'a.ts#two': 'a', 'c.ts#two': 'b' } },
      ],
    },
    '/nonexistent',
    null,
  );
  assert.deepEqual(two.coverage.advice, [], 'two small stories on a small diff are fine');
});

test('validate: rejects a non-object result and bad renamedFrom', () => {
  const out = validateResult(BUNDLE, [], '/nonexistent', null);
  assert.deepEqual(out.accepted, []);
  assert.match(out.dropped[0], /"units" object/);
  assert.match(validateResult(BUNDLE, { units: null }, '/nonexistent', null).dropped[0], /"units" object/);
  const notList = validateResult(
    BUNDLE,
    { units: { 'src/repo.ts#toOrder': ok({ concerns: 'null deref at N11' }) } },
    '/nonexistent',
    null,
  );
  assert.deepEqual(notList.accepted, ['src/repo.ts#toOrder']);
  assert.match(notList.dropped.join('\n'), /toOrder: concerns must be an array/);
  const bad = validateResult(
    BUNDLE,
    { units: { 'src/repo.ts#toOrder': ok({ renamedFrom: 'src/repo.ts#findOrders' }) } },
    '/nonexistent',
    null,
  );
  assert.match(bad.dropped.join('\n'), /renamedFrom must be the id of a deleted unit/);
  assert.equal(bad.stored.units['src/repo.ts#toOrder'].renamedFrom, undefined);
});

test('validate: submits merge with earlier ones and flows merge by title', () => {
  const first = validateResult(
    BUNDLE,
    {
      units: { 'src/repo.ts#findOrders': ok() },
      flows: [
        { title: 'Paging', path: 'a', units: { 'src/repo.ts#findOrders': 'repo', 'src/repo.ts#toOrder': 'repo' } },
      ],
    },
    '/nonexistent',
    null,
  );
  const second = validateResult(
    BUNDLE,
    {
      units: { 'src/repo.ts#toOrder': ok() },
      flows: [
        { title: 'Paging', path: 'b', units: { 'src/repo.ts#findOrders': 'repo', 'src/repo.ts#toOrder': 'repo' } },
      ],
    },
    '/nonexistent',
    first.stored,
  );
  assert.deepEqual(Object.keys(second.stored.units).sort(), ['src/repo.ts#findOrders', 'src/repo.ts#toOrder']);
  assert.deepEqual(
    second.stored.flows.map((f) => f.path),
    ['b'],
  );
});

test('validate: a whole-diff pass replaces the stored flows; other passes merge by title', () => {
  // each flow over units of its own: a unit goes in one flow
  const pairs = [
    ['findOrders', 'toOrder'],
    ['fetchAll', 'getAll'],
  ];
  let next = 0;
  const flow = (title: string) => {
    const [a, b] = pairs[next++ % 2];
    return { title, path: 'a', units: { [`src/repo.ts#${a}`]: 'a', [`src/repo.ts#${b}`]: 'b' } };
  };
  const first = validateResult(BUNDLE, { units: {}, flows: [flow('Old'), flow('Kept')] }, '/nonexistent', null);
  next = 0;
  const merged = validateResult(BUNDLE, { units: {}, flows: [flow('New')] }, '/nonexistent', first.stored);
  assert.deepEqual(
    merged.stored.flows.map((f) => f.title),
    ['Kept', 'New'],
    "New takes Old's units",
  );
  const pass = { ...BUNDLE, wholeDiff: true, createdAt: 't1' };
  const replaced = validateResult(pass, { units: {}, flows: [flow('New')] }, '/nonexistent', first.stored);
  assert.deepEqual(
    replaced.stored.flows.map((f) => f.title),
    ['New'],
  );
  const resubmit = validateResult(pass, { units: {}, flows: [flow('Added')] }, '/nonexistent', replaced.stored);
  assert.deepEqual(
    resubmit.stored.flows.map((f) => f.title),
    ['New', 'Added'],
    "the same pass's later submits merge",
  );
  const nextPass = validateResult(
    { ...pass, createdAt: 't2' },
    { units: {}, flows: [flow('Fresh')] },
    '/nonexistent',
    resubmit.stored,
  );
  assert.deepEqual(
    nextPass.stored.flows.map((f) => f.title),
    ['Fresh'],
    'a new pass replaces again',
  );
  const noFlows = validateResult({ ...pass, createdAt: 't3' }, { units: {} }, '/nonexistent', first.stored);
  assert.equal(noFlows.stored.flows.length, 2, 'a submit without flows leaves them alone');
});

test('validate: self-checks name a flow and a line of a unit, at most three a flow', () => {
  const flow = { title: 'Paging', path: 'a', units: { [BUNDLE.units[0].id]: 'a', [BUNDLE.units[1].id]: 'b' } };
  const previous = { version: 1 as const, updatedAt: '', units: {}, flows: [flow] };
  const unit = BUNDLE.units[0].id;
  const good = { flow: 'Paging', question: 'What now?', answer: 'The first 50.', unit, line: 'N5' };
  const outcome = validateResult(
    { ...BUNDLE, checks: true, wholeDiff: true },
    {
      units: {},
      checks: [good, good, good, good, { ...good, flow: 'Other' }, { ...good, line: 'N999' }],
    },
    '/nonexistent',
    previous,
  );
  assert.equal(outcome.acceptedChecks, 3);
  assert.equal(outcome.stored.checked, unitSetHash(BUNDLE.units));
  assert.ok(outcome.dropped.some((reason) => /has its 3 already/.test(reason)));
  assert.ok(outcome.dropped.some((reason) => /isn't one of the flows/.test(reason)));
});

test("validate: the overview is stored with the diff's hash; an over-long one is dropped", () => {
  const good = validateResult(
    BUNDLE,
    { units: {}, overview: { what: '  Pages   orders by default.  ' } },
    '/nonexistent',
    null,
  );
  assert.equal(good.acceptedOverview, true);
  assert.deepEqual(good.stored.overview, { what: 'Pages orders by default.', hash: unitSetHash(BUNDLE.units) });
  const bad = validateResult(BUNDLE, { units: {}, overview: { what: 'x'.repeat(2001) } }, '/nonexistent', good.stored);
  assert.equal(bad.acceptedOverview, false);
  assert.match(bad.dropped[0], /^overview: what/);
  const titled = validateResult(
    BUNDLE,
    { units: {}, overview: { what: 'x', title: '  Orders   page by default ' } },
    '/nonexistent',
    null,
  );
  assert.equal(titled.stored.overview?.title, 'Orders page by default');
  const long = validateResult(
    BUNDLE,
    { units: {}, overview: { what: 'x', title: 'y'.repeat(61) } },
    '/nonexistent',
    null,
  );
  assert.equal(long.stored.overview?.title, undefined, 'the overview stays, without its title');
  assert.match(long.dropped[0], /^overview: title/);
  assert.equal(bad.stored.overview?.what, 'Pages orders by default.', 'a rejected overview keeps the earlier one');
  assert.notEqual(unitSetHash(BUNDLE.units), unitSetHash(BUNDLE.units.slice(1)));
  const multi = validateResult(
    BUNDLE,
    { units: {}, overview: { what: 'Adds  paging.\n\n\n Drops the\nold export. ' } },
    '/nonexistent',
    null,
  );
  assert.equal(
    multi.stored.overview?.what,
    'Adds paging.\n\nDrops the old export.',
    'paragraphs survive, lines inside them join',
  );
});

test('prepare → submit → view round trip, with re-prepare skipping done units and stale marks', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lens-summary-'));
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
  try {
    git('init', '-q', '-b', 'main');
    git('config', 'user.email', 't@t');
    git('config', 'user.name', 't');
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src/repo.ts'), OLD_REPO);
    writeFileSync(join(dir, 'src/jobs.ts'), "import { findOrders } from './repo';\nconst o = await findOrders(u);\n");
    git('add', '-A');
    git('commit', '-qm', 'init');
    git('commit', '-q', '--allow-empty', '-m', 'second: empty');
    assert.equal(commitLog(['HEAD~1', '--', 'src'], dir), '- second: empty', 'a -- pathspec is not a revision');
    writeFileSync(join(dir, 'src/repo.ts'), NEW_REPO);
    git('add', '-A');

    const diff = await loadDiff('diff', ['--staged'], dir, DEFAULT_CONFIG);
    const units = await collectUnits(diff, DEFAULT_CONFIG, dir);
    const sources = new Map([['src/repo.ts', NEW_REPO]]);
    const prep = {
      root: diff.root,
      cwd: dir,
      key: 'diff-staged@main',
      command: 'diff' as const,
      args: ['--staged'],
      label: null,
      commits: '',
      units,
      sources,
    };
    const first = prepareBundle(prep);
    // the import-only module unit is lens's to summarize, not the agent's
    assert.equal(first.todo, units.length - 1);
    assert.equal(first.done, 1);
    assert.equal(readFileSync(join(diff.root, '.lens/.gitignore'), 'utf8').trim().split('\n').pop(), '*');
    assert.ok(existsSync(join(first.dir, 'tasks.md')));
    assert.equal(
      git('status', '--porcelain', '--untracked-files=all').includes('.lens'),
      false,
      '.lens ignores itself',
    );

    const bundle = JSON.parse(readFileSync(join(first.dir, 'bundle.json'), 'utf8')) as Bundle;
    // a fresh single-part run sees every unit: it writes the flows and overview, and replaces stored flows
    assert.equal(bundle.wholeDiff, true);
    assert.match(first.instructions, /^## Flows$/m);
    assert.doesNotMatch(first.instructions, /final pass/);
    const find = bundle.units.find((u) => u.id === 'src/repo.ts#findOrders')!;
    const outcome = validateResult(
      bundle,
      {
        units: {
          'src/repo.ts#findOrders': ok({
            needsLook: true,
            changes: [
              { when: 'No limit', before: 'all', now: 'first 50', line: find.labels.find((l) => l.startsWith('N'))! },
            ],
            breaks: [{ summary: 'job gets 50', callers: ['src/jobs.ts:2'] }],
          }),
        },
        overview: { what: 'Pages orders by default.' },
      },
      diff.root,
      null,
    );
    assert.deepEqual(outcome.dropped, []);
    writeStored(diff.root, 'diff-staged@main', outcome.stored);

    const again = prepareBundle(prep);
    assert.equal(again.done, 2, 'findOrders, and the module unit lens filed');
    assert.equal(again.todo, units.length - 2);
    assert.doesNotMatch(readFileSync(join(again.dir, 'tasks.md'), 'utf8'), /## src\/repo.ts#findOrders/);
    // the overview fits this diff but no flows exist yet: the leftover units leave them to the final pass
    assert.match(again.instructions, /the final pass \(step 5\) asks for them/);
    // with flows stored too, the whole-diff work is done: leftover units come without flows and no final pass
    writeStored(diff.root, 'diff-staged@main', { ...outcome.stored, flows: [{ title: 'F', path: 'a', units: {} }] });
    const leftover = prepareBundle(prep);
    assert.match(leftover.instructions, /Already written for this diff/);
    assert.doesNotMatch(leftover.instructions, /final pass/);
    writeStored(diff.root, 'diff-staged@main', outcome.stored);

    const view = buildSummaryView({ root: diff.root, cwd: dir, command: 'diff', args: ['--staged'], units });
    const v = view.units.find((u) => u.id === 'src/repo.ts#findOrders')!;
    assert.equal(view.command, '/lens-review --staged');
    assert.deepEqual(view.overview, { what: 'Pages orders by default.', title: null, stale: false });
    assert.equal(v.stale, false);
    assert.equal(v.summary?.breaks[0].callers[0].lines.find((l) => l.n === 2)?.text, 'const o = await findOrders(u);');
    // removed blocks arrive with the shown line they display after (removalAnchors)
    const source = units.find((u) => u.id === v.id)!;
    assert.ok(v.removals.length > 0);
    assert.deepEqual(
      v.removals.map((b) => [b.anchor, b.oldStart]),
      [...removalAnchors(source)].flatMap(([anchor, blocks]) => blocks.map((b) => [anchor, b.oldStart])),
    );

    // the code changes after the summary: the unit goes stale
    writeFileSync(join(dir, 'src/repo.ts'), NEW_REPO.replace('50', '25'));
    git('add', '-A');
    const later = await collectUnits(await loadDiff('diff', ['--staged'], dir, DEFAULT_CONFIG), DEFAULT_CONFIG, dir);
    const staleView = buildSummaryView({
      root: diff.root,
      cwd: dir,
      command: 'diff',
      args: ['--staged'],
      units: later,
    });
    const s = staleView.units.find((u) => u.id === 'src/repo.ts#findOrders')!;
    assert.equal(s.stale, true);
    assert.equal(s.summary, null);
    assert.equal(staleView.overview?.stale, true);
    assert.ok(readStored(diff.root, 'diff-staged@main'));

    // on another branch the same arguments are another review: nothing of main's is stale there
    git('checkout', '-q', '-b', 'other');
    const elsewhere = buildSummaryView({
      root: diff.root,
      cwd: dir,
      command: 'diff',
      args: ['--staged'],
      units: later,
    });
    assert.equal(elsewhere.key, 'diff-staged@other');
    assert.deepEqual(
      elsewhere.units.filter((u) => u.stale || u.summary),
      [],
    );
    assert.equal(elsewhere.overview, null);
    git('checkout', '-q', 'main');

    // every unit summarized, only the overview out of date: prepare asks for it alone
    const laterPrep = { ...prep, units: later, sources: new Map([['src/repo.ts', NEW_REPO.replace('50', '25')]]) };
    const laterBundle = JSON.parse(readFileSync(join(prepareBundle(laterPrep).dir, 'bundle.json'), 'utf8')) as Bundle;
    const all = validateResult(
      laterBundle,
      { units: Object.fromEntries(later.map((u) => [u.id, ok()])) },
      diff.root,
      readStored(diff.root, 'diff-staged@main'),
    );
    assert.deepEqual(all.dropped, []);
    writeStored(diff.root, 'diff-staged@main', all.stored);
    const onlyOverview = prepareBundle(laterPrep);
    assert.equal(onlyOverview.todo, 0);
    assert.equal((JSON.parse(readFileSync(join(onlyOverview.dir, 'bundle.json'), 'utf8')) as Bundle).wholeDiff, true);
    assert.match(onlyOverview.instructions, /final pass: the flows and\s+the overview/);
    const finalTasks = readFileSync(join(onlyOverview.dir, 'tasks.md'), 'utf8');
    assert.match(finalTasks, /Does a thing/);
    // the map: units by file with their size, what each names, and lens's own Housekeeping apart
    assert.match(finalTasks, /^### src\/repo.ts$/m);
    assert.match(finalTasks, /`src\/repo.ts#findOrders` \(function, modified, \+\d+ −\d+\)/);
    assert.match(finalTasks, /`src\/repo.ts#router.get\("\/orders"\)`.*\n  names: `src\/repo.ts#findOrders`/);
    assert.match(finalTasks, /Lens files these under "Housekeeping" itself[^\n]*\n- `src\/repo.ts#\(module\)`/);
    assert.doesNotMatch(finalTasks, /^- `src\/repo.ts#\(module\)` \(/m, 'not listed with the rest');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('prepare summarizes import-only units itself, and lists the lines outside the diff that name each unit', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lens-summary-'));
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
  try {
    git('init', '-q', '-b', 'main');
    git('config', 'user.email', 't@t');
    git('config', 'user.name', 't');
    mkdirSync(join(dir, 'src'));
    const calls = Array.from({ length: MAX_USAGES + 2 }, (_, i) => `export const x${i} = second(${i});`);
    const files: Record<string, string> = {
      'src/math.ts': MATH,
      'src/jobs.ts': ["import { second } from './math';", ...calls].join('\n') + '\n',
      'src/util.ts': 'import { a } from "./a";\nexport const u = 1;\n',
      'README.md': 'Call `second` to double a number.\n',
    };
    for (const [file, text] of Object.entries(files)) writeFileSync(join(dir, file), text);
    git('add', '-A');
    git('commit', '-qm', 'init');
    const changed = {
      'src/math.ts': MATH_SECOND + '\nexport function third(n: number): number {\n  return n * 4;\n}\n',
      'src/util.ts': 'import { b } from "./b";\nexport const u = 1;\n',
    };
    for (const [file, text] of Object.entries(changed)) writeFileSync(join(dir, file), text);
    git('add', '-A');

    const diff = await loadDiff('diff', ['--staged'], dir, DEFAULT_CONFIG);
    const units = await collectUnits(diff, DEFAULT_CONFIG, dir);
    const key = 'diff-staged@main';
    const prep = {
      root: diff.root,
      cwd: dir,
      key,
      command: 'diff' as const,
      args: ['--staged'],
      label: null,
      commits: '',
      units,
      sources: new Map(Object.entries(changed)),
    };
    const result = prepareBundle(prep);
    const tasks = readFileSync(join(result.dir, 'tasks.md'), 'utf8');
    const bundle = JSON.parse(readFileSync(join(result.dir, 'bundle.json'), 'utf8')) as Bundle;

    // the import-only unit: summarized and done, out of the tasks, and the pass still sees the whole diff
    assert.deepEqual(
      units.filter((unit) => unit.importsOnly).map((unit) => unit.id),
      ['src/util.ts#(module)'],
    );
    assert.equal(result.todo, units.length - 1);
    assert.doesNotMatch(tasks, /## src\/util.ts/);
    assert.equal(bundle.units.find((unit) => unit.id === 'src/util.ts#(module)')?.done, true);
    const stored = readStored(diff.root, key)!.units['src/util.ts#(module)'];
    assert.equal(stored.headline, 'Changes only its imports');
    assert.deepEqual([stored.changes, stored.breaks, stored.concerns], [[], [], []]);
    assert.equal(bundle.wholeDiff, true);
    assert.match(result.instructions, /lens summarizes the 1 import-only or formatting-only one itself/);
    assert.match(result.instructions, /^## Flows$/m);

    // second's callers, capped, without the README; third has none
    const listed = calls.slice(0, MAX_USAGES - 1).map((call, i) => `- src/jobs.ts:${i + 2}  ${call}`);
    assert.ok(
      tasks.includes(
        [
          'Outside the diff, `second` is named at:',
          "- src/jobs.ts:1  import { second } from './math';",
          ...listed,
        ].join('\n'),
      ),
    );
    assert.match(tasks, /^- … and 3 more: `git grep -nw second`$/m);
    assert.doesNotMatch(tasks, /README/);
    assert.match(tasks, /^Outside the diff, no line names `third`\.$/m);

    // prepared again, the filed unit stays done, and the pass still sees the whole diff
    const again = prepareBundle(prep);
    assert.equal(again.todo, units.length - 1);
    assert.doesNotMatch(again.instructions, /already summarized/);
    assert.match(again.instructions, /^## Flows$/m);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

const MATH = `export function first(n: number): number {
  return n + 1;
}

export function second(n: number): number {
  return n * 2;
}
`;
/** second changed */
const MATH_SECOND = MATH.replace('n * 2', 'n * 3');
/** second changed the same way, and first grew a line above it */
const MATH_BOTH = MATH_SECOND.replace('  return n + 1;', '  n = Math.abs(n);\n  return n + 1;');

test('units: a unit that only moved keeps its hash, and its anchor moves with it', async () => {
  const [alone] = await unitsFor(inputFor('src/math.ts', MATH, MATH_SECOND));
  const both = await unitsFor(inputFor('src/math.ts', MATH, MATH_BOTH));
  const moved = both.find((unit) => unit.name === 'second')!;
  assert.equal(alone.name, 'second');
  assert.equal(moved.hash, alone.hash, 'the same code and diff, one line lower');
  assert.deepEqual(alone.anchor, { n: 5, o: 6 });
  assert.deepEqual(moved.anchor, { n: 6, o: 6 });
  const [changed] = await unitsFor(inputFor('src/math.ts', MATH, MATH.replace('n * 2', 'n * 4')));
  assert.notEqual(changed.hash, alone.hash, 'other code: another hash');
});

test("a summary moves with its unit: another unit's edit above it keeps it, its labels shifted; a moved caller doesn't", async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lens-summary-'));
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
  const key = 'diff-staged@main';
  try {
    git('init', '-q', '-b', 'main');
    git('config', 'user.email', 't@t');
    git('config', 'user.name', 't');
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src/math.ts'), MATH);
    writeFileSync(join(dir, 'src/jobs.ts'), "import { second } from './math';\nexport const x = second(1);\n");
    git('add', '-A');
    git('commit', '-qm', 'init');
    const stage = async (files: Record<string, string>) => {
      for (const [file, text] of Object.entries(files)) writeFileSync(join(dir, file), text);
      git('add', '-A');
      const diff = await loadDiff('diff', ['--staged'], dir, DEFAULT_CONFIG);
      const units = await collectUnits(diff, DEFAULT_CONFIG, dir);
      const prep = {
        root: diff.root,
        cwd: dir,
        key,
        command: 'diff' as const,
        args: ['--staged'],
        label: null,
        commits: '',
        units,
        sources: new Map(Object.entries(files)),
      };
      const view = () =>
        buildSummaryView({ root: diff.root, cwd: dir, command: 'diff', args: ['--staged'], units }).units.find(
          (unit) => unit.name === 'second',
        )!;
      return { root: diff.root, units, prep, view };
    };

    const one = await stage({ 'src/math.ts': MATH_SECOND });
    const bundle = JSON.parse(readFileSync(join(prepareBundle(one.prep).dir, 'bundle.json'), 'utf8')) as Bundle;
    const outcome = validateResult(
      bundle,
      {
        units: {
          'src/math.ts#second': ok({
            changes: [{ when: 'Any n', before: 'doubles it', now: 'triples it', line: 'N6' }],
            concerns: [{ kind: 'question', text: 'is tripling meant?', line: 'N5' }],
            breaks: [{ summary: 'x is 3, not 2', callers: ['src/jobs.ts:2'] }],
          }),
        },
      },
      one.root,
      null,
    );
    assert.deepEqual(outcome.dropped, []);
    writeStored(one.root, key, outcome.stored);

    // first grows a line: second is one line lower, with the same code and diff
    const two = await stage({ 'src/math.ts': MATH_BOTH });
    const moved = two.view();
    assert.equal(moved.stale, false);
    assert.deepEqual(
      moved.summary?.changes.map((change) => change.line),
      ['N7'],
    );
    assert.deepEqual(
      moved.summary?.concerns.map((concern) => concern.line),
      ['N6'],
    );
    assert.equal(
      readFileSync(join(dir, 'src/math.ts'), 'utf8').split('\n')[6],
      '  return n * 3;',
      'N7 is still the changed line',
    );
    const again = prepareBundle(two.prep);
    assert.equal(again.done, 1, 'second is skipped');
    assert.equal(again.todo, 1, 'first is asked for');
    assert.equal(readStored(two.root, key)!.units['src/math.ts#second'].changes[0].line, 'N6', 'stored as written');

    // lines above the caller: line 2 no longer mentions second, so the summary is written again
    const three = await stage({
      'src/math.ts': MATH_BOTH,
      'src/jobs.ts': "// jobs\n// run nightly\nimport { second } from './math';\nexport const x = second(1);\n",
    });
    assert.equal(three.view().stale, true);
    assert.equal(three.view().summary, null);
    const redo = prepareBundle(three.prep);
    assert.equal(redo.done, 0);
    assert.equal(
      readStored(three.root, key)!.units['src/math.ts#second'],
      undefined,
      'no longer counted as summarized',
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---- Build previews: the agent's previews of changed screens, and its sequence diagrams ----

/** A validate fixture with the agent's preview files in the bundle's previews/ folder. */
function previewRoot(files: Record<string, string>): string {
  const root = fixtureRoot();
  const dir = join(root, '.lens/summary/diff-staged/previews');
  mkdirSync(dir, { recursive: true });
  for (const [name, html] of Object.entries(files)) writeFileSync(join(dir, name), html);
  return root;
}

const SCREEN = `<style>.panel{padding:12px;background:#fff}.lens-skel{background:#eee;height:40px}</style>
<div class="lens-skel"></div>
<div class="panel" data-lens-unit="src/repo.ts#findOrders" data-lens-change="changed">Orders, 50 a page</div>`;

test("validate: a preview is checked and kept by its content's hash; a bad one says why", () => {
  const root = previewRoot({
    'orders.html': SCREEN,
    'orders.before.html': SCREEN.replace('50 a page', 'all of them'),
    'script.html': SCREEN + '<script>alert(1)</script>',
    'remote.html': SCREEN.replace('background:#fff', 'background:url(https://example.com/x.png)'),
    'stranger.html': SCREEN.replace('#findOrders', '#toOrder'),
    'handler.html': SCREEN.replace('class="panel"', 'class="panel" onclick="go()"'),
  });
  try {
    const entry = (extra: object) => ({
      title: 'Orders page',
      units: ['src/repo.ts#findOrders'],
      now: 'previews/orders.html',
      ...extra,
    });
    const out = validateResult(
      BUNDLE,
      {
        units: {},
        previews: [
          entry({ before: 'previews/orders.before.html' }),
          entry({ title: 'Script', now: 'previews/script.html' }),
          entry({ title: 'Remote', now: 'previews/remote.html' }),
          entry({ title: 'Stranger', now: 'previews/stranger.html' }),
          entry({ title: 'Handler', now: 'previews/handler.html' }),
          entry({ title: 'Outside', now: '../summary.json' }),
          entry({ title: 'Missing', now: 'previews/nope.html' }),
          entry({ title: 'Unknown', units: ['src/other.ts#x'] }),
        ],
      },
      root,
      null,
    );
    assert.equal(out.acceptedPreviews, 1, out.dropped.join('\n'));
    const [kept] = out.stored.previews!;
    assert.deepEqual(
      kept.units,
      { 'src/repo.ts#findOrders': 'h1@1,1' },
      'each unit with the placed hash it was drawn for',
    );
    assert.match(kept.now, /^[0-9a-f]{16}\.html$/);
    assert.notEqual(kept.before, kept.now);
    assert.equal(out.assets.get(kept.now), SCREEN, 'the file, as the agent wrote it, under its hash');

    const reasons = out.dropped.join('\n');
    assert.match(reasons, /"Script": now "previews\/script.html" has a <script>/);
    assert.match(reasons, /"Remote": now "previews\/remote.html" loads "https:\/\/example.com\/x.png"/);
    assert.match(
      reasons,
      /"Stranger": now .* marks data-lens-unit="src\/repo.ts#toOrder", which isn't one of the entry's units/,
    );
    assert.match(reasons, /"Handler": now .* inline event handler/);
    assert.match(reasons, /"Outside": now must be a file in the bundle's previews\/ folder/);
    assert.match(reasons, /"Missing": now "previews\/nope.html" not found/);
    assert.match(reasons, /"Unknown": unknown unit "src\/other.ts#x"/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('previewProblems lets data: URLs and #fragments through, and checks the change marks', () => {
  const units = new Set(['a#b']);
  assert.deepEqual(
    previewProblems(
      '<img src="data:image/png;base64,AAAA"><a href="#top">x</a><div style="background:url(data:x)">',
      units,
    ),
    [],
  );
  assert.deepEqual(
    previewProblems('<p>Only one = the other</p>', units),
    [],
    "text that reads like a handler isn't one",
  );
  assert.deepEqual(previewProblems('<div data-lens-unit="a#b" data-lens-change="moved">', units), [
    'data-lens-change="moved" must be one of added, changed, removed',
  ]);
  assert.equal(
    previewProblems('<link rel="stylesheet" href="app.css">', units).length,
    2,
    'a <link>, and what it loads',
  );
});

test('validate: previews of one component each, from the same story, get advice to be one screen', () => {
  const root = previewRoot({
    'find.html': SCREEN,
    'to.html': SCREEN.replace('#findOrders', '#toOrder'),
    'fetch.html': SCREEN.replace('#findOrders', '#fetchAll'),
  });
  try {
    const preview = (title: string, unit: string, file: string) => ({
      title,
      units: [`src/repo.ts#${unit}`],
      now: `previews/${file}`,
    });
    const out = validateResult(
      BUNDLE,
      {
        units: {},
        flows: [
          { title: 'Orders', path: 'a', units: { 'src/repo.ts#findOrders': 'a', 'src/repo.ts#toOrder': 'b' } },
          { title: 'Fetch', path: 'a', units: { 'src/repo.ts#fetchAll': 'a', 'src/repo.ts#getAll': 'b' } },
        ],
        previews: [
          preview('Search box', 'findOrders', 'find.html'),
          preview('Order row', 'toOrder', 'to.html'),
          preview('Fetch', 'fetchAll', 'fetch.html'),
        ],
      },
      root,
      null,
    );
    assert.equal(out.acceptedPreviews, 3, 'advice, not a rejection');
    assert.deepEqual(out.previewAdvice, [
      `"Search box", "Order row" each show one unit of "Orders": if they're on one screen, draw it once with all their units and drop the others`,
    ]);
    const merged = validateResult(
      BUNDLE,
      {
        units: {},
        previews: [
          { title: 'Orders page', units: ['src/repo.ts#findOrders', 'src/repo.ts#toOrder'], now: 'previews/find.html' },
        ],
      },
      root,
      { ...out.stored, previews: [] },
    );
    assert.deepEqual(merged.previewAdvice, [], 'one screen with both units');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('validate: a sequence keeps its steps; a changed step must name its unit and a line of it', () => {
  const steps = [
    { from: 'route', to: 'repo', label: 'findOrders(user)' },
    {
      from: 'repo',
      to: 'db',
      label: 'SELECT … LIMIT 50',
      was: 'SELECT *',
      change: 'changed',
      unit: 'src/repo.ts#findOrders',
      line: 'n6',
    },
    { from: 'repo', to: 'repo', label: 'toOrder(row)', change: 'added', unit: 'src/repo.ts#toOrder', line: 'N11' },
  ];
  const sequence = (extra: object) => ({ title: 'List orders', lanes: ['route', 'repo', 'db'], steps, ...extra });
  const out = validateResult(
    BUNDLE,
    {
      units: {},
      sequences: [
        sequence({}),
        sequence({ title: 'Bad lane', steps: [{ ...steps[1], to: 'cache' }] }),
        sequence({ title: 'No unit', steps: [{ ...steps[1], unit: undefined }] }),
        sequence({ title: 'Bad line', steps: [{ ...steps[1], line: 'N99' }] }),
        sequence({ title: 'Nothing changes', steps: [steps[0]] }),
        sequence({ title: 'Was without change', steps: [{ ...steps[0], was: 'x' }] }),
        sequence({ title: 'One lane', lanes: ['route'] }),
      ],
    },
    '/nonexistent',
    null,
  );
  assert.equal(out.acceptedSequences, 1);
  const [kept] = out.stored.sequences!;
  assert.deepEqual(kept.steps[1], { ...steps[1], line: 'N6' }, "the line normalized like a change row's");
  assert.deepEqual(kept.units, { 'src/repo.ts#findOrders': 'h1@1,1', 'src/repo.ts#toOrder': 'h2@1,1' });
  const reasons = out.dropped.join('\n');
  assert.match(reasons, /"Bad lane" steps\[0\]: from and to must be lanes/);
  assert.match(reasons, /"No unit" steps\[0\]: a changed step needs the unit and line/);
  assert.match(reasons, /"Bad line" steps\[0\]: line "N99" is not a line of src\/repo.ts#findOrders/);
  assert.match(reasons, /"Nothing changes": no step is added, changed or removed/);
  assert.match(reasons, /"Was without change" steps\[0\]: was is what a changed step said before/);
  assert.match(reasons, /"One lane": lanes must be 2–6 different names/);
});

test('validate: a whole-diff pass replaces the drawings once; it records that it was asked for them', () => {
  const sequence = (title: string) => ({
    title,
    lanes: ['a', 'b'],
    steps: [{ from: 'a', to: 'b', label: 'x', change: 'added', unit: 'src/repo.ts#findOrders', line: 'N5' }],
  });
  const first = validateResult(
    BUNDLE,
    { units: {}, sequences: [sequence('Old'), sequence('Kept')] },
    '/nonexistent',
    null,
  );
  assert.equal(first.stored.drawn, undefined, "a pass that didn't ask records nothing");
  const merged = validateResult(BUNDLE, { units: {}, sequences: [sequence('Old')] }, '/nonexistent', first.stored);
  assert.deepEqual(
    merged.stored.sequences!.map((q) => q.title),
    ['Kept', 'Old'],
    'by title',
  );
  const pass = { ...BUNDLE, wholeDiff: true, drawings: true, createdAt: 't1' };
  const replaced = validateResult(pass, { units: {}, sequences: [sequence('New')] }, '/nonexistent', merged.stored);
  assert.deepEqual(
    replaced.stored.sequences!.map((q) => q.title),
    ['New'],
  );
  assert.equal(replaced.stored.drawn, unitSetHash(BUNDLE.units));
  const again = validateResult(pass, { units: {}, sequences: [sequence('Added')] }, '/nonexistent', replaced.stored);
  assert.deepEqual(
    again.stored.sequences!.map((q) => q.title),
    ['New', 'Added'],
    "the same pass's later submits merge",
  );
  const none = validateResult({ ...pass, createdAt: 't2' }, { units: {} }, '/nonexistent', null);
  assert.equal(none.stored.drawn, unitSetHash(BUNDLE.units), 'drawing nothing is an answer too');
});

test("a preview's bridge dims the units around the named one, not what holds it, and dims nested ones once", () => {
  const root = mkdtempSync(join(tmpdir(), 'lens-bridge-'));
  try {
    const nested = `<div id="page" data-lens-unit="a#Page"><div id="card" data-lens-unit="a#Card"><div id="mine" data-lens-unit="a#Mine"><b id="inner" data-lens-unit="a#Inner">x</b></div></div>
<div id="other" data-lens-unit="a#Other"><i id="deep" data-lens-unit="a#Deep">y</i></div></div>`;
    writeAssets(
      root,
      'diff-x',
      {
        version: 1,
        updatedAt: '',
        units: {},
        flows: [],
        previews: [{ title: 'A', units: {}, now: '0123456789abcdef.html' }],
      },
      new Map([['0123456789abcdef.html', nested]]),
    );
    const served = previewResponse(root, 'diff-x', '0123456789abcdef.html');
    const window = new Window({
      url: 'http://127.0.0.1/#' + encodeURIComponent('a#Mine'),
      settings: { enableJavaScriptEvaluation: true, suppressInsecureJavaScriptEnvironmentWarning: true },
    });
    window.document.write(served.body.replace(/<script nonce="[^"]+">/, '<script>'));
    const classes = (id: string) => [...window.document.getElementById(id)!.classList].sort().join(' ');
    assert.equal(classes('mine'), 'lens-on');
    assert.equal(classes('page'), '', "what holds the named unit isn't dimmed: its fade would carry into it");
    assert.equal(classes('card'), '');
    assert.equal(classes('inner'), '', "what the named unit holds isn't dimmed");
    assert.equal(classes('other'), 'lens-dim');
    assert.equal(classes('deep'), '', "a unit inside a dimmed one isn't dimmed again");
    assert.ok(window.document.documentElement.classList.contains('lens-focus'));
    window.close();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("writeAssets keeps the previews' files and drops the ones no preview names; the route serves them boxed in", () => {
  const root = mkdtempSync(join(tmpdir(), 'lens-assets-'));
  try {
    const stored = {
      version: 1 as const,
      updatedAt: '',
      units: {},
      flows: [],
      previews: [{ title: 'A', units: {}, now: '0123456789abcdef.html' }],
    };
    writeAssets(
      root,
      'diff-x',
      stored,
      new Map([
        ['0123456789abcdef.html', SCREEN],
        ['fedcba9876543210.html', 'old'],
      ]),
    );
    const assets = join(root, '.lens/summary/diff-x/assets');
    assert.ok(existsSync(join(assets, '0123456789abcdef.html')));
    assert.ok(!existsSync(join(assets, 'fedcba9876543210.html')), 'a file no stored preview names is dropped');

    const served = previewResponse(root, 'diff-x', '0123456789abcdef.html');
    assert.equal(served.status, 200);
    const nonce = /script-src 'nonce-([^']+)'/.exec(served.headers['content-security-policy'])?.[1];
    assert.ok(nonce, "the only script allowed is lens's, by its nonce");
    assert.match(
      served.headers['content-security-policy'],
      /^default-src 'none'; style-src 'unsafe-inline'; img-src data:/,
    );
    assert.ok(served.body.startsWith('<!doctype html>\n' + SCREEN));
    assert.match(served.body, new RegExp(`<script nonce="${nonce.replace(/[+/=]/g, '\\$&')}">`));
    assert.match(served.body, /parent\.postMessage/);
    assert.equal(served.headers['x-content-type-options'], 'nosniff');
    assert.match(served.headers['content-security-policy'], /; sandbox allow-scripts$/, "never on lens's own origin");

    for (const [key, asset] of [
      ['diff-x', '../../../etc/passwd'],
      ['diff-x', 'fedcba9876543210.html'],
      [null, '0123456789abcdef.html'],
    ] as const) {
      assert.equal(previewResponse(root, key, asset).status, 404, `${key} ${asset}`);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Build previews: the reader's switch in .lens/settings.json wins over the config's", () => {
  const root = mkdtempSync(join(tmpdir(), 'lens-settings-'));
  try {
    assert.equal(DEFAULT_CONFIG.buildPreviews, true, 'on by default');
    assert.deepEqual(readSettings(root), {});
    assert.equal(
      buildPreviewsOn(root, { ...DEFAULT_CONFIG, buildPreviews: false }),
      false,
      "the config's, without a switch",
    );
    writeSettings(root, { buildPreviews: false });
    assert.equal(buildPreviewsOn(root, DEFAULT_CONFIG), false);
    assert.equal(
      readFileSync(join(root, '.lens/.gitignore'), 'utf8').trim().split('\n').pop(),
      '*',
      "in lens's ignored folder",
    );
    writeSettings(root, { buildPreviews: true });
    assert.equal(buildPreviewsOn(root, { ...DEFAULT_CONFIG, buildPreviews: false }), true);
    writeFileSync(join(root, '.lens/settings.json'), 'not json');
    assert.deepEqual(readSettings(root), {}, 'a broken file is no switch');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('prepare asks for previews of a UI diff and sequences while Build previews is on; the view shows them until their code changes', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lens-drawings-'));
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
  const PAGE = 'export function OrdersPage() {\n  return <ul className="orders" />;\n}\n';
  try {
    git('init', '-q', '-b', 'main');
    git('config', 'user.email', 't@t');
    git('config', 'user.name', 't');
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src/repo.ts'), OLD_REPO);
    writeFileSync(join(dir, 'src/Orders.tsx'), PAGE);
    git('add', '-A');
    git('commit', '-qm', 'init');
    writeFileSync(join(dir, 'src/repo.ts'), NEW_REPO);
    writeFileSync(join(dir, 'src/Orders.tsx'), PAGE.replace('<ul', '<ol'));
    git('add', '-A');

    const diff = await loadDiff('diff', ['--staged'], dir, DEFAULT_CONFIG);
    const units = await collectUnits(diff, DEFAULT_CONFIG, dir);
    const sources = new Map([
      ['src/repo.ts', NEW_REPO],
      ['src/Orders.tsx', PAGE.replace('<ul', '<ol')],
    ]);
    const prep = {
      root: diff.root,
      cwd: dir,
      key: 'diff-staged@main',
      command: 'diff' as const,
      args: ['--staged'],
      label: null,
      commits: '',
      units,
      sources,
    };

    const off = prepareBundle(prep);
    assert.doesNotMatch(off.instructions, /## Previews|## Sequences/, 'Build previews off: not asked');
    const backend = prepareBundle({ ...prep, drawings: true, units: units.filter((u) => u.file === 'src/repo.ts') });
    assert.doesNotMatch(backend.instructions, /## Previews/, 'no UI in the diff: no previews');
    assert.match(backend.instructions, /## Sequences/);
    const on = prepareBundle({ ...prep, drawings: true });
    assert.match(on.instructions, /^## Previews\nThis diff changes UI \(`src\/Orders.tsx#OrdersPage`\)/m);
    assert.match(on.instructions, /^## Sequences$/m);
    assert.match(on.instructions, /A preview is a screen, never a component/);
    assert.ok(existsSync(join(on.dir, 'previews')), "a folder for the agent's files");

    // the agent summarizes every unit, writes the flows and the overview, and draws the page
    const page = units.find((u) => u.name === 'OrdersPage')!;
    writeFileSync(
      join(on.dir, 'previews/orders.html'),
      `<ol data-lens-unit="${page.id}" data-lens-change="changed"></ol>`,
    );
    const bundle = JSON.parse(readFileSync(join(on.dir, 'bundle.json'), 'utf8')) as Bundle;
    assert.equal(bundle.drawings, true);
    const outcome = validateResult(
      bundle,
      {
        units: Object.fromEntries(units.map((u) => [u.id, ok()])),
        flows: [{ title: 'Orders', path: 'repo → page', units: Object.fromEntries(units.map((u) => [u.id, 'x'])) }],
        overview: { what: 'Numbers the orders.' },
        previews: [{ title: 'Orders page', units: [page.id], now: 'previews/orders.html' }],
      },
      diff.root,
      null,
    );
    assert.deepEqual(outcome.dropped, []);
    writeStored(diff.root, 'diff-staged@main', outcome.stored);
    writeAssets(diff.root, 'diff-staged@main', outcome.stored, outcome.assets);
    assert.match(prepareBundle({ ...prep, drawings: true }).instructions, /Nothing to do/, 'drawn: no final pass');

    const view = buildSummaryView({ root: diff.root, cwd: dir, command: 'diff', args: ['--staged'], units });
    assert.deepEqual(view.previews, [
      {
        title: 'Orders page',
        units: [page.id],
        stale: false,
        before: null,
        now: '/api/preview/' + outcome.stored.previews![0].now,
      },
    ]);
    assert.equal(previewResponse(diff.root, view.key, outcome.stored.previews![0].now).status, 200);

    // a summary written with Build previews off, then switched on: the final pass asks for the drawings alone
    const undrawn = { ...outcome.stored, drawn: undefined };
    writeStored(diff.root, 'diff-staged@main', undrawn);
    const drawOnly = prepareBundle({ ...prep, drawings: true });
    assert.match(drawOnly.instructions, /final pass: the drawings of the whole diff/);
    assert.match(drawOnly.instructions, /`\{"units": \{\}, "previews": \[ … \], "sequences": \[ … \]\}`/);
    assert.doesNotMatch(drawOnly.instructions, /^## Flows$/m, 'the flows and overview are written');

    // the page changes again: its preview goes, since every unit it showed changed
    writeFileSync(join(dir, 'src/Orders.tsx'), PAGE.replace('<ul', '<menu'));
    git('add', '-A');
    const later = await collectUnits(await loadDiff('diff', ['--staged'], dir, DEFAULT_CONFIG), DEFAULT_CONFIG, dir);
    assert.deepEqual(
      buildSummaryView({ root: diff.root, cwd: dir, command: 'diff', args: ['--staged'], units: later }).previews,
      [],
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an untracked file of a working-tree diff gets units like any added file', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lens-summary-'));
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
  try {
    git('init', '-q');
    git('config', 'user.email', 't@t');
    git('config', 'user.name', 't');
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src/repo.ts'), OLD_REPO);
    git('add', '-A');
    git('commit', '-qm', 'init');
    // never `git add`ed: git diff alone would not list it
    writeFileSync(
      join(dir, 'src/fresh.ts'),
      'export function fresh(): number {\n  return 1;\n}\n\nexport function other(): number {\n  return 2;\n}\n',
    );

    const diff = await loadDiff('diff', [], dir, DEFAULT_CONFIG);
    assert.deepEqual(
      diff.targets.map((t) => [t.status, t.changedLines.length]),
      [['added', 7]],
    );
    // collectUnits checks the coverage itself: every line of the file is in exactly one unit
    const units = await collectUnits(diff, DEFAULT_CONFIG, dir);
    assert.deepEqual(units.map((u) => u.id).sort(), ['src/fresh.ts#fresh', 'src/fresh.ts#other']);
    assert.ok(units.every((u) => u.status === 'new'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a summary run's progress: units in, then the final pass, then nothing; a stopped run stays shown", () => {
  const root = mkdtempSync(join(tmpdir(), 'lens-progress-'));
  try {
    const key = 'diff';
    const read = buildProgressReader(root, key);
    assert.equal(read(), null, 'no prepare: no run');
    const unit = (id: string) => ({
      id,
      file: 'a.ts',
      name: id,
      kind: 'function',
      status: 'modified',
      hash: 'h-' + id,
      anchor: { n: 1, o: 0 },
      labels: [],
      done: false,
    });
    const bundle = {
      version: 1,
      key,
      command: 'diff',
      args: [],
      createdAt: '',
      units: [unit('a'), unit('b'), unit('c')],
    };
    mkdirSync(join(root, '.lens', 'summary', key), { recursive: true });
    writeFileSync(join(root, '.lens', 'summary', key, 'bundle.json'), JSON.stringify(bundle));
    const where = () => {
      const build = read();
      return build && { done: build.done, total: build.total, stage: build.stage };
    };
    assert.deepEqual(where(), { done: 0, total: 3, stage: 'changes' });

    const summary = (headline: string, hash: string) => ({
      headline,
      gist: '',
      changes: [],
      breaks: [],
      concerns: [],
      needsLook: false,
      hash,
      anchor: { n: 1, o: 0 },
    });
    const units = { a: summary('A', 'h-a'), b: summary('B', 'h-b'), c: summary('C', 'stale') };
    writeStored(root, key, { version: 1, updatedAt: '', units, flows: [] });
    assert.deepEqual(where(), { done: 2, total: 3, stage: 'changes' }, "a summary for other code doesn't count");

    units.c = summary('C', 'h-c');
    writeStored(root, key, { version: 1, updatedAt: '', units, flows: [] });
    assert.deepEqual(where(), { done: 3, total: 3, stage: 'story' }, 'every unit in: flows and the overview left');

    const flow = { title: 'Orders', path: 'a → b', units: { a: 'repo', b: 'route', c: 'route' } };
    const overview = { what: 'x', hash: unitSetHash(bundle.units) };
    writeStored(root, key, { version: 1, updatedAt: '1', units, flows: [flow], overview });
    assert.equal(read(), null, 'the final pass is in: done');

    // what's left names what the agent is on: drawings once the story is in, and not once they are
    const left = { ...bundle, drawings: true, checks: true };
    writeFileSync(join(root, '.lens', 'summary', key, 'bundle.json'), JSON.stringify(left));
    assert.equal(where()?.stage, 'drawings');
    const drawn = unitSetHash(bundle.units);
    writeStored(root, key, { version: 1, updatedAt: '1b', units, flows: [flow], overview, drawn });
    assert.equal(where()?.stage, 'story', 'only the self-checks left: still the story pass');

    // what lens writes itself isn't the agent's work, and the run says how long the agent has been quiet
    const filed = { ...bundle, units: [...bundle.units, { ...unit('d'), importsOnly: true }], drawings: true };
    writeFileSync(join(root, '.lens', 'summary', key, 'bundle.json'), JSON.stringify(filed));
    writeStored(root, key, { version: 1, updatedAt: '2', units: { d: summary('D', 'h-d') }, flows: [] });
    const quiet = read();
    assert.deepEqual([quiet?.done, quiet?.total, quiet?.drawings], [0, 3, true]);
    assert.ok(quiet!.quietMs >= 0 && quiet!.quietMs < 60_000, 'written just now');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a branch diff isn't summarized until that branch is checked out; a PR, the working tree and the index are", async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lens-checkout-'));
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
  try {
    git('init', '-q', '-b', 'main');
    git('config', 'user.email', 't@t');
    git('config', 'user.name', 't');
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src/repo.ts'), OLD_REPO);
    git('add', '-A');
    git('commit', '-qm', 'init');
    git('checkout', '-qb', 'feature');
    writeFileSync(join(dir, 'src/repo.ts'), NEW_REPO);
    git('commit', '-qam', 'paging');
    git('checkout', '-q', 'main');

    assert.equal(uncheckedOutRevision(['main...feature'], dir), 'feature');
    assert.equal(uncheckedOutRevision(['main..feature'], dir), 'feature');
    assert.equal(uncheckedOutRevision(['main', 'feature', '--', 'src'], dir), 'feature');
    assert.equal(uncheckedOutRevision(['feature', 'main'], dir), null, 'main is checked out');
    assert.equal(uncheckedOutRevision(['feature...'], dir), null, 'B left out: HEAD');
    assert.equal(uncheckedOutRevision(['-R', 'main', 'feature'], dir), null, '-R swaps the sides');
    assert.equal(uncheckedOutRevision(['feature'], dir), null, 'one revision: the working tree');
    assert.equal(uncheckedOutRevision([], dir), null);
    assert.equal(uncheckedOutRevision(['--staged'], dir), null, 'the index');
    assert.equal(checkoutFirst(dir, 'pr', ['87']), null, 'a PR is summarized from anywhere');

    // prepare refuses, saying what to run; nothing is written
    await assert.rejects(
      runSummary(['prepare', 'main...feature'], dir),
      /isn't checked out[\s\S]*git checkout feature/,
    );
    assert.equal(existsSync(join(dir, '.lens', 'summary')), false);
    const diff = await loadDiff('diff', ['main...feature'], dir, DEFAULT_CONFIG);
    const units = await collectUnits(diff, DEFAULT_CONFIG, dir);
    const view = (args: string[]) => buildSummaryView({ root: diff.root, cwd: dir, command: 'diff', args, units });
    assert.equal(view(['main...feature']).checkout, 'feature', 'the Summary tab says the same');
    // the viewer's own summary, which the page polls
    const open = await analyze('diff', ['main...feature'], dir, DEFAULT_CONFIG);
    assert.equal(open.summary?.checkout, 'feature');

    // checked out, the same diff is summarized as any other
    git('checkout', '-q', 'feature');
    assert.equal(view(['main...feature']).checkout, null);
    // and the open viewer follows, though the diff is the same: read under the branch's key now
    const followed = open.latestSummary!();
    assert.equal(followed.checkout, null);
    assert.equal(followed.key, summaryKey('diff', ['main...feature'], 'feature'));
    assert.notEqual(followed.key, open.summary?.key);
    assert.equal(uncheckedOutRevision(['main', 'HEAD~1'], dir), null, 'counted from HEAD: no checkout puts it on disk');
    const lines: string[] = [];
    const log = console.log;
    console.log = (line: string) => lines.push(line);
    try {
      await runSummary(['prepare', 'main...feature'], dir);
    } finally {
      console.log = log;
    }
    assert.match(lines.join('\n'), /instructions for the agent/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
