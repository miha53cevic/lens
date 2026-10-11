// What the Code view and the Summary tab show of a file's code: which lines, in which
// folds, with which removed lines and hidden stretches. One plan for both views, so a
// change to how code is shown reaches both.

// No DOM here: the tests run it in node (test/viewer.test.ts).

import type { FileFoldModel, FoldRegion } from '../cli-app/model.ts';
import type { ViewUnit } from '../cli-app/summary/view.ts';

/** Lines of context around each change in hunks-only mode (code view and summary) */
export const HUNK_CONTEXT = 3;

/** A stretch of new-side lines: shown, or (with `gap`, its expand key) hidden behind a ⋯ row. */
export interface CodeSpan {
  start: number;
  end: number;
  gap?: string;
}

export interface RemovedLine {
  text: string;
  old: number;
}

export type CodeItem =
  | { kind: 'line'; line: number }
  | { kind: 'removed'; text: string; old: number }
  /** body: the region's lines, with the removed lines anchored inside it */
  | { kind: 'region'; region: FoldRegion; body: CodeItem[] }
  /** hidden unchanged lines, shown on click */
  | { kind: 'gap'; start: number; end: number; key: string }
  /** where the shown code jumps (a unit's ranges break) */
  | { kind: 'break' };

/**
 * The rows for `spans` (in line order). A region shows as a fold when it starts and ends
 * inside one span; `removedAt(line)` gives the removed lines shown after that line (0: before the first).
 */
export function planCode(
  spans: CodeSpan[],
  regions: FoldRegion[],
  removedAt: (anchor: number) => RemovedLine[],
): CodeItem[] {
  const items: CodeItem[] = [];
  const addRemoved = (anchor: number, into: CodeItem[]) => {
    for (const removed of removedAt(anchor)) into.push({ kind: 'removed', text: removed.text, old: removed.old });
  };
  if (spans.length === 0) {
    addRemoved(0, items);
    return items;
  }
  const regionAt = new Map<number, FoldRegion>();
  for (const region of regions) regionAt.set(region.startLine, region);
  let previous: CodeSpan | null = null;
  for (const span of spans) {
    const touches = previous !== null && previous.end + 1 === span.start;
    if (previous !== null && !touches) items.push({ kind: 'break' });
    if (span.gap !== undefined) {
      items.push({ kind: 'gap', start: span.start, end: span.end, key: span.gap });
      previous = span;
      continue;
    }
    // removed lines anchored just before the span: unless the span before showed that line
    if (!(touches && previous!.gap === undefined)) addRemoved(span.start - 1, items);
    let line = span.start;
    while (line <= span.end) {
      const region = regionAt.get(line);
      if (region && region.endLine <= span.end) {
        const body: CodeItem[] = [];
        for (let regionLine = region.startLine; regionLine <= region.endLine; regionLine++) {
          body.push({ kind: 'line', line: regionLine });
          // removals anchored at endLine show after the region, in the main flow
          if (regionLine < region.endLine) addRemoved(regionLine, body);
        }
        items.push({ kind: 'region', region, body });
        addRemoved(region.endLine, items);
        line = region.endLine + 1;
        continue;
      }
      items.push({ kind: 'line', line });
      addRemoved(line, items);
      line++;
    }
    previous = span;
  }
  return items;
}

/** How many unchanged lines the plan hides behind ⋯ rows. */
export function hiddenCount(items: CodeItem[]): number {
  return items.reduce((count, item) => count + (item.kind === 'gap' ? item.end - item.start + 1 : 0), 0);
}

const byStart = (spanA: CodeSpan, spanB: CodeSpan) => spanA.start - spanB.start;

/** Shown spans plus hidden stretches, in line order; contiguous shown spans merged. */
function inOrder(shown: CodeSpan[], hidden: CodeSpan[]): CodeSpan[] {
  const ordered: CodeSpan[] = [];
  for (const span of [...shown, ...hidden].sort(byStart)) {
    const last = ordered[ordered.length - 1];
    if (last && last.gap === undefined && span.gap === undefined && last.end + 1 >= span.start) {
      last.end = Math.max(last.end, span.end);
    } else {
      ordered.push({ ...span });
    }
  }
  return ordered;
}

/**
 * The Code view's spans for a file. Hunks only: ±HUNK_CONTEXT lines around every change and
 * removal anchor, merged; the stretches in between are hidden unless `expanded` has their key
 * ("path:start", stable across expansion).
 */
