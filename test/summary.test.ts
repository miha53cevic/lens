import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseDiff } from "../src/git.ts";
import { extractUnits, checkCoverage, citeableLabels, type UnitFileInput } from "../src/summary/units.ts";
import { summaryKey, readStored, writeStored, type Bundle } from "../src/summary/store.ts";
import { validateResult } from "../src/summary/validate.ts";
import { prepareBundle, renderUnit } from "../src/summary/bundle.ts";
import { loadDiff, collectUnits, commitLog } from "../src/summary/collect.ts";
import { buildSummaryView } from "../src/summary/view.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";

/** Builds a unit input from two versions of a file, via a real unified=0 diff. */
function inputFor(file: string, oldSource: string | null, newSource: string | null, isTest = false): UnitFileInput {
  const dir = mkdtempSync(join(tmpdir(), "lens-units-"));
  try {
    const a = join(dir, "a"), b = join(dir, "b");
    writeFileSync(a, oldSource ?? "");
    writeFileSync(b, newSource ?? "");
    let out = "";
    try {
      execFileSync("git", ["diff", "--no-index", "--unified=0", "--no-color", a, b], { encoding: "utf8" });
    } catch (err) {
      out = (err as { stdout: string }).stdout; // exit 1 = files differ
    }
    const header = out.replace(/^--- .*$/m, "--- a/" + file).replace(/^\+\+\+ .*$/m, "+++ b/" + file);
    const parsed = parseDiff(header).files[0];
    return {
      file,
      oldSource,
      newSource,
      changedLines: parsed?.changedLines ?? [],
      removals: parsed?.removals ?? [],
      isTest,
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function unitsFor(input: UnitFileInput) {
  const units = await extractUnits(input);
  assert.deepEqual(checkCoverage(input, units), [], "every changed/removed line is in exactly one unit");
  return units;
}

const OLD_REPO = `import { db } from "../db";

export async function findOrders(userId: string): Promise<Order[]> {
  const rows = await db.query("SELECT * FROM orders ORDER BY created_at DESC", [userId]);
  return rows.map(toOrder);
}

function toOrder(row: any) {
  return { id: row.id, total: row.total_cents / 100 };
}

function gone() {
  return 1;
}

export class Svc {
  private limit = 10;
  run() { return this.limit; }
}
`;

const NEW_REPO = `import { db } from "../db";
import type { PageOpts } from "./types";

/** Fetches one page. */
export async function findOrders(userId: string, opts: PageOpts = {}): Promise<Order[]> {
  const limit = Math.min(opts.limit ?? 50, 200);
  const rows = await db.query("SELECT * FROM orders ORDER BY id LIMIT $2", [userId, limit]);
  return rows.map(toOrder);
}

function toOrder(row: any) {
  return { id: row.id, total: row.total_cents };
}

export class Svc {
  private limit = 20;
  run() { return this.limit; }
  stop() {}
}

router.get("/orders", async (req, res) => {
  res.json(await findOrders(req.user.id));
});
`;

test("units: functions, methods, class members, top-level calls, deleted functions, module leftovers", async () => {
  const units = await unitsFor(inputFor("src/repo.ts", OLD_REPO, NEW_REPO));
  const byId = new Map(units.map((u) => [u.id, u]));

  const find = byId.get("src/repo.ts#findOrders");
  assert.equal(find?.kind, "function");
  assert.equal(find?.status, "modified");
  // the doc comment above belongs to the function
  assert.deepEqual(find?.ranges, [{ start: 4, end: 9 }]);
  assert.ok(find?.changedLines.includes(4));

  assert.equal(byId.get("src/repo.ts#toOrder")?.status, "modified");
  assert.equal(byId.get("src/repo.ts#gone")?.status, "deleted");
  assert.deepEqual(byId.get("src/repo.ts#gone")?.ranges, []);
  assert.equal(byId.get("src/repo.ts#Svc.limit")?.kind, "property");
  assert.equal(byId.get("src/repo.ts#Svc.stop")?.status, "new");
  assert.equal(byId.get("src/repo.ts#Svc.run"), undefined, "an untouched method is no unit");
  assert.equal(byId.get('src/repo.ts#router.get("/orders")')?.kind, "call");
  assert.equal(byId.get("src/repo.ts#(module)")?.kind, "module"); // the new import
});

test("units: TSX components, memo/forwardRef wrappers and hooks", async () => {
  const oldSrc = `export function List({ items }: Props) {
  return <ul>{items.map((i) => <li key={i}>{i}</li>)}</ul>;
}
`;
  const newSrc = `import { memo, forwardRef } from "react";

export const List = memo(function List({ items }: Props) {
  const onClick = () => console.log("x");
  return <ul className="list" onClick={onClick}>{items.map((i) => <li key={i}>{i}</li>)}</ul>;
});

export const Input = forwardRef((props: P, ref) => <input ref={ref} {...props} />);

export function useItems(id: string) {
  return fetch("/items/" + id);
}

const helper = () => 1;
`;
  const units = await unitsFor(inputFor("src/List.tsx", oldSrc, newSrc));
  const byId = new Map(units.map((u) => [u.id, u]));
  assert.equal(byId.get("src/List.tsx#List")?.kind, "component");
  assert.equal(byId.get("src/List.tsx#List")?.status, "modified");
  assert.equal(byId.get("src/List.tsx#Input")?.kind, "component");
  assert.equal(byId.get("src/List.tsx#useItems")?.kind, "hook");
  assert.equal(byId.get("src/List.tsx#helper")?.kind, "function");
  // the inline handler belongs to its component, not a unit of its own
  assert.equal(byId.get("src/List.tsx#onClick"), undefined);
});

test("units: capitalized functions in .ts files are not components", async () => {
  const units = await unitsFor(inputFor("src/f.ts", null, "export function Factory() { return 1; }\n"));
  assert.equal(units[0].kind, "function");
  assert.equal(units[0].status, "new");
});

test("units: formatting-only changes are flagged", async () => {
  const units = await unitsFor(inputFor("src/f.ts", "function a(x){return x+1}\n", "function a(x) {\n  return x + 1\n}\n"));
  assert.equal(units[0].formattingOnly, true);
});

test("units: test files, unsupported files, syntax errors and deleted files are whole-file units", async () => {
  const testUnits = await unitsFor(inputFor("src/a.test.ts", "it('a', () => {});\n", "it('a', () => {});\nit('b', () => {});\n", true));
  assert.deepEqual(testUnits.map((u) => [u.id, u.kind]), [["src/a.test.ts#(file)", "file"]]);

  const json = await unitsFor(inputFor("config.json", '{"a":1}\n', '{"a":2}\n'));
  assert.equal(json[0].id, "config.json#(file)");

  const broken = await unitsFor(inputFor("src/b.ts", "const a = 1;\n", "const a = ;\nfunction (\n"));
  assert.equal(broken[0].kind, "file");

  const deleted = await extractUnits({ file: "src/gone.ts", oldSource: "a\nb\n", newSource: null, changedLines: [], removals: [], isTest: false });
  assert.equal(deleted[0].status, "deleted");
  assert.deepEqual(deleted[0].removals, [{ afterLine: 0, oldStart: 1, lines: ["a", "b", ""] }]);
});

test("units: hashes change with the code; labels are the changed and removed lines", async () => {
  const input = inputFor("src/f.ts", "function a() {\n  return 1;\n}\n", "function a() {\n  return 2;\n}\n");
  const [unit] = await unitsFor(input);
  assert.deepEqual([...citeableLabels(unit)].sort(), ["N2", "O2"]);
  const [other] = await unitsFor(inputFor("src/f.ts", "function a() {\n  return 1;\n}\n", "function a() {\n  return 3;\n}\n"));
  assert.notEqual(unit.hash, other.hash);
  assert.match(renderUnit(unit, input.newSource!), /O2 -   return 1;\n\s+N2 \+   return 2;/);
});

test("summaryKey is readable and filesystem-safe", () => {
  assert.equal(summaryKey("diff", []), "diff");
  assert.equal(summaryKey("diff", ["--staged"]), "diff-staged");
  assert.equal(summaryKey("pr", ["87"]), "pr-87");
  assert.equal(summaryKey("diff", ["main...feature/x"]), "diff-main...feature-x");
  assert.ok(summaryKey("diff", ["a".repeat(100)]).length <= 60);
});

function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "lens-validate-"));
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src/jobs.ts"), "import { findOrders } from './repo';\nconst o = await findOrders(u);\nconsole.log(o);\n");
  return root;
}

