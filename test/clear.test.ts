import { test } from "bun:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { clearKinds, describeKinds } from "../src/cli-app/clear.ts";

const cli = join(import.meta.dir, "..", "src", "cli-app", "cli.ts");

/** A folder with three reviews' summaries in .lens/summary/, and the reader's settings beside them */
function savedData(): string {
  const root = mkdtempSync(join(tmpdir(), "lens-clear-"));
  for (const key of ["diff@main", "diff-head-1@main", "pr-87"]) {
    const dir = join(root, ".lens", "summary", key);
    mkdirSync(join(dir, "assets"), { recursive: true });
    writeFileSync(join(dir, "summary.json"), "{}");
    writeFileSync(join(dir, "assets", "a1.html"), "<p>preview</p>");
  }
  writeFileSync(join(root, ".lens", "settings.json"), '{"buildPreviews":false}');
  writeFileSync(join(root, ".lens", "server.json"), "{}");
  return root;
}

test("summaries: this review's folder, or every review's, and what each would remove", () => {
  const root = savedData();
  try {
    const [summaries] = describeKinds({ root, key: "diff@main" });
    assert.equal(summaries.id, "summaries");
    assert.deepEqual(summaries.plans, {
      this: { count: 1, paths: [".lens/summary/diff@main/"] },
      all: {
        count: 3,
        paths: [".lens/summary/diff-head-1@main/", ".lens/summary/diff@main/", ".lens/summary/pr-87/"],
      },
    });
    assert.equal(summaries.warning, null);
    // no review open (paths mode): only "all" is offered
    assert.deepEqual(Object.keys(describeKinds({ root, key: null })[0].plans), ["all"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("clearing this review's summary leaves the others, the settings and the server's file", () => {
  const root = savedData();
  try {
    const cleared = clearKinds({ root, key: "diff@main" }, { summaries: "this" });
    assert.deepEqual(cleared, { summaries: { count: 1, paths: [".lens/summary/diff@main/"] } });
    assert.ok(!existsSync(join(root, ".lens", "summary", "diff@main")));
    assert.ok(existsSync(join(root, ".lens", "summary", "pr-87", "summary.json")));
    assert.ok(existsSync(join(root, ".lens", "settings.json")));
    assert.ok(existsSync(join(root, ".lens", "server.json")));

    clearKinds({ root, key: "diff@main" }, { summaries: "all" });
    assert.ok(existsSync(join(root, ".lens", "summary")), "the folder itself stays");
    assert.equal(describeKinds({ root, key: "diff@main" })[0].plans.all!.count, 0);
    assert.ok(existsSync(join(root, ".lens", "settings.json")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an unknown kind, or a scope the kind doesn't offer, removes nothing", () => {
  const root = savedData();
  try {
    assert.throws(() => clearKinds({ root, key: "diff@main" }, { summaries: "all", settings: "all" }), /nothing called "settings"/);
    assert.throws(() => clearKinds({ root, key: null }, { summaries: "this" }), /can't be cleared for "this"/);
    assert.equal(describeKinds({ root, key: null })[0].plans.all!.count, 3);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an agent's run on this review is said beside its summaries, not refused", () => {
  const root = savedData();
  try {
    const bundle = { version: 1, units: [{ id: "a.ts#f", hash: "h1" }, { id: "a.ts#g", hash: "h2" }] };
    writeFileSync(join(root, ".lens", "summary", "diff@main", "bundle.json"), JSON.stringify(bundle));
    assert.match(describeKinds({ root, key: "diff@main" })[0].warning ?? "", /under way \(0 of 2 changes\)/);
    assert.equal(describeKinds({ root, key: "pr-87" })[0].warning, null, "another review's run isn't this one's");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("lens clear lists the kinds, and clears one review's summary or all of them", () => {
  const root = savedData();
  try {
    execFileSync("git", ["init", "-q"], { cwd: root });
    const lens = (...args: string[]) => execFileSync(process.execPath, [cli, "clear", ...args], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    assert.match(lens(), /^summaries {2}3 reviews\n {2}\.lens\/summary\/diff-head-1@main\//);
    assert.match(lens("summaries", "pr-87"), /cleared 1 review\n {2}- \.lens\/summary\/pr-87\//);
    assert.ok(!existsSync(join(root, ".lens", "summary", "pr-87")));
    assert.throws(() => lens("summaries", "pr-87"), /no summaries saved for "pr-87"/);
    assert.throws(() => lens("summaries", "../.."), /not a review's key/);
    assert.throws(() => lens("summaries"), /takes --all, or one review's key/);
    assert.match(lens("summaries", "--all"), /cleared 2 reviews/);
    assert.ok(existsSync(join(root, ".lens", "settings.json")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
