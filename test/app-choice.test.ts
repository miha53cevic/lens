import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { choiceArgs, choiceCommand, choiceLabel, choiceProblem, parseChoice, splitArgs, type ReviewChoice } from "../src/desktop/shared/choice.ts";
import { lensCli, runLens } from "../src/desktop/main/cli.ts";
import { makeViewerRepo } from "./fixtures/viewerRepo.ts";

// the CLI as the tests run it: this Node on the sources (the app uses its own executable instead)
const cli = { ...lensCli(join(import.meta.dirname, ".."), process.execPath), env: process.env };

test("choiceArgs: each choice is the words you would type after `lens`", () => {
  assert.deepEqual(choiceArgs({ kind: "diff", range: "worktree" }), ["diff"]);
  assert.deepEqual(choiceArgs({ kind: "diff", range: "staged" }), ["diff", "--staged"]);
  assert.deepEqual(choiceArgs({ kind: "diff", range: "branch", base: "main" }), ["diff", "main...HEAD"]);
  assert.deepEqual(choiceArgs({ kind: "diff", range: "custom", args: 'HEAD~3 -- "my dir/a.ts"' }), ["diff", "HEAD~3", "--", "my dir/a.ts"]);
  assert.deepEqual(choiceArgs({ kind: "pr", ref: " 482 " }), ["pr", "482"]);
});

test("choiceCommand and choiceLabel: what the picker and the tab show", () => {
  assert.equal(choiceCommand({ kind: "diff", range: "worktree" }), "lens diff");
  assert.equal(choiceCommand({ kind: "diff", range: "custom", args: 'HEAD~3 -- "my dir/a.ts"' }), 'lens diff HEAD~3 -- "my dir/a.ts"');
  assert.equal(choiceCommand({ kind: "pr", ref: "" }), "lens pr");
  assert.equal(choiceLabel({ kind: "diff", range: "staged" }), "staged changes");
  assert.equal(choiceLabel({ kind: "diff", range: "branch", base: "main" }), "vs main");
  assert.equal(choiceLabel({ kind: "pr", ref: "482" }), "PR #482");
  assert.equal(choiceLabel({ kind: "pr", ref: "https://github.com/acme/storefront/pull/482/files" }), "PR #482");
});

test("choiceProblem: an empty choice, or a lens flag typed as a git diff argument", () => {
  assert.equal(choiceProblem({ kind: "diff", range: "staged" }), null);
  assert.equal(choiceProblem({ kind: "pr", ref: "  " }), "Enter a PR number or URL");
  assert.equal(choiceProblem({ kind: "diff", range: "custom", args: " " }), "Type the git diff arguments");
  assert.equal(choiceProblem({ kind: "diff", range: "custom", args: "HEAD~1 --json" }), "--json is a lens flag, not a git diff argument");
  assert.equal(choiceProblem({ kind: "diff", range: "custom", args: "HEAD~1 --stat" }), null, "git's own flags pass");
  assert.deepEqual(splitArgs(`a 'b c'  "" d`), ["a", "b c", "", "d"]);
  assert.equal(choiceProblem({ kind: "diff", range: "branch", base: "--output=x" }), '"--output=x" is not a branch name');
  assert.equal(choiceProblem({ kind: "pr", ref: "--json" }), '"--json" is not a PR number or URL');
});

test("parseChoice: what a page sends is a choice or nothing, never a command line", () => {
  assert.deepEqual(parseChoice({ kind: "diff", range: "staged", args: ["--port", "1"] }), { kind: "diff", range: "staged" });
  assert.deepEqual(parseChoice({ kind: "diff", range: "branch", base: "main" }), { kind: "diff", range: "branch", base: "main" });
  assert.deepEqual(parseChoice({ kind: "pr", ref: "482", extra: true }), { kind: "pr", ref: "482" });
  for (const bad of [null, "diff", ["diff"], { kind: "paths" }, { kind: "diff", range: "all" }, { kind: "pr", ref: 482 },
    { kind: "diff", range: "custom", args: ["--json"] }, { kind: "diff", range: "custom", args: "x".repeat(2001) }]) {
    assert.equal(parseChoice(bad), null, JSON.stringify(bad)?.slice(0, 40));
  }
});

// The contract: the real CLI takes each kind of choice. --json makes it print the fold model
// and exit instead of serving, so this checks the arguments without starting a viewer.
test("every kind of choice is something the real lens CLI opens", { timeout: 60_000 }, async () => {
  const dir = makeViewerRepo(); // orders.ts and its test changed in the working tree
  const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, encoding: "utf8" });
  const files = async (choice: ReviewChoice): Promise<string[]> => {
    assert.equal(choiceProblem(choice), null);
    const model = JSON.parse(await runLens(cli, [...choiceArgs(choice), "--json"], dir));
    return model.files.map((file: { file: string }) => file.file).sort();
  };
  try {
    assert.deepEqual(await files({ kind: "diff", range: "worktree" }), ["src/orders.test.ts", "src/orders.ts"]);

    git("add", "src/orders.ts");
    assert.deepEqual(await files({ kind: "diff", range: "staged" }), ["src/orders.ts"]);
    assert.deepEqual(await files({ kind: "diff", range: "custom", args: "--staged -- src/orders.ts" }), ["src/orders.ts"]);

    git("checkout", "-qb", "feature");
    git("-c", "user.email=lens@test", "-c", "user.name=lens", "commit", "-qm", "orders");
    writeFileSync(join(dir, "src/orders.ts"), "export const later = 1;\n"); // not part of the branch's own changes
    const base = git("branch", "--list", "main", "master").replace("*", "").trim();
    assert.deepEqual(await files({ kind: "diff", range: "branch", base }), ["src/orders.ts"]);

    // a PR needs a GitHub remote: the CLI's answer shows it took the words as a PR reference
    git("remote", "add", "origin", join(dir, "elsewhere.git"));
    await assert.rejects(runLens(cli, [...choiceArgs({ kind: "pr", ref: "482" }), "--json"], dir), /no origin GitHub remote here/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
