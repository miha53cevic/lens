import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { BUILT_IN_CATEGORIES, CONFIG_FIELDS, DEFAULT_CONFIG, loadConfig, readConfig } from '../src/cli-app/config.ts';
import { analyzeSource } from '../src/cli-app/classify/index.ts';
import type { LensConfig } from '../src/cli-app/model.ts';

function configDir(json: object | string): string {
  const dir = mkdtempSync(join(tmpdir(), 'lens-config-'));
  writeFileSync(join(dir, '.lens.json'), typeof json === 'string' ? json : JSON.stringify(json));
  return dir;
}

/** Each problem as `path: message` */
const problemsOf = (dir: string) => readConfig(dir).problems.map((problem) => problem.path + ': ' + problem.message);

test('defaults come from lens.defaults.json', () => {
  assert.equal(DEFAULT_CONFIG.foldLevel, 1);
  assert.equal(DEFAULT_CONFIG.folds.import, 0);
  assert.equal(DEFAULT_CONFIG.theme, 'vesper');
  assert.equal(DEFAULT_CONFIG.callPatterns.length, 2);
  assert.ok(DEFAULT_CONFIG.keepCommentMarkers.includes('TODO'));
  assert.equal(DEFAULT_CONFIG.keepDirective, 'lens:keep');
  assert.ok(DEFAULT_CONFIG.exclude.includes('package-lock.json'));
});

test('.lens.json extends the base: scalars override, maps merge, lists extend', () => {
  const dir = configDir({
    foldLevel: 0,
    folds: { logging: false, guard: 2 },
    callPatterns: [{ category: 'audit', receivers: ['audit'] }],
    keepCommentMarkers: ['SECURITY'],
  });
  const config = loadConfig(dir);
  assert.equal(config.foldLevel, 0);
  assert.equal(config.theme, 'vesper'); // inherited
  assert.equal(config.folds.logging, false);
  assert.equal(config.folds.guard, 2);
  assert.equal(config.folds.import, 0); // inherited
  assert.equal(config.callPatterns.length, 3); // 2 base + 1 custom
  assert.ok(config.keepCommentMarkers.includes('TODO'));
  assert.ok(config.keepCommentMarkers.includes('SECURITY'));
});

test('"base": false replaces the built-in rules entirely', () => {
  const dir = configDir({
    base: false,
    callPatterns: [{ category: 'audit', receivers: ['audit'] }],
  });
  const config = loadConfig(dir);
  assert.equal(config.callPatterns.length, 1);
  assert.equal(config.callPatterns[0].category, 'audit');
  assert.deepEqual(config.keepCommentMarkers, []);
});

test('callPatterns with non-string receivers or methods are dropped', () => {
  const dir = configDir({
    base: false,
    callPatterns: [
      { category: 'a', receivers: [42] },
      { category: 'b', receivers: ['b'], methods: 'info' },
      { category: 'c', receivers: ['c'], methods: ['track'] },
    ],
  });
  assert.deepEqual(
    loadConfig(dir).callPatterns.map((p) => p.category),
    ['c'],
  );
});

test('custom callPatterns fold custom receivers under their own category', async () => {
  const config: LensConfig = {
    ...DEFAULT_CONFIG,
    callPatterns: [...DEFAULT_CONFIG.callPatterns, { category: 'audit', receivers: ['audit', 'featureFlags'] }],
  };
  const model = await analyzeSource(
    'x.ts',
    `
function pay(amount: number) {
  audit.record("payment.start", amount);
  featureFlags.report("pay-v2");
  const receipt = charge(amount);
  return receipt;
}
`.trim(),
    config,
  );
  assert.ok(model);
  const audit = model.regions.filter((r) => r.category === 'audit');
  assert.equal(audit.length, 1);
  assert.deepEqual([audit[0].startLine, audit[0].endLine], [2, 3]);
});

test('with base:false, built-in logging no longer folds', async () => {
  const config: LensConfig = {
    ...DEFAULT_CONFIG,
    callPatterns: [{ category: 'audit', receivers: ['audit'] }],
  };
  const model = await analyzeSource('x.ts', `console.log("hi");`, config);
  assert.ok(model);
  assert.equal(model.regions.length, 0);
});

test('keepDirective pins a region open', async () => {
  const source = `
// lens:keep — this guard was buggy last week, always show it
if (!input) {
  throw new Error("input required");
}
console.log("processing");
`.trim();
  const model = await analyzeSource('x.ts', source, DEFAULT_CONFIG);
  assert.ok(model);
  const guard = model.regions.find((r) => r.category === 'guard');
  assert.ok(guard);
  assert.ok(guard.score > DEFAULT_CONFIG.foldLevel, 'directive must keep the guard visible');
  const logging = model.regions.find((r) => r.category === 'logging');
  assert.ok(logging && logging.score <= DEFAULT_CONFIG.foldLevel, 'unrelated regions still fold');
});

test('unknown fields (typos) are problems, and nothing is printed', () => {
  const dir = configDir({ foldLevle: 2 });
  const errors: string[] = [];
  const error = console.error;
  console.error = (msg: string) => {
    errors.push(msg);
  };
  try {
    assert.deepEqual(problemsOf(dir), ['foldLevle: is not a config field']);
  } finally {
    console.error = error;
  }
  assert.deepEqual(errors, [], 'the CLI prints them, once');
});

