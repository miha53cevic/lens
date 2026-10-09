import { test } from "node:test";
import assert from "node:assert/strict";
import { bundleViewer } from "../src/render/web/bundle.ts";
import { fileSpans, hiddenCount, planCode, unitSpans, type CodeItem, type RemovedLine } from "../src/render/web/client/rows.ts";
import type { FileFoldModel, RemovedBlock } from "../src/model.ts";
import type { ViewUnit } from "../src/summary/view.ts";

test("the viewer's browser code bundles into one script that is safe to inline", async () => {
  const script = await bundleViewer();
  assert.ok(script.length > 1000, "the bundle has the viewer in it");
  assert.doesNotMatch(script, /<\/script/i, "nothing in it ends the inline <script> early");
  assert.doesNotMatch(script, /\bimport\s*\(|^import /m, "no imports are left for the browser to resolve");
});

// "L3" a line, "-5" a removed line (its old-side number), "R2-4[…]" a fold, "gap:14-20", "⋯" a break
function show(items: CodeItem[]): string[] {
  return items.map((it) =>
    it.kind === "line" ? "L" + it.line
      : it.kind === "removed" ? "-" + it.old
      : it.kind === "gap" ? "gap:" + it.start + "-" + it.end
      : it.kind === "break" ? "⋯"
      : "R" + it.region.startLine + "-" + it.region.endLine + "[" + show(it.body).join(",") + "]");
}

const lines = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => "L" + (from + i));

const file: FileFoldModel = {
  file: "src/a.ts",
  language: "typescript",
  lineCount: 20,
  regions: [{ startLine: 2, endLine: 4, category: "import", score: 0, summary: "3 imports" }],
  changedLines: [10],
  removals: [
    { afterLine: 3, oldStart: 5, lines: ["old a"] },
    { afterLine: 10, oldStart: 12, lines: ["old b"] },
  ],
};
const removedAfter = (blocks: RemovedBlock[]) => (after: number): RemovedLine[] =>
  blocks.filter((b) => b.afterLine === after).flatMap((b) => b.lines.map((text, i) => ({ text, old: b.oldStart + i })));

test("planCode: a fold keeps the removed lines inside it; removals after its last line follow it", () => {
  const items = planCode(fileSpans(file, false, new Set()), file.regions, removedAfter(file.removals!));
  assert.deepEqual(show(items), ["L1", "R2-4[L2,L3,-5,L4]", ...lines(5, 10), "-12", ...lines(11, 20)]);
  assert.equal(hiddenCount(items), 0);
});

test("fileSpans: hunks only hides the unchanged stretch behind a gap until its key is expanded", () => {
  const spans = fileSpans(file, true, new Set());
  // the change at 10 (7–13) and the removal after 3 (1–6) touch: one window
  assert.deepEqual(spans, [{ start: 1, end: 13 }, { start: 14, end: 20, gap: "src/a.ts:14" }]);
  const items = planCode(spans, file.regions, removedAfter(file.removals!));
  assert.deepEqual(show(items).slice(-3), ["L12", "L13", "gap:14-20"]);
  assert.equal(hiddenCount(items), 7);
  assert.deepEqual(fileSpans(file, true, new Set(["src/a.ts:14"])), [{ start: 1, end: 20 }]);
});

test("planCode: no lines to show still shows the removed lines (a deleted file or unit)", () => {
  const removed = [{ text: "gone", old: 1 }];
  assert.deepEqual(show(planCode([], [], (after) => after === 0 ? removed : [])), ["-1"]);
});

test("unitSpans + planCode: a unit's ranges break with ⋯; removed lines anchored before a range open it", () => {
  const unit = {
    id: "src/a.ts#f",
    ranges: [{ start: 1, end: 5 }, { start: 12, end: 15 }],
    changedLines: [13],
    removals: [{ anchor: 11, afterLine: 11, oldStart: 3, lines: ["gone"] }],
    summary: null,
  } as unknown as ViewUnit;
  const removedAt = (after: number) => unit.removals.filter((b) => b.anchor === after).map((b) => ({ text: b.lines[0], old: b.oldStart }));

  const whole = planCode(unitSpans(unit, file.regions, false, new Set()), file.regions, removedAt);
  assert.deepEqual(show(whole), ["L1", "R2-4[L2,L3,L4]", "L5", "⋯", "-3", "L12", "L13", "L14", "L15"]);

  // hunks only: 1–5 is far from the change and the removal, so it hides (the fold inside it too)
  const spans = unitSpans(unit, file.regions, true, new Set());
  assert.deepEqual(spans, [{ start: 1, end: 5, gap: "unit:src/a.ts#f:1" }, { start: 12, end: 15 }]);
  assert.deepEqual(show(planCode(spans, file.regions, removedAt)), ["gap:1-5", "⋯", "-3", "L12", "L13", "L14", "L15"]);
});
