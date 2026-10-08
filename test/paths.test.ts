import { test } from "node:test";
import assert from "node:assert/strict";
import { join, resolve } from "node:path";
import { relPath, toPosix } from "../src/paths.ts";
import { summaryArgs } from "../src/summary/store.ts";

test("relPath is /-separated on every OS, and falls back to the path itself", () => {
  const root = resolve("repo");
  assert.equal(relPath(root, join(root, "src", "summary", "units.ts")), "src/summary/units.ts");
  assert.equal(relPath(root, root), toPosix(root));
  assert.ok(!toPosix(join("a", "b")).includes("\\"));
});

test("summaryArgs prints the diff's arguments as a shell takes them", () => {
  assert.equal(summaryArgs("diff", ["--staged"]), "--staged");
  assert.equal(summaryArgs("diff", []), "");
  assert.equal(summaryArgs("pr", ["87"]), "pr 87");
  assert.equal(summaryArgs("diff", ["main...feature", "--", "my dir/a.ts"]), 'main...feature -- "my dir/a.ts"');
  assert.equal(summaryArgs("diff", ['say "hi"']), '"say \\"hi\\""');
});
