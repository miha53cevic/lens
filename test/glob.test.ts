import test from "node:test";
import assert from "node:assert/strict";
import { compilePatterns, matchesAny } from "../src/cli-app/glob.ts";

test("exclude-style patterns match how the docs say they do", () => {
  const regexes = compilePatterns([
    "package-lock.json", "*.min.js", "*.map", "__tests__/**",
  ]);
  const matches = (p: string) => matchesAny(p, regexes);

  assert.ok(matches("package-lock.json"));
  assert.ok(matches("apps/web/package-lock.json"), "matches anywhere in the path");
  assert.ok(!matches("package.json"));
  assert.ok(!matches("my-package-lock.json"), "segment boundary respected");

  assert.ok(matches("dist/app.min.js"));
  assert.ok(!matches("app.min.js.orig"), "anchored at the end");
  assert.ok(matches("bundle.js.map"));

  assert.ok(matches("src/__tests__/helper.ts"), "** crosses segments");
  assert.ok(!matches("src/__tests__x/helper.ts"));
});

test("* does not cross path segments", () => {
  const regexes = compilePatterns(["src/*.ts"]);
  assert.ok(matchesAny("src/a.ts", regexes));
  assert.ok(!matchesAny("src/deep/a.ts", regexes));
});

test("**/ also matches no directory at all", () => {
  const regexes = compilePatterns(["**/*.test.ts", "src/**/x.ts", "**/__tests__/**"]);
  assert.ok(matchesAny("x.test.ts", regexes));
  assert.ok(matchesAny("a/b/x.test.ts", regexes));
  assert.ok(matchesAny("src/x.ts", regexes));
  assert.ok(matchesAny("src/a/b/x.ts", regexes));
  assert.ok(!matchesAny("srcx.ts", regexes));
  assert.ok(matchesAny("__tests__/a.ts", regexes));
});
