// What the Code view and the Summary tab show of a file's code: which lines, in which
// folds, with which removed lines and hidden stretches. One plan for both views, so a
// change to how code is shown reaches both.

// No DOM here: the tests run it in node (test/viewer.test.ts).

import type { FileFoldModel, FoldRegion } from "../../../model.ts";
import type { ViewUnit } from "../../../summary/view.ts";

/** Lines of context around each change in hunks-only mode (code view and summary) */
export const HUNK_CONTEXT = 3;

/** A stretch of new-side lines: shown, or (with `gap`, its expand key) hidden behind a ⋯ row. */
export interface CodeSpan { start: number; end: number; gap?: string }

export interface RemovedLine { text: string; old: number }

export type CodeItem =
  | { kind: "line"; line: number }
  | { kind: "removed"; text: string; old: number }
  /** body: the region's lines, with the removed lines anchored inside it */
  | { kind: "region"; region: FoldRegion; body: CodeItem[] }
  /** hidden unchanged lines, shown on click */
  | { kind: "gap"; start: number; end: number; key: string }
  /** where the shown code jumps (a unit's ranges break) */
  | { kind: "break" };

/**
 * The rows for `spans` (in line order). A region shows as a fold when it starts and ends
 * inside one span; `removedAt(n)` gives the removed lines shown after line n (0: before the first).
 */
export function planCode(spans: CodeSpan[], regions: FoldRegion[], removedAt: (anchor: number) => RemovedLine[]): CodeItem[] {
  const items: CodeItem[] = [];
  const removed = (anchor: number, into: CodeItem[]) => {
    for (const r of removedAt(anchor)) into.push({ kind: "removed", text: r.text, old: r.old });
  };
  if (spans.length === 0) { removed(0, items); return items; }
  const regionAt = new Map<number, FoldRegion>();
  for (const r of regions) regionAt.set(r.startLine, r);
  let prev: CodeSpan | null = null;
  for (const span of spans) {
    const touches = prev !== null && prev.end + 1 === span.start;
    if (prev !== null && !touches) items.push({ kind: "break" });
    if (span.gap !== undefined) {
      items.push({ kind: "gap", start: span.start, end: span.end, key: span.gap });
      prev = span;
      continue;
    }
    // removed lines anchored just before the span: unless the span before showed that line
    if (!(touches && prev!.gap === undefined)) removed(span.start - 1, items);
    let l = span.start;
    while (l <= span.end) {
      const region = regionAt.get(l);
      if (region && region.endLine <= span.end) {
        const body: CodeItem[] = [];
        for (let n = region.startLine; n <= region.endLine; n++) {
          body.push({ kind: "line", line: n });
          // removals anchored at endLine show after the region, in the main flow
          if (n < region.endLine) removed(n, body);
        }
        items.push({ kind: "region", region, body });
        removed(region.endLine, items);
        l = region.endLine + 1;
        continue;
      }
      items.push({ kind: "line", line: l });
      removed(l, items);
      l++;
    }
    prev = span;
  }
  return items;
}

/** How many unchanged lines the plan hides behind ⋯ rows. */
export function hiddenCount(items: CodeItem[]): number {
  return items.reduce((n, it) => n + (it.kind === "gap" ? it.end - it.start + 1 : 0), 0);
}

/** Shown spans plus hidden stretches, in line order; contiguous shown spans merged. */
function inOrder(shown: CodeSpan[], hidden: CodeSpan[]): CodeSpan[] {
  const out: CodeSpan[] = [];
  for (const s of [...shown, ...hidden].sort((a, b) => a.start - b.start)) {
    const last = out[out.length - 1];
    if (last && last.gap === undefined && s.gap === undefined && last.end + 1 >= s.start) last.end = Math.max(last.end, s.end);
    else out.push({ ...s });
  }
  return out;
}

/**
 * The Code view's spans for a file. Hunks only: ±HUNK_CONTEXT lines around every change and
 * removal anchor, merged; the stretches in between are hidden unless `expanded` has their key
 * ("path:start", stable across expansion).
 */
