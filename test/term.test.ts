import test from "node:test";
import assert from "node:assert/strict";
import { ansiFg, renderTerm } from "../src/render/term.ts";
import type { FileFoldModel } from "../src/model.ts";

test("ansiFg converts hex to 24-bit foreground escapes", () => {
  assert.equal(ansiFg("#ff8800"), "\x1b[38;2;255;136;0m");
  assert.equal(ansiFg("00ff00"), "\x1b[38;2;0;255;0m");
  assert.equal(ansiFg("#ffc79980"), "\x1b[38;2;255;199;153m"); // alpha ignored
  assert.equal(ansiFg("bogus"), "");
});

test("renderTerm stays plain when output is not a TTY, even with tokens", () => {
  const model: FileFoldModel = {
    file: "x.ts",
    language: "typescript",
    lineCount: 1,
    regions: [],
  };
  // test runner stdout is not a TTY, so colorEnabled is false here
  const out = renderTerm(model, "const x = 1;", 1, [[["const x = 1;", "#ff0000"]]]);
  assert.ok(out.includes("const x = 1;"));
  assert.ok(!out.includes("\x1b[38;2"), "no truecolor escapes when piped");
});

test("hunks-only terminal output collapses unchanged stretches", () => {
  const model: FileFoldModel = {
    file: "x.ts",
    language: "typescript",
    lineCount: 30,
    regions: [],
    changedLines: [15],
  };
  const source = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`).join("\n");
  const out = renderTerm(model, source, 1, undefined, true);
  assert.ok(out.includes("⋯ 11 unchanged lines"), "gap before the hunk");
  assert.ok(out.includes("⋯ 12 unchanged lines"), "gap after the hunk");
  assert.ok(out.includes("line 12") && out.includes("line 18"), "±3 context shown");
  assert.ok(out.includes("line 15"), "changed line shown");
  assert.ok(!out.includes("line 5") && !out.includes("line 25"), "unchanged stretches hidden");
  assert.ok(out.includes("23 unchanged hidden"), "header reports the hidden total");

  // without the flag, everything renders
  const full = renderTerm(model, source, 1, undefined, false);
  assert.ok(full.includes("line 5") && full.includes("line 25"));
});
