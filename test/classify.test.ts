import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeSource } from "../src/classify/index.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import type { FoldRegion } from "../src/model.ts";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

async function regionsOf(source: string, file = "sample.ts"): Promise<FoldRegion[]> {
  const model = await analyzeSource(file, source, DEFAULT_CONFIG);
  assert.ok(model, "expected a fold model");
  return model.regions;
}

test("loadConfig fixture: the canonical AI-padded file", async () => {
  const source = readFileSync(join(fixturesDir, "loadConfig.ts"), "utf8");
  const regions = await regionsOf(source, "loadConfig.ts");

  const byCategory = Object.groupBy(regions, (r) => r.category);

  // 5 imports on lines 1-5
  assert.equal(byCategory["import"]?.length, 1);
  assert.deepEqual(
    [byCategory["import"]![0].startLine, byCategory["import"]![0].endLine],
    [1, 5],
  );
  assert.match(byCategory["import"]![0].summary, /5 imports — fs, path, zod/);

  // JSDoc block on lines 9-16
  assert.equal(byCategory["comment"]?.length, 1);
  assert.deepEqual(
    [byCategory["comment"]![0].startLine, byCategory["comment"]![0].endLine],
    [9, 16],
  );
  assert.match(byCategory["comment"]![0].summary, /^doc "Loads the user's configuration/);

  // Guards: "// Validate input" comment + two throw-only ifs (18-24), plus the
  // ENOENT early-return inside the catch (33-36) — log + return is still a guard.
  assert.equal(byCategory["guard"]?.length, 2);
  assert.deepEqual(
    [byCategory["guard"]![0].startLine, byCategory["guard"]![0].endLine],
    [18, 24],
  );
  assert.match(byCategory["guard"]![0].summary, /2 guards → throw TypeError/);
  assert.deepEqual(
    [byCategory["guard"]![1].startLine, byCategory["guard"]![1].endLine],
    [33, 36],
  );
  assert.match(byCategory["guard"]![1].summary, /1 guard → return DEFAULTS \+ log/);

  // logger.debug (34) is inside the guard region; only logger.error (37) folds
  // on its own. The catch itself has real logic, so no error-boilerplate.
  assert.equal(byCategory["logging"]?.length, 1);
  assert.equal(byCategory["error-boilerplate"], undefined);

  // Real logic stays visible: path.join (26), throw err rethrow (38), parse+merge (41-42).
  const foldedLines = new Set<number>();
  for (const r of regions) {
    if (r.score <= DEFAULT_CONFIG.threshold) {
      for (let l = r.startLine; l <= r.endLine; l++) foldedLines.add(l);
    }
  }
  for (const mustSee of [26, 28, 29, 30, 31, 38, 41, 42]) {
    assert.ok(!foldedLines.has(mustSee), `line ${mustSee} must stay visible`);
  }
});

test("any pure early-exit if folds as a guard, whatever it returns", async () => {
  const regions = await regionsOf(`
function f(x: number) {
  if (x < 0) {
    return computeFallback(x);
  }
  if (!x) return null;
  return x * 2;
}
`.trim());
  const guards = regions.filter((r) => r.category === "guard");
  assert.equal(guards.length, 1); // consecutive guards merge into one run
  assert.match(guards[0].summary, /2 guards → return computeFallback\(x\), return null/);
});

test("mid-function guards fold too", async () => {
  const regions = await regionsOf(`
function visit(node: Node) {
  const body = node.childForFieldName("body");
  if (!body || body.type !== "statement_block") return;
  const statements = body.children;
  if (statements.length === 0) return;
  doWork(statements);
}
`.trim());
  const guards = regions.filter((r) => r.category === "guard");
  assert.equal(guards.length, 2); // separated by real statements → two regions
  assert.deepEqual(guards.map((g) => [g.startLine, g.endLine]), [[3, 3], [5, 5]]);
});

test("an if with real logic in its body is not a guard", async () => {
  const regions = await regionsOf(`
function f(x: number) {
  if (x < 0) {
    counter.increment();
    return null;
  }
  return x;
}
`.trim());
  assert.equal(regions.filter((r) => r.category === "guard").length, 0);
});

test("loop guards fold: continue and break", async () => {
  const regions = await regionsOf(`
for (const item of items) {
  if (!item.valid) continue;
  if (item.stop) break;
  process(item);
}
`.trim());
  const guards = regions.filter((r) => r.category === "guard");
  assert.equal(guards.length, 1);
  assert.match(guards[0].summary, /2 guards → continue, break/);
});

test("guard with else branch does not fold", async () => {
  const regions = await regionsOf(`
function f(x: number) {
  if (x < 0) {
    throw new Error("negative");
  } else {
    doWork(x);
  }
  return x;
}
`.trim());
  assert.equal(regions.filter((r) => r.category === "guard").length, 0);
});

test("pure log-and-rethrow catch folds as error-boilerplate", async () => {
  const regions = await regionsOf(`
function f() {
  try {
    doWork();
  } catch (err) {
    console.error("work failed", err);
    throw err;
  }
}
`.trim());
  const catches = regions.filter((r) => r.category === "error-boilerplate");
  assert.equal(catches.length, 1);
  assert.match(catches[0].summary, /catch \(err\): log \+ rethrow/);
  // the logging inside must not double-fold
  assert.equal(regions.filter((r) => r.category === "logging").length, 0);
});

test("catch that swallows silently (no statements) stays visible", async () => {
  const regions = await regionsOf(`
function f() {
  try {
    doWork();
  } catch (err) {
  }
}
`.trim());
  assert.equal(regions.filter((r) => r.category === "error-boilerplate").length, 0);
});

test("logging detection: console and *Logger fold, lookalikes do not", async () => {
  const regions = await regionsOf(`
function f(catalog: Catalog, requestLogger: Logger) {
  console.debug("starting");
  requestLogger.info("request in");
  catalog.log("not a logger method receiver but ends in log");
  const n = logger.count("used result — not folded");
  return n;
}
`.trim());
  const logs = regions.filter((r) => r.category === "logging");
  // console.debug + requestLogger.info are adjacent lines → merged into one run
  assert.equal(logs.length, 1);
  assert.deepEqual([logs[0].startLine, logs[0].endLine], [2, 3]);
});

test("TODO comments stay visible", async () => {
  const regions = await regionsOf(`
// TODO: this is load-bearing, do not fold
const x = 1;
// just narrating the obvious here
const y = 2;
`.trim());
  const comments = regions.filter((r) => r.category === "comment");
  assert.equal(comments.length, 2);
  const todo = comments.find((c) => c.summary.includes("TODO"));
  assert.ok(todo && todo.score > DEFAULT_CONFIG.threshold, "TODO must score above threshold");
  const noise = comments.find((c) => !c.summary.includes("TODO"));
  assert.ok(noise && noise.score <= DEFAULT_CONFIG.threshold, "narration must fold");
});

test("inline trailing comments are not folded", async () => {
  const regions = await regionsOf(`const x = compute(); // explains the line`);
  assert.equal(regions.filter((r) => r.category === "comment").length, 0);
});

test("imports grouped across blank lines, summary names modules", async () => {
  const regions = await regionsOf(`
import a from "pkg-a";
import b from "pkg-b";

import { c } from "./local/thing";
const x = 1;
`.trim());
  const imports = regions.filter((r) => r.category === "import");
  assert.equal(imports.length, 1);
  assert.deepEqual([imports[0].startLine, imports[0].endLine], [1, 4]);
  assert.match(imports[0].summary, /3 imports — pkg-a, pkg-b, thing/);
});

test("disabled category emits no regions", async () => {
  const config = {
    ...DEFAULT_CONFIG,
    categories: { ...DEFAULT_CONFIG.categories, logging: false },
  };
  const model = await analyzeSource("x.ts", `console.log("hi");`, config);
  assert.ok(model);
  assert.equal(model.regions.filter((r) => r.category === "logging").length, 0);
});

test("javascript and tsx files parse with the same rules", async () => {
  const js = await analyzeSource("x.js", `import a from "a";\nconsole.log("hi");`, DEFAULT_CONFIG);
  assert.ok(js);
  assert.equal(js.regions.length, 2);

  const tsx = await analyzeSource(
    "x.tsx",
    `import React from "react";\nexport const App = () => <div>hi</div>;`,
    DEFAULT_CONFIG,
  );
  assert.ok(tsx);
  assert.equal(tsx.regions.filter((r) => r.category === "import").length, 1);
});

test("tsx: guards and logging fold inside components, JSX comments stay", async () => {
  const source = `
import React from "react";

export function UserCard({ user }: Props) {
  if (!user) {
    return null;
  }
  console.debug("rendering user card");
  return (
    <div className="card">
      {/* layout note that lives inside JSX */}
      <h2>{user.name}</h2>
    </div>
  );
}
`.trim();
  const model = await analyzeSource("UserCard.tsx", source, DEFAULT_CONFIG);
  assert.ok(model);
  assert.equal(model.language, "tsx");
  const categories = model.regions.map((r) => r.category).sort();
  assert.deepEqual(categories, ["guard", "import", "logging"]);
  // the JSX return and the comment inside it stay visible
  const foldedLines = new Set<number>();
  for (const r of model.regions) {
    for (let l = r.startLine; l <= r.endLine; l++) foldedLines.add(l);
  }
  for (let l = 9; l <= 14; l++) {
    assert.ok(!foldedLines.has(l), `JSX line ${l} must stay visible`);
  }
});

test("keep markers pin the guard, catch or data region that takes them in", async () => {
  const regions = await regionsOf(`
function f(user: User | null, input: string) {
  // TODO: remove once the API is fixed
  if (!user) throw new Error("no user");
  try {
    run(input);
  } catch (e) {
    // FIXME: swallowing this hides real failures
    console.error(e);
  }
  const OPTIONS = {
    // @ts-ignore
    mode: "fast",
    retries: 3,
  };
}
`.trim());
  const byCat = (c: string) => regions.find((r) => r.category === c);
  assert.deepEqual([byCat("guard")?.startLine, byCat("guard")?.endLine], [2, 3]);
  assert.deepEqual([byCat("error-boilerplate")?.startLine, byCat("error-boilerplate")?.endLine], [7, 8]);
  assert.deepEqual([byCat("data")?.startLine, byCat("data")?.endLine], [10, 14]);
  for (const r of regions) assert.equal(r.score, 4, `${r.category} ${r.startLine}-${r.endLine} must stay open`);
});

test("a trailing comment above a guard doesn't pull its statement into the fold", async () => {
  const regions = await regionsOf(`
function f(x: number) {
  const a = compute(x); // needed below
  if (!a) return null;
  return a;
}
`.trim());
  const guard = regions.find((r) => r.category === "guard");
  assert.deepEqual([guard?.startLine, guard?.endLine], [3, 3]);
});

test("calls, guards and catches whose arguments or exits do work stay visible", async () => {
  const regions = await regionsOf(`
async function run(i: number, tx: Tx, user: User | null) {
  console.log(i++);
  logger.info(await save());
  if (!user) {
    logger.warn(await audit.record(user));
    return null;
  }
  if (!tx.ok) throw await rollback(tx);
  try {
    await go();
  } catch (e) {
    logger.error(await undo(e));
    throw e;
  }
  console.log("done", i);
  return i;
}
`.trim());
  assert.deepEqual(regions.map((r) => [r.category, r.startLine, r.endLine]), [["logging", 15, 15]]);
});

test("a catch that returns its log call exits too: it stays visible", async () => {
  const regions = await regionsOf(`
function f() {
  try {
    return save();
  } catch (err) {
    return logger.error(err);
  }
}
`.trim());
  assert.equal(regions.filter((r) => r.category === "error-boilerplate").length, 0);
});

test("a guard, catch or accessor sharing its line with other code isn't folded", async () => {
  const guard = await regionsOf(`
function f(x: string) {
  const a = compute(x); if (!a) return null;
  if (!a.ok) return null; // why
  return a.value;
}
`.trim());
  assert.deepEqual(guard.map((r) => [r.category, r.startLine, r.endLine]), [["guard", 3, 3]],
    "a trailing comment keeps the guard");

  const caught = await regionsOf(`
async function f() {
  try { await save(); } catch (e) { logger.error(e); }
}
`.trim());
  assert.deepEqual(caught, []);

  const accessor = await regionsOf(`
class Box {
  private _x = 1; get x() { return this._x; }
  other() { return compute(2); }
}
`.trim());
  assert.deepEqual(accessor, []);
});

test("javascript: setters and delegation fold as in typescript", async () => {
  const regions = await regionsOf(`
class A {
  set name(v) { this._name = v; }
  send(msg) { this.bus.send(msg); }
  log(...args) { this.inner.log(...args); }
  load(id, retries = 3) { return this.repo.load(id, retries); }
}
`.trim(), "sample.js");
  assert.deepEqual(regions.map((r) => [r.category, r.startLine, r.endLine, r.summary]),
    [["accessor", 2, 4, "3 accessors — set name, send(), log() (3 lines)"]]);
});

test("code sharing an import's line isn't folded with it", async () => {
  const sameLine = await regionsOf(`import "./polyfill"; main();\nfunction main() { return 1; }`);
  assert.equal(sameLine.filter((r) => r.category === "import").length, 0);

  const commented = await regionsOf(`import a from "a"; // why\nimport b from "b";\nimport c from "c";\nuse(a, b, c);`);
  assert.deepEqual(commented.filter((r) => r.category === "import").map((r) => [r.startLine, r.endLine]), [[1, 3]],
    "a trailing comment keeps the import in its group");
});

test("directive comments stay visible", async () => {
  const regions = await regionsOf(`
/// <reference types="node" />
// @ts-check
import fs from "fs";
export const x = fs;
`.trim());
  const comment = regions.find((r) => r.category === "comment");
  assert.ok(comment && comment.score > DEFAULT_CONFIG.threshold);
});

test("same-name delegation that adds, drops or computes arguments is not an accessor", async () => {
  const regions = await regionsOf(`
class Repo {
  async save(entity: E) {
    return this.db.save(await this.validate(entity));
  }

  force(entity: E) { return this.db.force(entity, { force: true }); }

  load(id: string, retries = 3) { return this.repo.load(id); }
}
`.trim());
  assert.equal(regions.filter((r) => r.category === "accessor").length, 0);
});

test("guards whose condition does work stay visible; a labeled continue keeps its label", async () => {
  const regions = await regionsOf(`
async function handle(user: User, rows: Row[][]) {
  if (await limiter.consume(user.id)) throw new TooMany();
  if (attempts++ > limit) return;
  if (!h) return async () => { await cleanup(); };
  outer: for (const row of rows) {
    for (const cell of row) {
      if (cell.skip) continue outer;
      use(cell);
    }
  }
}
`.trim());
  const guards = regions.filter((r) => r.category === "guard");
  // line 4: the callback runs later, so returning it is no work
  assert.deepEqual(guards.map((g) => g.startLine), [4, 7]);
  assert.match(guards[1].summary, /^1 guard → continue outer/);
});

test("callbacks run now count as work; defaults aren't forwarding; rest pass-through is", async () => {
  const regions = await regionsOf(`
function f(list: number[], x: boolean) {
  if (!x) return list.forEach((i) => { seen[i] = true; });
  if (list.some((i) => (seen[i] = true))) return 1;
  return 1;
}
class A {
  load(retries = 3) { return this.repo.load(retries); }
  log(...args: unknown[]) { this.inner.log(...args); }
}
`.trim());
  assert.equal(regions.filter((r) => r.category === "guard").length, 0);
  const accessors = regions.filter((r) => r.category === "accessor");
  assert.deepEqual(accessors.map((r) => [r.startLine, r.summary.replace(/ \(\d+ lines?\)$/, "")]), [[8, "1 accessor — log()"]]);

  const blockThenCode = await regionsOf(`import a from "a"; /* note */ main();\nimport b from "b";\nimport c from "c";\nmain();`);
  assert.deepEqual(blockThenCode.filter((r) => r.category === "import").map((r) => [r.startLine, r.endLine]), [[2, 3]]);
});

test("data: a computed key that calls something isn't data", async () => {
  const regions = await regionsOf(`
const table = {
  [makeKey()]: 1,
  b: 2,
};
`.trim());
  assert.equal(regions.filter((r) => r.category === "data").length, 0);
});

test("getters and setters with real logic are not accessors", async () => {
  const regions = await regionsOf(`
class Temp {
  get fahrenheit() { return this._c * 9 / 5 + 32; }
  set celsius(v: number) { this._c = (v - 32) * 5 / 9; }
  get raw() { return this._c; }
  set raw(v: number) { this._c = v; }
  set reset(v: number) { this._c = DEFAULT; }
}
`.trim());
  const accessors = regions.filter((r) => r.category === "accessor");
  assert.equal(accessors.length, 1);
  assert.deepEqual([accessors[0].startLine, accessors[0].endLine], [4, 5]);
  assert.match(accessors[0].summary, /2 accessors — get raw, set raw/);
});

test("data: one statement with several constants names them all", async () => {
  const regions = await regionsOf(`
export const A = 1,
  B = { x: 1 },
  C = 3;
`.trim());
  const data = regions.filter((r) => r.category === "data");
  assert.equal(data.length, 1);
  assert.match(data[0].summary, /^3 constants — A, B, C \(3 lines\)/);
});

test("trivial accessors fold; real methods do not", async () => {
  const regions = await regionsOf(`
class Store {
  private _items: Item[] = [];

  constructor(seed: Item[]) {
    this._items = seed;
  }

  get items() { return this._items; }
  set items(v: Item[]) { this._items = v; }
  size() { return this._items.length; }

  addAll(items: Item[]) {
    for (const item of items) this.validate(item);
    this._items.push(...items);
  }
}
`.trim());
  const accessors = regions.filter((r) => r.category === "accessor");
  assert.equal(accessors.length, 1); // consecutive run merges
  assert.match(accessors[0].summary, /3 accessors — get items, set items, size\(\)/);
  // constructor and addAll stay visible
  const folded = new Set<number>();
  for (const r of regions) for (let l = r.startLine; l <= r.endLine; l++) folded.add(l);
  for (const mustSee of [4, 5, 6, 13, 14, 15]) {
    assert.ok(!folded.has(mustSee), `line ${mustSee} must stay visible`);
  }
});

test("one-liners with real logic are not accessors; genuine delegation is", async () => {
  const regions = await regionsOf(`
class Resource {
  private throwUnlessPubliclyAccessible() {
    assertPublic(this.visibility, this.owner);
  }

  static fromEntity(entity: ResourceEntity) {
    return plainToInstance(Resource, entity);
  }

  transform(entity: ResourceEntity) {
    return buildDto(entity.id, { deep: true });
  }

  close() { this.socket.close(); }
  send(msg: Message) { return this.bus.send(msg); }
}
`.trim());
  const accessors = regions.filter((r) => r.category === "accessor");
  assert.equal(accessors.length, 1);
  // only the forwarding pair folds: same-named callee, verbatim param pass-through
  assert.match(accessors[0].summary, /2 accessors — close\(\), send\(\)/);
});

test("files with syntax errors are never folded", async () => {
  const model = await analyzeSource("broken.ts", `
import { readFileSync } from "node:fs";
import { z } from "zod";

export function loadConfig(path: string {
  if (!path) throw new Error("path required");
  return readFileSync(path, "utf8");
}
`.trim(), DEFAULT_CONFIG);
  assert.ok(model);
  assert.equal(model.parseError, true);
  // the imports and the guard would normally fold — not in a broken file
  assert.deepEqual(model.regions, []);
});

test("barrel files fold to a single pill", async () => {
  const barrel = await analyzeSource("index.ts", `
export * from "./api";
export { UserCard } from "./components/UserCard";
export type { Config } from "./config";
import "./side-effect";
`.trim(), DEFAULT_CONFIG);
  assert.ok(barrel);
  assert.equal(barrel.regions.length, 1);
  assert.equal(barrel.regions[0].category, "barrel");
  assert.match(barrel.regions[0].summary, /barrel file — re-exports 3 modules: api, UserCard, config; runs side-effect$/);

  const notBarrel = await analyzeSource("index.ts", `
export * from "./api";
export const VERSION = "1.0";
`.trim(), DEFAULT_CONFIG);
  assert.ok(notBarrel);
  assert.equal(notBarrel.regions.filter((r) => r.category === "barrel").length, 0);
});

test("telemetry calls fold; results that are used do not", async () => {
  const regions = await regionsOf(`
function checkout(cart: Cart) {
  metrics.increment("checkout.started");
  analytics.track("Checkout", { items: cart.size });
  const t = stats.timer("checkout");
  const total = cart.total();
  telemetry.record("checkout.total", total);
  return total;
}
`.trim());
  const telemetry = regions.filter((r) => r.category === "telemetry");
  // increment+track merge into one run; record is separate; the assigned timer stays
  assert.equal(telemetry.length, 2);
  assert.deepEqual(telemetry.map((r) => [r.startLine, r.endLine]), [[2, 3], [6, 6]]);
});

test("data: multi-line pure-literal constants fold", async () => {
  const regions = await regionsOf(`
export const ERROR_MESSAGES = {
  notFound: "resource not found",
  timeout: "request timed out",
  // grouped by kind
  denied: "access denied",
} as const;

const DIRECTIONS = [
  "north",
  "south",
] as const;

enum Level {
  Low = 1,
  High = 2,
}
`.trim());
  const data = regions.filter((r) => r.category === "data");
  assert.equal(data.length, 3);
  assert.match(data[0].summary, /const ERROR_MESSAGES — object, 3 keys \(6 lines\)/);
  assert.match(data[1].summary, /const DIRECTIONS — array, 2 items/);
  assert.match(data[2].summary, /enum Level — 2 members/);
});

test("data: runs of one-liner constants merge; short groups stay visible", async () => {
  const regions = await regionsOf(`
const MAX_RETRIES = 3;
const TIMEOUT_MS = 5000;
const BASE_URL = "https://api.example.com";
doSetup();
const ONLY_ONE = 42;
doWork();
`.trim());
  const data = regions.filter((r) => r.category === "data");
  assert.equal(data.length, 1); // ONLY_ONE spans 1 line — stays visible
  assert.deepEqual([data[0].startLine, data[0].endLine], [1, 3]);
  assert.match(data[0].summary, /3 constants — MAX_RETRIES, TIMEOUT_MS, BASE_URL/);
});

test("data: anything computed does not fold", async () => {
  const regions = await regionsOf(`
const FROM_CALL = new Set([
  "a",
  "b",
]);
const WITH_IDENTIFIER = {
  timeout: DEFAULT_TIMEOUT,
  retries: 3,
};
const WITH_SPREAD = {
  ...BASE,
  extra: 1,
};
const WITH_TEMPLATE = {
  url: \`\${host}/api\`,
};
let mutable = {
  key: "value",
  other: "thing",
};
`.trim());
  assert.equal(regions.filter((r) => r.category === "data").length, 0);
});

test("suppression comments never fold", async () => {
  const regions = await regionsOf(`
// eslint-disable-next-line no-explicit-any
const a = compute() as any;
// @ts-expect-error upstream types are wrong
const b = broken();
// just narrating here
const c = simple();
`.trim());
  const comments = regions.filter((r) => r.category === "comment");
  assert.equal(comments.length, 3);
  const [eslint, tsExpect, narration] = comments;
  assert.ok(eslint.score > 3, "eslint-disable must never fold");
  assert.ok(tsExpect.score > 3, "@ts-expect-error must never fold");
  assert.ok(narration.score <= DEFAULT_CONFIG.threshold, "narration still folds");
});

test("re-exports group with imports instead of splitting the run", async () => {
  const regions = await regionsOf(`
import { a } from "./a";
export { b } from "./b";
import { c } from "./c";
const logic = a + c;
`.trim());
  const imports = regions.filter((r) => r.category === "import");
  assert.equal(imports.length, 1);
  assert.deepEqual([imports[0].startLine, imports[0].endLine], [1, 3]);
  assert.match(imports[0].summary, /2 imports \+ 1 re-export — a, b, c/);
});

test("regions never overlap and are sorted", async () => {
  const source = readFileSync(join(fixturesDir, "loadConfig.ts"), "utf8");
  const regions = await regionsOf(source);
  for (let i = 1; i < regions.length; i++) {
    assert.ok(regions[i].startLine > regions[i - 1].endLine,
      `region ${i} overlaps or is out of order`);
  }
});