export function fileSpans(file: FileFoldModel, hunksOnly: boolean, expanded: ReadonlySet<string>): CodeSpan[] {
  const all: CodeSpan[] = file.lineCount > 0 ? [{ start: 1, end: file.lineCount }] : [];
  const hasAnchors = (file.changedLines || []).length > 0 || (file.removals || []).length > 0;
  if (!hunksOnly || !hasAnchors) return all;

  const raw = (file.changedLines || []).map((l) => ({ start: l - HUNK_CONTEXT, end: l + HUNK_CONTEXT }));
  // a removed block shows after its anchor line: HUNK_CONTEXT lines on each side, as in the Summary
  for (const block of file.removals || []) {
    raw.push({ start: block.afterLine - HUNK_CONTEXT + 1, end: block.afterLine + HUNK_CONTEXT });
  }
  // a fold region is never cut by a hidden stretch: a window takes in every region it touches
  // (regions don't overlap, so one pass is enough)
  for (const w of raw) {
    for (const r of file.regions) {
      if (r.startLine <= w.end && w.start <= r.endLine) {
        w.start = Math.min(w.start, r.startLine);
        w.end = Math.max(w.end, r.endLine);
      }
    }
  }
  const windows: CodeSpan[] = [];
  for (const w of raw.sort((a, b) => a.start - b.start)) {
    const start = Math.max(1, w.start);
    const end = Math.min(file.lineCount, w.end);
    const last = windows[windows.length - 1];
    if (last && start <= last.end + 1) last.end = Math.max(last.end, end);
    else windows.push({ start, end });
  }
  const shown = [...windows];
  const hidden: CodeSpan[] = [];
  const between = (start: number, end: number) => {
    const key = file.file + ":" + start;
    if (expanded.has(key)) shown.push({ start, end });
    else hidden.push({ start, end, gap: key });
  };
  let cursor = 1;
  for (const w of windows) {
    if (w.start > cursor) between(cursor, w.start - 1);
    cursor = w.end + 1;
  }
  if (cursor <= file.lineCount) between(cursor, file.lineCount);
  return inOrder(shown, hidden);
}

/**
 * The Summary tab's spans for a unit: its ranges. Hunks only: the lines within HUNK_CONTEXT of a
 * change or a removed block, as in the code view, and the lines the summary cites; the stretches
 * in between are hidden unless `expanded` has their key ("unit:<id>:start").
 */
export function unitSpans(u: ViewUnit, regions: FoldRegion[], hunksOnly: boolean, expanded: ReadonlySet<string>): CodeSpan[] {
  if (!hunksOnly) return u.ranges.map((r) => ({ start: r.start, end: r.end }));
  const near = new Set<number>();
  const around = (from: number, to: number) => { for (let l = from; l <= to; l++) near.add(l); };
  for (const l of u.changedLines) around(l - HUNK_CONTEXT, l + HUNK_CONTEXT);
  // a removed block shows after its anchor line: keep the lines on both sides
  for (const b of u.removals) around(b.anchor - HUNK_CONTEXT + 1, b.anchor + HUNK_CONTEXT);
  // lines the summary points at stay in view — a concern's note hangs off its line
  const s = u.summary;
  for (const c of s ? [...s.concerns, ...s.changes] : []) {
    if (c.line.startsWith("N")) { const l = Number(c.line.slice(1)); around(l - 1, l + 1); }
  }
  // as in the code view, a fold region is never cut by a hidden stretch
  for (const r of regions) {
    for (let l = r.startLine; l <= r.endLine; l++) if (near.has(l)) { around(r.startLine, r.endLine); break; }
  }
  // runs of hidden lines within each of the unit's ranges; an expanded one shows again
  const gaps: CodeSpan[] = [];
  for (const r of u.ranges) {
    for (let l = r.start; l <= r.end; l++) {
      if (near.has(l)) continue;
      const last = gaps[gaps.length - 1];
      if (last && last.end === l - 1) last.end = l; else gaps.push({ start: l, end: l });
    }
  }
  for (const g of gaps) g.gap = "unit:" + u.id + ":" + g.start;
  const hidden = gaps.filter((g) => !expanded.has(g.gap!));
  const shown: CodeSpan[] = [];
  for (const r of u.ranges) {
    for (let l = r.start; l <= r.end; l++) {
      if (hidden.some((g) => l >= g.start && l <= g.end)) continue;
      const last = shown[shown.length - 1];
      if (last && last.end === l - 1) last.end = l; else shown.push({ start: l, end: l });
    }
  }
  return [...shown, ...hidden].sort((a, b) => a.start - b.start);
}
