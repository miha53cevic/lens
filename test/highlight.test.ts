import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  highlightSource,
  isBundledTheme,
  SUGGESTED_THEMES,
  themeAccent,
  type ViewerToken,
} from '../src/cli-app/render/highlight.ts';
import { FONT_ITALIC } from '../src/cli-app/render/fontStyle.ts';
import { DEFAULT_CONFIG } from '../src/cli-app/config.ts';
import { highlightFiles, oldSideLines } from '../src/cli-app/render/web/server.ts';

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
  const text = (tokens: ViewerToken[][]) => tokens.map((line) => line.map(([part]) => part).join('')).join('\n');
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
    { afterLine: 2, oldStart: 4, lines: ['old();'] },
  ];
  const file = (lines = removals) => ({
    file: 'a.ts',
    language: 'typescript' as const,
    lineCount: 2,
    regions: [],
    source: "const now = 'a';\nkeep();\n",
    changedLines: [1],
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

test('the old side is rebuilt from the new one, and removed lines are colored in it', async () => {
  // old: /**, " * old doc", " */", "f();" — new: /**, " * new doc", " */", "f();"
  const file = {
    file: 'a.ts',
    language: 'typescript' as const,
    lineCount: 4,
    regions: [],
    source: '/**\n * new doc\n */\nf();\n',
    changedLines: [2],
    removals: [{ afterLine: 1, oldStart: 2, lines: [' * old doc'] }],
  };
  assert.deepEqual(oldSideLines(file), ['/**', ' * old doc']);
  const { removed, tokens } = await highlightFiles([file], 'github-dark');
  const colors = (line: ViewerToken[]) => [...new Set(line.map(([, color]) => color))];
  assert.deepEqual(colors(removed[0][0][0]), colors(tokens[0][1]), "a comment's line, colored as the comment");
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

test("lens's own Andromeda Italic: known by name, the default, and its italics reach the tokens", async () => {
  assert.equal(DEFAULT_THEME, 'andromeda-italic');
  assert.deepEqual(SUGGESTED_THEMES, ['andromeda-italic', 'github-dark', 'github-light', 'monokai']);
  assert.ok(isBundledTheme('andromeda-italic'));
  assert.ok(isBundledTheme('vesper'), "Shiki's other themes still work through --theme and .lens.json");
  const { tokens, bg } = await highlightSource('// note\nexport const x = 1;', 'typescript', 'andromeda-italic');
  assert.equal(bg.toLowerCase(), '#23262e');
  assert.deepEqual(tokens[0], [['// note', '#A0A1A7CC', FONT_ITALIC]], 'a comment, in italics');
  const style = (text: string) => tokens[1].find(([part]) => part === text)?.[2];
  assert.equal(style('export'), FONT_ITALIC, 'a keyword, in italics');
  assert.equal(style('x'), undefined, 'a token without a style carries none');
});

test("both sides tokenized with the old side's kept lines skipped give the tokens each side whole gives", async () => {
  const whole = (text: string) => highlightSource(text, 'typescript', 'github-dark');
  const check = async (file: Parameters<typeof oldSideLines>[0], why: string) => {
    const result = await highlightFiles(
      [{ ...file, file: 'a.ts', language: 'typescript', lineCount: 0, regions: [] }],
      'github-dark',
    );
    assert.deepEqual(result.tokens[0], (await whole(file.source)).tokens, why + ': the new side');
    const old = (await whole(oldSideLines(file).join('\n'))).tokens;
    (file.removals ?? []).forEach((block, at) =>
      block.lines.forEach((_, line) =>
        assert.deepEqual(result.removed[0][at][line], old[block.oldStart - 1 + line], why + ': a removed line'),
      ),
    );
  };
  const kept = Array.from({ length: 30 }, (_, index) => `const v${index} = \`${index}\`; // ${index}`);
  // a removed line that opened a comment: the kept lines after it are a comment on the old side
  await check(
    {
      source: ['a();', ...kept, 'b();', ...kept, 'c();'].join('\n'),
      changedLines: [1],
      removals: [
        { afterLine: 0, oldStart: 1, lines: ['/* opened'] },
        { afterLine: 32, oldStart: 34, lines: ['*/ closed();', 'gone();'] },
      ],
    },
    'a state a removed line changed',
  );
  // removals far apart, with added lines between: the old side catches up with the new one
  await check(
    {
      source: ['x();', ...kept, 'y();', ...kept].join('\n'),
      changedLines: [1, 32],
      removals: [
        { afterLine: 0, oldStart: 1, lines: ['const s = "a";'] },
        { afterLine: 31, oldStart: 32, lines: ['f(`', '`);'] },
      ],
    },
    'removals around added lines',
  );
  // CRLF: the \r of a kept line isn't the line's, on either side
  await check(
    {
      source: ['a();', ...kept, 'b();'].join('\r\n'),
      changedLines: [1],
      removals: [{ afterLine: 0, oldStart: 1, lines: ['old();\r'] }],
    },
    'CRLF',
  );
});

test('a markdown fence is colored by its language whatever was highlighted before it', async () => {
  // a fresh process: the fence's language (yaml) was loaded by nothing else first
  const script = `
    const { highlightSource } = await import(${JSON.stringify(join(dirname(fileURLToPath(import.meta.url)), '../src/cli-app/render/highlight.ts'))});
    const { tokens } = await highlightSource('# a\\n\\n\`\`\`yaml\\nkey: value\\n\`\`\`\\n', 'markdown', 'github-dark');
    console.log(JSON.stringify(tokens[3]));
  `;
  const fresh = JSON.parse(execFileSync(process.execPath, ['-e', script], { encoding: 'utf8' }));
  assert.ok(new Set(fresh.map(([, color]: [string, string]) => color)).size > 1, 'key and value colored apart');
});

test('a big diff is tokenized on worker threads, with the same tokens as on this one', async () => {
  const { highlightAll } = await import('../src/cli-app/render/highlightPool.ts');
  const source = readFileSync(join(fixturesDir, 'loadConfig.ts'), 'utf8');
  // past the size the pool takes on
  const jobs = Array.from({ length: Math.ceil(250_000 / source.length) }, (_, index) => ({
    source: source + '\n'.repeat(index),
    language: 'typescript',
    theme: 'github-dark',
    old: null,
  }));
  const pooled = await highlightAll(jobs);
  assert.equal(pooled.length, jobs.length);
  for (const [index, job] of jobs.entries()) {
    assert.deepEqual(pooled[index].tokens, (await highlightSource(job.source, 'typescript', 'github-dark')).tokens);
  }
});