test('a value that does not check is skipped and reported, with its path; the rest applies', () => {
  const dir = configDir({
    foldLevel: 7,
    theme: 3,
    folds: { logging: 'yes', guard: false, import: 2.5, loging: 1 },
    exclude: ['a', 4],
    selfChecks: 'on',
    callPatterns: [{ category: 'audit', receivers: ['audit'], method: ['x'] }],
  });
  const config = loadConfig(dir);
  assert.equal(config.foldLevel, 1);
  assert.equal(config.theme, 'vesper');
  assert.equal(config.folds.logging, 1, 'bad value skipped, default kept');
  assert.equal(config.folds.guard, false);
  assert.equal(config.folds.import, 0);
  assert.ok(!('loging' in config.folds), 'a category nothing makes is skipped too');
  assert.equal(config.selfChecks, false);
  assert.ok(config.exclude.includes('a'));
  assert.equal(config.callPatterns.length, 2, 'a pattern with a problem is dropped whole');
  assert.deepEqual(problemsOf(dir), [
    'foldLevel: must be a whole number from -1 (fold nothing) to 3, not 7',
    'theme: must be a text, not 3',
    'selfChecks: must be true or false, not "on"',
    'folds.logging: must be a score from 0 to 3, or false, not "yes"',
    'folds.import: must be a score from 0 to 3, or false, not 2.5',
    'exclude[1]: must be a text, not 4',
    'callPatterns[0].method: is not a call pattern field',
    'folds.loging: no rule makes "loging" regions: the categories are ' + BUILT_IN_CATEGORIES.join(', '),
  ]);
  assert.equal(readConfig(dir).problems[0].file, '.lens.json');
});

test("a fold for a callPatterns category of the project's own is no problem", () => {
  const dir = configDir({ folds: { audit: 2 }, callPatterns: [{ category: 'audit', receivers: ['audit'] }] });
  assert.deepEqual(problemsOf(dir), []);
  assert.equal(loadConfig(dir).folds.audit, 2);
});

test('the old threshold, categories and scores are still read, each with a problem saying to rename it', () => {
  const dir = configDir({
    threshold: 0,
    categories: { logging: false, guard: true },
    scores: { logging: 3, comment: 2 },
  });
  const config = loadConfig(dir);
  assert.equal(config.foldLevel, 0);
  assert.equal(config.folds.logging, false, 'off wins over its old score');
  assert.equal(config.folds.comment, 2);
  assert.equal(config.folds.guard, 1, "categories' true says nothing");
  assert.deepEqual(problemsOf(dir), [
    'threshold: is now "foldLevel": still read, but rename it',
    'categories: is now "folds": still read, but rename it',
    'scores: is now "folds": still read, but rename it',
  ]);
});

test('"!entry" in a list takes that entry out of the defaults; one that is not there is a problem', () => {
  const dir = configDir({ exclude: ['!*.map', 'generated/**', '!nope.lock'], keepCommentMarkers: ['!XXX'] });
  const loaded = readConfig(dir);
  assert.ok(!loaded.config.exclude.includes('*.map'));
  assert.deepEqual(loaded.removed, { exclude: ['*.map'], keepCommentMarkers: ['XXX'] });
  assert.ok(loaded.config.exclude.includes('bun.lock'));
  assert.equal(loaded.config.exclude.at(-1), 'generated/**');
  assert.ok(!loaded.config.keepCommentMarkers.includes('XXX'));
  assert.deepEqual(problemsOf(dir), [`exclude: "!nope.lock" takes out nothing: "nope.lock" isn't in the defaults`]);
});

test('sources: each value says whether the defaults or the project set it', () => {
  const { sources, config } = readConfig(configDir({ theme: 'nord', folds: { guard: 2 }, exclude: ['gen/**'] }));
  assert.equal(sources.theme, 'project');
  assert.equal(sources.foldLevel, 'defaults');
  assert.equal(sources['folds.guard'], 'project');
  assert.equal(sources['folds.import'], 'defaults');
  assert.equal(sources['exclude.0'], 'defaults');
  assert.equal(sources['exclude.' + (config.exclude.length - 1)], 'project');
});

test('a file that is not JSON is one problem, and the defaults apply', () => {
  const dir = configDir('{ "foldLevel": 0, }');
  const loaded = readConfig(dir);
  assert.equal(loaded.config.foldLevel, 1);
  assert.equal(loaded.problems.length, 1);
  assert.match(loaded.problems[0].message, /isn't valid JSON/);
});

test('lens.schema.json names every config field and every built-in category, and the defaults check', () => {
  const schema = JSON.parse(readFileSync(join(import.meta.dir, '..', 'lens.schema.json'), 'utf8'));
  const deprecated = Object.keys(schema.properties).filter((field) => schema.properties[field].deprecated);
  assert.deepEqual(
    Object.keys(schema.properties)
      .filter((field) => !deprecated.includes(field))
      .sort(),
    [...CONFIG_FIELDS].sort(),
  );
  assert.deepEqual(deprecated.sort(), ['categories', 'scores', 'threshold']);
  assert.deepEqual(Object.keys(schema.properties.folds.properties), BUILT_IN_CATEGORIES);
  // DEFAULT_CONFIG throws on a problem in lens's own file; it loaded, so they check
  assert.ok(DEFAULT_CONFIG);
});

test('custom scores flow into regions', async () => {
  const config: LensConfig = {
    ...DEFAULT_CONFIG,
    folds: { ...DEFAULT_CONFIG.folds, guard: 3 },
  };
  const model = await analyzeSource(
    'x.ts',
    `
function f(x?: string) {
  if (!x) return null;
  return x.length;
}
`.trim(),
    config,
  );
  assert.ok(model);
  const guard = model.regions.find((r) => r.category === 'guard');
  assert.ok(guard);
  assert.equal(guard.score, 3); // visible at default threshold
});
