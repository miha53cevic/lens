import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseDiff, gitDiffTargets } from "../src/git.ts";

const SAMPLE = `diff --git a/src/api.ts b/src/api.ts
index 111..222 100644
--- a/src/api.ts
+++ b/src/api.ts
@@ -3,0 +4,2 @@
+const logger = new Logger("api");
+
@@ -10 +13,3 @@
+  if (!id) {
+    throw new Error("id is required");
+  }
diff --git a/src/Widget.tsx b/src/Widget.tsx
new file mode 100644
index 000..333
--- /dev/null
+++ b/src/Widget.tsx
@@ -0,0 +1,5 @@
+export const Widget = () => <div />;
diff --git a/src/legacy.ts b/src/legacy.ts
deleted file mode 100644
index 444..000
--- a/src/legacy.ts
+++ /dev/null
@@ -1,3 +0,0 @@
-old
diff --git a/README.md b/README.md
--- a/README.md
+++ b/README.md
@@ -1 +1 @@
+# changed
`;

test("parseDiff extracts statuses and new-side line numbers", () => {
  const parsed = parseDiff(SAMPLE);

  assert.deepEqual(parsed.deleted, ["src/legacy.ts"]);

  const api = parsed.files.find((f) => f.path === "src/api.ts");
  assert.ok(api);
  assert.equal(api.status, "modified");
  assert.deepEqual(api.changedLines, [4, 5, 13, 14, 15]);

  const widget = parsed.files.find((f) => f.path === "src/Widget.tsx");
  assert.ok(widget);
  assert.equal(widget.status, "added");
  assert.deepEqual(widget.changedLines, [1, 2, 3, 4, 5]);

  // unsupported files pass through here; gitDiffTargets filters by extension
  const readme = parsed.files.find((f) => f.path === "README.md");
  assert.ok(readme);
  assert.equal(readme.status, "modified");
});

test("parseDiff handles an empty diff", () => {
  assert.deepEqual(parseDiff(""), { files: [], deleted: [], renamed: [] });
});

const RENAME_SAMPLE = `diff --git a/old-name.ts b/new-name.ts
similarity index 100%
rename from old-name.ts
rename to new-name.ts
diff --git a/moved.ts b/moved-edited.ts
similarity index 87%
rename from moved.ts
rename to moved-edited.ts
--- a/moved.ts
+++ b/moved-edited.ts
@@ -2 +2 @@
+const changed = true;
`;

test("parseDiff: pure renames are listed; renames with edits stay modified files", () => {
  const parsed = parseDiff(RENAME_SAMPLE);
  assert.deepEqual(parsed.renamed, [{ from: "old-name.ts", to: "new-name.ts" }]);
  const edited = parsed.files.find((f) => f.path === "moved-edited.ts");
  assert.ok(edited, "rename-with-edits is a normal modified entry");
  assert.equal(edited.status, "modified");
  assert.deepEqual(edited.changedLines, [2]);
});

const REMOVAL_SAMPLE = `diff --git a/src/api.ts b/src/api.ts
--- a/src/api.ts
+++ b/src/api.ts
@@ -3,2 +3,3 @@
-const old1 = 1;
-const old2 = 2;
+const new1 = 1;
+const new2 = 2;
+const new3 = 3;
@@ -10,2 +11,0 @@
-function gone() {
-}
@@ -20 +20 @@
--decrement-looking line;
+something else;
`;

test("parseDiff captures removed lines with new-side anchors", () => {
  const parsed = parseDiff(REMOVAL_SAMPLE);
  const api = parsed.files[0];
  assert.equal(api.path, "src/api.ts");
  assert.deepEqual(api.removals, [
    // replacement: removed lines sit before the added block at new line 3
    { afterLine: 2, lines: ["const old1 = 1;", "const old2 = 2;"] },
    // pure deletion: new-side count 0, anchored after new line 11
    { afterLine: 11, lines: ["function gone() {", "}"] },
    // a removed line starting with "-" must not be mistaken for a header
    { afterLine: 19, lines: ["-decrement-looking line;"] },
  ]);
  assert.deepEqual(api.changedLines, [3, 4, 5, 20]);
});

test("gitDiffTargets keeps unsupported text files and skips binaries", () => {
  const dir = mkdtempSync(join(tmpdir(), "lens-git-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, encoding: "utf8" });
  try {
    git("init", "-q");
    git("config", "user.email", "t@t");
    git("config", "user.name", "t");
    writeFileSync(join(dir, "code.ts"), "export const a = 1;\n");
    writeFileSync(join(dir, "README.md"), "# hello\n");
    writeFileSync(join(dir, "logo.bin"), Buffer.from([0, 1, 2, 255, 0, 3]));
    git("add", "-A");
    git("commit", "-qm", "init");

    writeFileSync(join(dir, "code.ts"), "export const a = 2;\n");
    writeFileSync(join(dir, "README.md"), "# hello\n\nmore docs\n");
    writeFileSync(join(dir, "logo.bin"), Buffer.from([255, 254, 0, 7, 0, 9]));
    git("add", "-A");

    const result = gitDiffTargets(["--staged"], dir);
    const names = result.targets.map((t) => t.file.split("/").pop()).sort();
    assert.deepEqual(names, ["README.md", "code.ts"], "md kept, binary skipped");
    const readme = result.targets.find((t) => t.file.endsWith("README.md"));
    assert.ok(readme);
    assert.equal(readme.status, "modified");
    assert.ok(readme.changedLines.length > 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