export function fileSpans(file: FileFoldModel, hunksOnly: boolean, expanded: ReadonlySet<string>): CodeSpan[] {
  const wholeFile: CodeSpan[] = file.lineCount > 0 ? [{ start: 1, end: file.lineCount }] : [];
  const hasAnchors = (file.changedLines || []).length > 0 || (file.removals || []).length > 0;
  if (!hunksOnly || !hasAnchors) return wholeFile;

  const around = (file.changedLines || []).map((line) => ({ start: line - HUNK_CONTEXT, end: line + HUNK_CONTEXT }));
  // a removed block shows after its anchor line: HUNK_CONTEXT lines on each side, as in the Summary
  for (const block of file.removals || []) {
    around.push({ start: block.afterLine - HUNK_CONTEXT + 1, end: block.afterLine + HUNK_CONTEXT });
  }
  // a fold region is never cut by a hidden stretch: a window takes in every region it touches
  // (regions don't overlap, so one pass is enough)
  for (const window of around) {
    for (const region of file.regions) {
      if (region.startLine <= window.end && window.start <= region.endLine) {
        window.start = Math.min(window.start, region.startLine);
        window.end = Math.max(window.end, region.endLine);
      }
    }
  }
  const windows: CodeSpan[] = [];
  for (const window of around.sort(byStart)) {
    const start = Math.max(1, window.start);
    const end = Math.min(file.lineCount, window.end);
    const last = windows[windows.length - 1];
    if (last && start <= last.end + 1) last.end = Math.max(last.end, end);
    else windows.push({ start, end });
  }
  const shown = [...windows];
  const hidden: CodeSpan[] = [];
  const between = (start: number, end: number) => {
    const key = file.file + ':' + start;
    if (expanded.has(key)) shown.push({ start, end });
    else hidden.push({ start, end, gap: key });
  };
  let cursor = 1;
  for (const window of windows) {
    if (window.start > cursor) between(cursor, window.start - 1);
    cursor = window.end + 1;
  }
  if (cursor <= file.lineCount) between(cursor, file.lineCount);
  return inOrder(shown, hidden);
}

/**
 * The Summary tab's spans for a unit: its ranges. Hunks only: the lines within HUNK_CONTEXT of a
 * change or a removed block, as in the code view, and the lines the summary cites; the stretches
 * in between are hidden unless `expanded` has their key ("unit:<id>:start").
 */
export function unitSpans(
  unit: ViewUnit,
  regions: FoldRegion[],
  hunksOnly: boolean,
  expanded: ReadonlySet<string>,
): CodeSpan[] {
  if (!hunksOnly) return unit.ranges.map((range) => ({ start: range.start, end: range.end }));
  const near = new Set<number>();
  const keepAround = (from: number, to: number) => {
    for (let line = from; line <= to; line++) near.add(line);
  };
  for (const line of unit.changedLines) keepAround(line - HUNK_CONTEXT, line + HUNK_CONTEXT);
  // a removed block shows after its anchor line: keep the lines on both sides
  for (const block of unit.removals) keepAround(block.anchor - HUNK_CONTEXT + 1, block.anchor + HUNK_CONTEXT);
  // lines the summary points at stay in view — a concern's note hangs off its line
  const summary = unit.summary;
  for (const cited of summary ? [...summary.concerns, ...summary.changes] : []) {
    if (cited.line.startsWith('N')) {
      const line = Number(cited.line.slice(1));
      keepAround(line - 1, line + 1);
    }
  }
  // as in the code view, a fold region is never cut by a hidden stretch
  for (const region of regions) {
    for (let line = region.startLine; line <= region.endLine; line++) {
      if (near.has(line)) {
        keepAround(region.startLine, region.endLine);
        break;
      }
    }
  }
  // runs of hidden lines within each of the unit's ranges; an expanded one shows again
  const gaps: CodeSpan[] = [];
  for (const range of unit.ranges) {
    for (let line = range.start; line <= range.end; line++) {
      if (near.has(line)) continue;
      const last = gaps[gaps.length - 1];
      if (last && last.end === line - 1) last.end = line;
      else gaps.push({ start: line, end: line });
    }
  }
  for (const gap of gaps) gap.gap = 'unit:' + unit.id + ':' + gap.start;
  const hidden = gaps.filter((gap) => !expanded.has(gap.gap!));
  const shown: CodeSpan[] = [];
  for (const range of unit.ranges) {
    for (let line = range.start; line <= range.end; line++) {
      if (hidden.some((gap) => line >= gap.start && line <= gap.end)) continue;
      const last = shown[shown.length - 1];
      if (last && last.end === line - 1) last.end = line;
      else shown.push({ start: line, end: line });
    }
  }
  return [...shown, ...hidden].sort(byStart);
}
