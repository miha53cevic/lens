import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { highlightSource, isBundledTheme, SUGGESTED_THEMES, themeAccent } from '../src/cli-app/render/highlight.ts';
import { DEFAULT_CONFIG } from '../src/cli-app/config.ts';
import { highlightFiles } from '../src/cli-app/render/web/server.ts';

const DEFAULT_THEME = DEFAULT_CONFIG.theme;

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

test('tokens are line-aligned and reconstruct the source exactly', async () => {
  const source = readFileSync(join(fixturesDir, 'loadConfig.ts'), 'utf8');
  const { tokens, fg, bg } = await highlightSource(source, 'typescript', DEFAULT_THEME);
  const lines = source.split('\n');
  assert.equal(tokens.length, lines.length);
  for (let i = 0; i < lines.length; i++) {
    assert.equal(tokens[i].map(([text]) => text).join(''), lines[i], `line ${i + 1}`);
  }
  assert.match(fg, /^#/);
  assert.match(bg, /^#/);
});

test('tokens carry colors and handle tricky syntax', async () => {
  const source = 'const re = /a\\/b/g;\nconst t = `x ${1 + 2} /* not a comment */`;\n';
  const { tokens } = await highlightSource(source, 'typescript', DEFAULT_THEME);
  assert.equal(tokens.length, source.split('\n').length);
  const colored = tokens.flat().filter(([, color]) => color !== null);
  assert.ok(colored.length > 0, 'expected colored tokens');
});

test('themes switch colors; unknown themes are rejected', async () => {
  const source = 'const x = "hello";\n';
  const dark = await highlightSource(source, 'typescript', 'github-dark');
  const light = await highlightSource(source, 'typescript', 'github-light');
  assert.notEqual(dark.bg, light.bg, 'themes should differ in background');
  await assert.rejects(() => highlightSource(source, 'typescript', 'not-a-theme'), /unknown theme/);
});

test("the viewer's accent is the theme's function-name color, matched as TextMate does", async () => {
  assert.equal((await themeAccent('vesper')).toLowerCase(), '#ffc799', 'an exact entity.name.function rule');
  assert.equal(await themeAccent('github-light'), '#6f42c1', 'entity.name covers entity.name.function');
  assert.equal(await themeAccent('min-light'), '#6f42c1', 'no function rule: support.function');
  await assert.rejects(() => themeAccent('not-a-theme'), /unknown theme/);
});

test("with no files to highlight, the page still takes the theme's own colors", async () => {
  const light = await highlightFiles([], 'github-light');
  assert.equal(light.bg.toLowerCase(), '#fff');
  assert.equal(light.fg.toLowerCase(), '#24292e');
});

test('a refresh re-tokenizes only the files whose text changed', async () => {
  const file = (name: string, source: string, language: 'typescript' | 'javascript' = 'typescript') => ({
    file: name,
    language,
    lineCount: source.split('\n').length,
    regions: [],
    source,
  });
  const text = (tokens: [string, string | null][][]) =>
    tokens.map((line) => line.map(([part]) => part).join('')).join('\n');
  const before = [file('a.ts', 'const a = 1;\n'), file('b.ts', 'const b = 1;\n'), file('c.ts', 'const c = 1;\n')];
  const first = await highlightFiles(before, 'github-dark');

  // a.ts as it was, b.ts edited, c.ts gone, d.ts new, and the order changed
  const after = [file('d.ts', 'const d = 1;\n'), file('b.ts', 'const b = 2;\n'), file('a.ts', 'const a = 1;\n')];
  const second = await highlightFiles(after, 'github-dark', { files: before, tokens: first });
  assert.equal(second.tokens[2], first.tokens[0], 'the unchanged file keeps its tokens');
  assert.notEqual(second.tokens[1], first.tokens[1]);
  after.forEach((each, index) =>
    assert.equal(text(second.tokens[index]), each.source, each.file + ' shows its own text'),
  );

  // the same text under another language, or in another theme, is tokenized again
  const asJs = [file('a.ts', 'const a = 1;\n', 'javascript')];
  assert.notEqual(
    (await highlightFiles(asJs, 'github-dark', { files: before, tokens: first })).tokens[0],
    first.tokens[0],
  );
  const light = await highlightFiles(before, 'github-light', { files: before, tokens: first });
  assert.notEqual(light.tokens[0], first.tokens[0]);
  assert.notDeepEqual(light.tokens[0], first.tokens[0], "the other theme's colors");
});

test('removed lines get their own tokens, block by block, and a refresh keeps them only while they stay the same', async () => {
  const removals = [
    { afterLine: 0, oldStart: 1, lines: ['const old = "a";', 'const gone = 2;'] },
    { afterLine: 1, oldStart: 4, lines: ['old();'] },
  ];
  const file = (lines = removals) => ({
    file: 'a.ts',
    language: 'typescript' as const,
    lineCount: 1,
    regions: [],
    source: "const now = 'a';\n",
    removals: lines,
  });
  const first = await highlightFiles([file()], 'github-dark');
  const blocks = first.removed[0];
  assert.deepEqual(
    blocks.map((block) => block.map((line) => line.map(([part]) => part).join(''))),
    removals.map((block) => block.lines),
    'line-aligned with each block',
  );
  assert.ok(
    blocks.flat(2).some(([, color]) => color !== null),
    'colored',
  );
  assert.deepEqual((await highlightFiles([{ ...file(), removals: undefined }], 'github-dark')).removed, [[]]);

  const same = await highlightFiles([file()], 'github-dark', { files: [file()], tokens: first });
  assert.equal(same.removed[0], first.removed[0], 'kept');
  const fewer = await highlightFiles([file(removals.slice(0, 1))], 'github-dark', { files: [file()], tokens: first });
  assert.equal(fewer.removed[0].length, 1, 'other removed lines, the same text: tokenized again');
});

test('non-classified languages: shiki colors when known, plain when not', async () => {
  const { shikiLangForFile } = await import('../src/cli-app/render/highlight.ts');
  assert.equal(shikiLangForFile('config.json'), 'json');
  assert.equal(shikiLangForFile('notes.md'), 'markdown');
  assert.equal(shikiLangForFile('data.bin'), null);

  const json = await highlightSource('{ "a": 1 }\n', 'json', DEFAULT_THEME);
  assert.ok(
    json.tokens.flat().some(([, color]) => color !== null),
    'json should get colors',
  );

  const source = 'first line\nsecond line\n';
  const plain = await highlightSource(source, null, DEFAULT_THEME);
  assert.equal(plain.tokens.length, source.split('\n').length);
  for (let i = 0; i < plain.tokens.length; i++) {
    assert.equal(plain.tokens[i].map(([text]) => text).join(''), source.split('\n')[i]);
    assert.ok(
      plain.tokens[i].every(([, color]) => color === null),
      'plain tokens carry no color',
    );
  }
  assert.match(plain.fg, /^#/);
});

test('every suggested theme is a valid bundled theme', () => {
  for (const name of SUGGESTED_THEMES) {
    assert.ok(isBundledTheme(name), `${name} is not a bundled Shiki theme`);
  }
  assert.ok(SUGGESTED_THEMES.includes(DEFAULT_THEME));
});
