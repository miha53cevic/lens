import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { highlightSource, isBundledTheme, SUGGESTED_THEMES } from "../src/render/highlight.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";

const DEFAULT_THEME = DEFAULT_CONFIG.theme;

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

test("tokens are line-aligned and reconstruct the source exactly", async () => {
  const source = readFileSync(join(fixturesDir, "loadConfig.ts"), "utf8");
  const { tokens, fg, bg } = await highlightSource(source, "typescript", DEFAULT_THEME);
  const lines = source.split("\n");
  assert.equal(tokens.length, lines.length);
  for (let i = 0; i < lines.length; i++) {
    assert.equal(tokens[i].map(([text]) => text).join(""), lines[i], `line ${i + 1}`);
  }
  assert.match(fg, /^#/);
  assert.match(bg, /^#/);
});

test("tokens carry colors and handle tricky syntax", async () => {
  const source = 'const re = /a\\/b/g;\nconst t = `x ${1 + 2} /* not a comment */`;\n';
  const { tokens } = await highlightSource(source, "typescript", DEFAULT_THEME);
  assert.equal(tokens.length, source.split("\n").length);
  const colored = tokens.flat().filter(([, color]) => color !== null);
  assert.ok(colored.length > 0, "expected colored tokens");
});

test("themes switch colors; unknown themes are rejected", async () => {
  const source = 'const x = "hello";\n';
  const dark = await highlightSource(source, "typescript", "github-dark");
  const light = await highlightSource(source, "typescript", "github-light");
  assert.notEqual(dark.bg, light.bg, "themes should differ in background");
  await assert.rejects(
    () => highlightSource(source, "typescript", "not-a-theme"),
    /unknown theme/,
  );
});

test("non-classified languages: shiki colors when known, plain when not", async () => {
  const { shikiLangForFile } = await import("../src/render/highlight.ts");
  assert.equal(shikiLangForFile("config.json"), "json");
  assert.equal(shikiLangForFile("notes.md"), "markdown");
  assert.equal(shikiLangForFile("data.bin"), null);

  const json = await highlightSource('{ "a": 1 }\n', "json", DEFAULT_THEME);
  assert.ok(json.tokens.flat().some(([, color]) => color !== null), "json should get colors");

  const source = "first line\nsecond line\n";
  const plain = await highlightSource(source, null, DEFAULT_THEME);
  assert.equal(plain.tokens.length, source.split("\n").length);
  for (let i = 0; i < plain.tokens.length; i++) {
    assert.equal(plain.tokens[i].map(([text]) => text).join(""), source.split("\n")[i]);
    assert.ok(plain.tokens[i].every(([, color]) => color === null), "plain tokens carry no color");
  }
  assert.match(plain.fg, /^#/);
});

test("every suggested theme is a valid bundled theme", () => {
  for (const name of SUGGESTED_THEMES) {
    assert.ok(isBundledTheme(name), `${name} is not a bundled Shiki theme`);
  }
  assert.ok(SUGGESTED_THEMES.includes(DEFAULT_THEME));
});