const BUNDLE: Bundle = {
  version: 1,
  key: "diff-staged",
  command: "diff",
  args: ["--staged"],
  createdAt: "",
  units: [
    { id: "src/repo.ts#findOrders", file: "src/repo.ts", name: "findOrders", kind: "function", status: "modified", hash: "h1", labels: ["N5", "N6", "O4"], done: false },
    { id: "src/repo.ts#toOrder", file: "src/repo.ts", name: "toOrder", kind: "function", status: "modified", hash: "h2", labels: ["N11"], done: false },
    { id: "src/repo.ts#fetchAll", file: "src/repo.ts", name: "fetchAll", kind: "function", status: "new", hash: "h3", labels: ["N20"], done: false },
    { id: "src/repo.ts#getAll", file: "src/repo.ts", name: "getAll", kind: "function", status: "deleted", hash: "h4", labels: ["O30"], done: false },
  ],
};

const ok = (extra: object = {}) => ({ headline: "Does a thing", gist: "does it", needsLook: false, changes: [], breaks: [], ...extra });

test("validate: accepts grounded claims and drops the rest with reasons", () => {
  const root = fixtureRoot();
  try {
    const out = validateResult(BUNDLE, {
      units: {
        "src/repo.ts#findOrders": ok({
          needsLook: true,
          changes: [
            { when: "Called without a limit", before: "all orders", now: "first 50", line: "N5" },
            { when: "Removed path", before: "x", now: "y", line: "o4" }, // case-insensitive label
            { when: "Context line", before: null, now: "y", line: "N9" },
            { when: "x".repeat(70), before: null, now: "y", line: "N5" },
          ],
          breaks: [
            { summary: "caller gets 50", callers: ["src/jobs.ts:2", "src/jobs.ts:3", "src/nope.ts:1", "../etc/passwd:1"] },
            { summary: "all bad", callers: ["src/jobs.ts:99"] },
          ],
        }),
        "src/repo.ts#toOrder": ok({ headline: "h".repeat(81) }),
        "src/repo.ts#fetchAll": ok({ renamedFrom: "src/repo.ts#getAll" }),
        "src/other.ts#x": ok(),
      },
      flows: [
        { title: "Paging", path: "repo → jobs", units: { "src/repo.ts#findOrders": "repo", "src/repo.ts#fetchAll": "repo" } },
        { title: "Solo", path: "x", units: { "src/repo.ts#findOrders": "repo" } },
      ],
    }, root, null);

    assert.deepEqual(out.accepted, ["src/repo.ts#findOrders", "src/repo.ts#fetchAll"]);
    const find = out.stored.units["src/repo.ts#findOrders"];
    assert.equal(find.hash, "h1");
    assert.deepEqual(find.changes.map((c) => c.line), ["N5", "O4"]);
    assert.deepEqual(find.breaks, [{ summary: "caller gets 50", callers: ["src/jobs.ts:2"] }]);
    assert.equal(out.stored.units["src/repo.ts#fetchAll"].renamedFrom, "src/repo.ts#getAll");
    assert.deepEqual(out.stored.flows.map((f) => f.title), ["Paging"]);

    const reasons = out.dropped.join("\n");
    assert.match(reasons, /changes\[2\]: line "N9" is not a changed or removed line/);
    assert.match(reasons, /changes\[3\]: when\/now must be 1–60 chars/);
    assert.match(reasons, /"src\/jobs.ts:3" — that line doesn't mention findOrders/);
    assert.match(reasons, /"src\/nope.ts:1" — file not found/);
    assert.match(reasons, /"\.\.\/etc\/passwd:1" must be a path relative to the repository root/);
    assert.match(reasons, /breaks\[1\]: no valid callers left/);
    assert.match(reasons, /toOrder: headline 81 chars, max 80 — unit dropped/);
    assert.match(reasons, /src\/other.ts#x: unknown unit id/);
    assert.match(reasons, /flows\[1\] "Solo": a flow needs 2\+ known units/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("validate: callers are stored trimmed; over-long flow layers are reported", () => {
  const root = fixtureRoot();
  try {
    const out = validateResult(BUNDLE, {
      units: { "src/repo.ts#findOrders": ok({ breaks: [{ summary: "s", callers: ["  src/jobs.ts:2 "] }] }) },
      flows: [{ title: "F", path: "a → b", units: { "src/repo.ts#findOrders": "a-very-long-layer-name", "src/repo.ts#toOrder": "b" } }],
    }, root, null);
    assert.deepEqual(out.stored.units["src/repo.ts#findOrders"].breaks[0].callers, ["src/jobs.ts:2"]);
    assert.equal(out.stored.flows[0].units["src/repo.ts#findOrders"], "");
    assert.match(out.dropped.join("\n"), /layer for src\/repo.ts#findOrders 22 chars, max 12 — left blank/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("validate: rejects a non-object result and bad renamedFrom", () => {
  const out = validateResult(BUNDLE, [], "/nonexistent", null);
  assert.deepEqual(out.accepted, []);
  assert.match(out.dropped[0], /"units" object/);
  const bad = validateResult(BUNDLE, { units: { "src/repo.ts#toOrder": ok({ renamedFrom: "src/repo.ts#findOrders" }) } }, "/nonexistent", null);
  assert.match(bad.dropped.join("\n"), /renamedFrom must be the id of a deleted unit/);
  assert.equal(bad.stored.units["src/repo.ts#toOrder"].renamedFrom, undefined);
});

test("validate: submits merge with earlier ones and flows merge by title", () => {
  const first = validateResult(BUNDLE, { units: { "src/repo.ts#findOrders": ok() }, flows: [
    { title: "Paging", path: "a", units: { "src/repo.ts#findOrders": "repo", "src/repo.ts#toOrder": "repo" } },
  ] }, "/nonexistent", null);
  const second = validateResult(BUNDLE, { units: { "src/repo.ts#toOrder": ok() }, flows: [
    { title: "Paging", path: "b", units: { "src/repo.ts#findOrders": "repo", "src/repo.ts#toOrder": "repo" } },
  ] }, "/nonexistent", first.stored);
  assert.deepEqual(Object.keys(second.stored.units).sort(), ["src/repo.ts#findOrders", "src/repo.ts#toOrder"]);
  assert.deepEqual(second.stored.flows.map((f) => f.path), ["b"]);
});

test("prepare → submit → view round trip, with re-prepare skipping done units and stale marks", async () => {
  const dir = mkdtempSync(join(tmpdir(), "lens-summary-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, encoding: "utf8" });
  try {
    git("init", "-q");
    git("config", "user.email", "t@t");
    git("config", "user.name", "t");
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, "src/repo.ts"), OLD_REPO);
    writeFileSync(join(dir, "src/jobs.ts"), "import { findOrders } from './repo';\nconst o = await findOrders(u);\n");
    git("add", "-A");
    git("commit", "-qm", "init");
    git("commit", "-q", "--allow-empty", "-m", "second: empty");
    assert.equal(commitLog(["HEAD~1", "--", "src"], dir), "- second: empty", "a -- pathspec is not a revision");
    writeFileSync(join(dir, "src/repo.ts"), NEW_REPO);
    git("add", "-A");

    const diff = await loadDiff("diff", ["--staged"], dir, DEFAULT_CONFIG);
    const units = await collectUnits(diff, DEFAULT_CONFIG, dir);
    const sources = new Map([["src/repo.ts", NEW_REPO]]);
    const prep = { root: diff.root, cwd: dir, key: "diff-staged", command: "diff" as const, args: ["--staged"], label: null, commits: "", units, sources };
    const first = prepareBundle(prep);
    assert.equal(first.todo, units.length);
    assert.equal(readFileSync(join(diff.root, ".lens/.gitignore"), "utf8").trim().split("\n").pop(), "*");
    assert.ok(existsSync(join(first.dir, "tasks.md")));
    assert.equal(git("status", "--porcelain", "--untracked-files=all").includes(".lens"), false, ".lens ignores itself");

    const bundle = JSON.parse(readFileSync(join(first.dir, "bundle.json"), "utf8")) as Bundle;
    const find = bundle.units.find((u) => u.id === "src/repo.ts#findOrders")!;
    const outcome = validateResult(bundle, { units: {
      "src/repo.ts#findOrders": ok({
        needsLook: true,
        changes: [{ when: "No limit", before: "all", now: "first 50", line: find.labels.find((l) => l.startsWith("N"))! }],
        breaks: [{ summary: "job gets 50", callers: ["src/jobs.ts:2"] }],
      }),
    } }, diff.root, null);
    assert.deepEqual(outcome.dropped, []);
    writeStored(diff.root, "diff-staged", outcome.stored);

    const again = prepareBundle(prep);
    assert.equal(again.done, 1);
    assert.equal(again.todo, units.length - 1);
    assert.doesNotMatch(readFileSync(join(again.dir, "tasks.md"), "utf8"), /## src\/repo.ts#findOrders/);

    const view = buildSummaryView({ root: diff.root, cwd: dir, key: "diff-staged", args: "--staged", units });
    const v = view.units.find((u) => u.id === "src/repo.ts#findOrders")!;
    assert.equal(view.command, "/lens-review --staged");
    assert.equal(v.stale, false);
    assert.equal(v.summary?.breaks[0].callers[0].lines.find((l) => l.n === 2)?.text, "const o = await findOrders(u);");

    // the code changes after the summary: the unit goes stale
    writeFileSync(join(dir, "src/repo.ts"), NEW_REPO.replace("50", "25"));
    git("add", "-A");
    const later = await collectUnits(await loadDiff("diff", ["--staged"], dir, DEFAULT_CONFIG), DEFAULT_CONFIG, dir);
    const staleView = buildSummaryView({ root: diff.root, cwd: dir, key: "diff-staged", args: "--staged", units: later });
    const s = staleView.units.find((u) => u.id === "src/repo.ts#findOrders")!;
    assert.equal(s.stale, true);
    assert.equal(s.summary, null);
    assert.ok(readStored(diff.root, "diff-staged"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
