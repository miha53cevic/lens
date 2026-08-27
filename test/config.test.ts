import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { existsSync } from "node:fs";
import { DEFAULT_CONFIG, loadConfig, initConfig, resetConfig, findConfigPath } from "../src/config.ts";
import { analyzeSource } from "../src/classify/index.ts";
import type { LensConfig } from "../src/model.ts";

function configDir(json: object): string {
  const dir = mkdtempSync(join(tmpdir(), "lens-config-"));
  writeFileSync(join(dir, ".lens.json"), JSON.stringify(json));
  return dir;
}

test("defaults come from lens.defaults.json", () => {
  assert.equal(DEFAULT_CONFIG.threshold, 1);
  assert.equal(DEFAULT_CONFIG.theme, "vesper");
  assert.equal(DEFAULT_CONFIG.callPatterns.length, 2);
  assert.ok(DEFAULT_CONFIG.keepCommentMarkers.includes("TODO"));
  assert.equal(DEFAULT_CONFIG.keepDirective, "lens:keep");
  assert.ok(DEFAULT_CONFIG.exclude.includes("package-lock.json"));
});

test(".lens.json extends the base: scalars override, maps merge, lists extend", () => {
  const dir = configDir({
    threshold: 0,
    categories: { logging: false },
    callPatterns: [{ category: "audit", receivers: ["audit"] }],
    keepCommentMarkers: ["SECURITY"],
  });
  const config = loadConfig(dir);
  assert.equal(config.threshold, 0);
  assert.equal(config.theme, "vesper"); // inherited
  assert.equal(config.categories.logging, false);
  assert.equal(config.categories.guard, true); // inherited
  assert.equal(config.callPatterns.length, 3); // 2 base + 1 custom
  assert.ok(config.keepCommentMarkers.includes("TODO"));
  assert.ok(config.keepCommentMarkers.includes("SECURITY"));
});

test('"base": false replaces the built-in rules entirely', () => {
  const dir = configDir({
    base: false,
    callPatterns: [{ category: "audit", receivers: ["audit"] }],
  });
  const config = loadConfig(dir);
  assert.equal(config.callPatterns.length, 1);
  assert.equal(config.callPatterns[0].category, "audit");
  assert.deepEqual(config.keepCommentMarkers, []);
});

test("custom callPatterns fold custom receivers under their own category", async () => {
  const config: LensConfig = {
    ...DEFAULT_CONFIG,
    callPatterns: [
      ...DEFAULT_CONFIG.callPatterns,
      { category: "audit", receivers: ["audit", "featureFlags"] },
    ],
  };
  const model = await analyzeSource("x.ts", `
function pay(amount: number) {
  audit.record("payment.start", amount);
  featureFlags.report("pay-v2");
  const receipt = charge(amount);
  return receipt;
}
`.trim(), config);
  assert.ok(model);
  const audit = model.regions.filter((r) => r.category === "audit");
  assert.equal(audit.length, 1);
  assert.deepEqual([audit[0].startLine, audit[0].endLine], [2, 3]);
});

test("with base:false, built-in logging no longer folds", async () => {
  const config: LensConfig = {
    ...DEFAULT_CONFIG,
    callPatterns: [{ category: "audit", receivers: ["audit"] }],
  };
  const model = await analyzeSource("x.ts", `console.log("hi");`, config);
  assert.ok(model);
  assert.equal(model.regions.length, 0);
});

test("keepDirective pins a region open", async () => {
  const source = `
// lens:keep — this guard was buggy last week, always show it
if (!input) {
  throw new Error("input required");
}
console.log("processing");
`.trim();
  const model = await analyzeSource("x.ts", source, DEFAULT_CONFIG);
  assert.ok(model);
  const guard = model.regions.find((r) => r.category === "guard");
  assert.ok(guard);
  assert.ok(guard.score > DEFAULT_CONFIG.threshold, "directive must keep the guard visible");
  const logging = model.regions.find((r) => r.category === "logging");
  assert.ok(logging && logging.score <= DEFAULT_CONFIG.threshold, "unrelated regions still fold");
});

test("config init seeds a .lens.json from the defaults; reset moves it aside", () => {
  const dir = mkdtempSync(join(tmpdir(), "lens-config-"));

  // init creates a copy of the defaults
  const created = initConfig(dir);
  assert.equal(created, join(dir, ".lens.json"));
  const config = loadConfig(dir);
  assert.equal(config.callPatterns.length, DEFAULT_CONFIG.callPatterns.length);

  // init refuses to clobber an existing config
  assert.throws(() => initConfig(dir), /already exists/);

  // reset moves it to .bak so defaults apply again and the custom file survives
  const result = resetConfig(dir);
  assert.ok(result);
  assert.equal(result.reset, created);
  assert.ok(existsSync(result.backup));
  assert.equal(findConfigPath(dir), null);
  assert.deepEqual(loadConfig(dir), loadConfig("/nonexistent-so-defaults-apply"));

  // resetting again reports nothing to do
  assert.equal(resetConfig(dir), null);
});

test("wrong value types in categories/scores are ignored", () => {
  const dir = configDir({
    categories: { logging: "yes", guard: false },
    scores: { guard: "high", import: 2 },
  });
  const config = loadConfig(dir);
  assert.equal(config.categories.logging, true); // bad value ignored, default kept
  assert.equal(config.categories.guard, false);
  assert.equal(config.scores.guard, 1); // bad value ignored, default kept
  assert.equal(config.scores.import, 2);
});

test("custom scores flow into regions", async () => {
  const config: LensConfig = {
    ...DEFAULT_CONFIG,
    scores: { ...DEFAULT_CONFIG.scores, guard: 3 },
  };
  const model = await analyzeSource("x.ts", `
function f(x?: string) {
  if (!x) return null;
  return x.length;
}
`.trim(), config);
  assert.ok(model);
  const guard = model.regions.find((r) => r.category === "guard");
  assert.ok(guard);
  assert.equal(guard.score, 3); // visible at default threshold
});
