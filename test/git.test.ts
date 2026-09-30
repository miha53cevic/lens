import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseDiff, parseRawEntries, gitDiffTargets, readBlob } from "../src/git.ts";

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
    { afterLine: 2, oldStart: 3, lines: ["const old1 = 1;", "const old2 = 2;"] },
    // pure deletion: new-side count 0, anchored after new line 11
    { afterLine: 11, oldStart: 10, lines: ["function gone() {", "}"] },
    // a removed line starting with "-" must not be mistaken for a header
    { afterLine: 19, oldStart: 20, lines: ["-decrement-looking line;"] },
  ]);
  assert.deepEqual(api.changedLines, [3, 4, 5, 20]);
});

const SHA_A = "a".repeat(40);
const SHA_B = "b".repeat(40);
const SHA_C = "c".repeat(40);
const ZEROS = "0".repeat(40);

const RAW_SAMPLE = [
  `:100644 100644 ${SHA_A} ${SHA_B} M\0src/api.ts\0`,
  `:000000 100644 ${ZEROS} ${SHA_C} A\0src/Widget.tsx\0`,
  `:100644 100644 ${SHA_A} ${ZEROS} M\0src/worktree.ts\0`, // new side = working tree
  `:100644 100644 ${SHA_A} ${SHA_B} R87\0old-name.ts\0new-name.ts\0`,
  `:160000 160000 ${SHA_A} ${SHA_B} M\0vendor/submodule\0`,
  " CLAUDE.md | 2 +-\n 5 files changed\n", // pass-through --stat noise after the records
].join("");

test("parseRawEntries maps new-side paths to blob SHAs", () => {
  const shas = new Map(parseRawEntries(RAW_SAMPLE).filter((e) => e.newSha).map((e) => [e.path, e.newSha]));
  assert.equal(shas.get("src/api.ts"), SHA_B);
  assert.equal(shas.get("src/Widget.tsx"), SHA_C);
  assert.equal(shas.get("new-name.ts"), SHA_B, "renames map the NEW path");
  assert.equal(shas.has("old-name.ts"), false);
  assert.equal(shas.has("src/worktree.ts"), false, "zero SHA = read from disk");
  assert.equal(shas.has("vendor/submodule"), false, "submodule commits are not blobs");
  assert.equal(shas.size, 3);
});

test("parseDiff reads changed lines from combined (merge-conflict) hunk headers", () => {
  const combined = `diff --cc src/a.ts
index 111,222..333
--- a/src/a.ts
+++ b/src/a.ts
@@@ -3,1 -3,1 +3,2 @@@
++const x = 1;
++const y = 2;
`;
  assert.deepEqual(parseDiff(combined).files[0].changedLines, [3, 4]);
});

test("parseRawEntries keeps old-side SHAs, including deletions", () => {
  const raw = `:100644 000000 ${SHA_C} ${ZEROS} D\0src/gone.ts\0` + RAW_SAMPLE;
  const byPath = new Map(parseRawEntries(raw).map((e) => [e.path, e]));
  assert.equal(byPath.get("src/api.ts")?.oldSha, SHA_A);
  assert.equal(byPath.get("src/Widget.tsx")?.oldSha, null); // added
  assert.equal(byPath.get("src/worktree.ts")?.newSha, null); // working tree
  assert.equal(byPath.get("new-name.ts")?.oldSha, SHA_A);
  assert.equal(byPath.get("vendor/submodule")?.oldSha, null);
  assert.deepEqual(byPath.get("src/gone.ts"), { path: "src/gone.ts", oldSha: SHA_C, newSha: null, status: "D" });
});

test("parseRawEntries handles an empty diff", () => {
  assert.equal(parseRawEntries("").length, 0);
});

/** Runs `fn` in a fresh temp git repo (branch "main"), cleaned up afterwards. */
function withRepo(fn: (dir: string, git: (...args: string[]) => string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "lens-git-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, encoding: "utf8" });
  try {
    git("init", "-q", "-b", "main");
    git("config", "user.email", "t@t");
    git("config", "user.name", "t");
    fn(dir, git);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("gitDiffTargets: ref-to-ref diffs read the new side from git, not the working tree", () => {
  withRepo((dir, git) => {
    writeFileSync(join(dir, "a.ts"), "export const a = 1;\n");
    git("add", "-A");
    git("commit", "-qm", "base");

    git("checkout", "-qb", "feature");
    writeFileSync(join(dir, "a.ts"), "export const a = 2;\n");
    writeFileSync(join(dir, "b.ts"), "export const b = 1;\n");
    git("add", "-A");
    git("commit", "-qm", "feature work");
    git("checkout", "-q", "main"); // b.ts is now absent from the working tree

    const result = gitDiffTargets(["main...feature"], dir);
    const names = result.targets.map((t) => t.file.split("/").pop()).sort();
    assert.deepEqual(names, ["a.ts", "b.ts"], "added-on-feature files are not dropped");

    const added = result.targets.find((t) => t.file.endsWith("b.ts"))!;
    assert.equal(added.status, "added");
    assert.ok(added.newBlob);
    assert.equal(readBlob(added.newBlob!, dir), "export const b = 1;\n");

    const modified = result.targets.find((t) => t.file.endsWith("a.ts"))!;
    assert.ok(modified.newBlob);
    assert.equal(readBlob(modified.newBlob!, dir), "export const a = 2;\n", "feature's content, not main's");
  });
});

test("gitDiffTargets: working-tree diffs carry no blob and read from disk", () => {
  withRepo((dir, git) => {
    writeFileSync(join(dir, "a.ts"), "export const a = 1;\n");
    git("add", "-A");
    git("commit", "-qm", "base");

    writeFileSync(join(dir, "a.ts"), "export const a = 2;\n");
    const result = gitDiffTargets([], dir);
    assert.equal(result.targets.length, 1);
    assert.equal(result.targets[0].newBlob, undefined);
  });
});

test("gitDiffTargets keeps unsupported text files and skips binaries", () => {
  withRepo((dir, git) => {
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
  });
});
