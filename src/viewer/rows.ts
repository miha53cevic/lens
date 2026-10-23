// What the Code view and the Summary tab show of a file's code: which lines, in which
// folds, with which removed lines and hidden stretches. One plan for both views, so a
// change to how code is shown reaches both.

// No DOM here: the tests run it in node (test/viewer.test.ts).

import type { FileFoldModel, FoldRegion } from '../cli-app/model.ts';
import type { ViewUnit } from '../cli-app/summary/view.ts';

/** Lines of context around each change in hunks-only mode (the code view; the summary shows its units whole) */
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
  | { kind: 'break' }
  /**
   * Full units: the rest of the unit's file above or below it, behind one bar until opened (key in
   * expandedGaps). The bar says how many lines it holds, what they declare and what they changed.
   */
  | {
      kind: 'context';
      side: 'above' | 'below';
      key: string;
      open: boolean;
      lineCount: number;
      names: string[];
      added: number;
      removed: number;
      body: CodeItem[];
    };

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
  if (!hunksOnly || !hasAnchors(file)) return wholeFile;
  return withGaps(hunkWindows(file), wholeFile, (start) => file.file + ':' + start, expanded);
}

function hasAnchors(file: FileFoldModel): boolean {
  return (file.changedLines || []).length > 0 || (file.removals || []).length > 0;
}

/** Hunks only: the stretches within HUNK_CONTEXT of a change or a removal anchor, merged, folds whole. */
function hunkWindows(file: FileFoldModel): CodeSpan[] {
  const around = (file.changedLines || []).map((line) => ({ start: line - HUNK_CONTEXT, end: line + HUNK_CONTEXT }));
  // a removed block shows after its anchor line: HUNK_CONTEXT lines on each side
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
  return windows;
}

/**
 * The lines of `within` (in line order), with what `windows` leaves out of them hidden behind gaps,
 * keyed by `keyOf(start)`, unless `expanded` has the key.
 */
function withGaps(
  windows: CodeSpan[],
  within: CodeSpan[],
  keyOf: (start: number) => string,
  expanded: ReadonlySet<string>,
): CodeSpan[] {
  const shown: CodeSpan[] = [];
  const hidden: CodeSpan[] = [];
  const between = (start: number, end: number) => {
    const key = keyOf(start);
    if (expanded.has(key)) shown.push({ start, end });
    else hidden.push({ start, end, gap: key });
  };
  for (const range of within) {
    let cursor = range.start;
    for (const window of windows) {
      const start = Math.max(window.start, range.start);
      const end = Math.min(window.end, range.end);
      if (start > end) continue;
      if (start > cursor) between(cursor, start - 1);
      shown.push({ start, end });
      cursor = end + 1;
    }
    if (cursor <= range.end) between(cursor, range.end);
  }
  return inOrder(shown, hidden);
}

/**
 * Full units: the rest of the unit's file, above its first line and below its last, each keyed
 * ("unit:<id>:above" / ":below") for the bar that opens it, and shown whole once open: the Summary
 * tab doesn't follow hunks only. Null when the unit has no lines in the file.
 */
export function contextSpans(unit: ViewUnit, file: FileFoldModel): { above: UnitContext; below: UnitContext } | null {
  if (unit.ranges.length === 0) return null;
  const first = Math.min(...unit.ranges.map((range) => range.start));
  const last = Math.max(...unit.ranges.map((range) => range.end));
  const stretch = (side: 'above' | 'below', start: number, end: number): UnitContext => {
    const key = 'unit:' + unit.id + ':' + side;
    return { key, start, end, spans: start > end ? [] : [{ start, end }] };
  };
  return { above: stretch('above', 1, first - 1), below: stretch('below', last + 1, file.lineCount) };
}

/** A stretch of a unit's file outside the unit: its lines, and the spans that show them. */
export interface UnitContext {
  key: string;
  start: number;
  end: number;
  spans: CodeSpan[];
}

/** The top-level names a file declares between two lines, in order (a class's members left out). */
export function declaredIn(file: FileFoldModel, start: number, end: number): string[] {
  const names = (file.declarations || [])
    .filter((declaration) => declaration.kind !== 'method' && declaration.kind !== 'property')
    .filter((declaration) => declaration.line >= start && declaration.line <= end)
    .map((declaration) => declaration.name);
  return [...new Set(names)];
}

/**
 * The Summary tab's spans for a unit: its ranges, whole. Hunks only is the Code view's: a unit is
 * already the code around its change, and cutting it up hides what the summary talks about.
 */
export function unitSpans(unit: ViewUnit): CodeSpan[] {
  return unit.ranges.map((range) => ({ start: range.start, end: range.end }));
}

// Side by side: the same plan, drawn as rows of old · new.

/** A row of the side-by-side layout: the plan's items, with the removed lines paired with what replaced them. */
export type SplitItem =
  /** an unchanged line, on both sides: `old` is its old-side number */
  | { kind: 'same'; line: number; old: number }
  /** a removed line beside the changed line in its place; either side may have none */
  | { kind: 'pair'; removed: RemovedLine | null; line: number | null }
  /** old: the old side's lines the fold hides, so its left half can say so (null when it has none) */
  | { kind: 'region'; region: FoldRegion; body: SplitItem[]; old: OldStretch | null }
  /** a gap's unchanged lines, numbered on the old side too */
  | (Extract<CodeItem, { kind: 'gap' }> & { oldStart: number; oldEnd: number })
  | Extract<CodeItem, { kind: 'break' }>
  | (Omit<Extract<CodeItem, { kind: 'context' }>, 'body'> & { body: SplitItem[] });

/** The old side of a fold, side by side: its first and last old line, and how many of them were removed. */
export interface OldStretch {
  start: number;
  end: number;
  removed: number;
}

/** The old lines a fold's paired body holds: its unchanged lines' old numbers and its removed lines. */
export function oldStretch(body: SplitItem[]): OldStretch | null {
  const lines: number[] = [];
  let removed = 0;
  for (const item of body) {
    if (item.kind === 'same') lines.push(item.old);
    else if (item.kind === 'pair' && item.removed) {
      lines.push(item.removed.old);
      removed++;
    }
  }
  if (lines.length === 0) return null;
  return { start: Math.min(...lines), end: Math.max(...lines), removed };
}

/**
 * The side-by-side rows for a plan. A run of removed lines and the run of changed lines after it
 * are zipped by position, the longer run's rest beside nothing; an unchanged line shows on both
 * sides, numbered by `oldLines` (oldLineNumbers) on the left. Folds and full units' context keep
 * their place, their bodies paired the same way.
 */
export function pairRows(items: CodeItem[], changed: ReadonlySet<number>, oldLines: readonly number[]): SplitItem[] {
  const rows: SplitItem[] = [];
  let index = 0;
  // the item's line when it's a changed one, else null
  const changedLine = (item: CodeItem | undefined) =>
    item?.kind === 'line' && changed.has(item.line) ? item.line : null;
  while (index < items.length) {
    const item = items[index];
    if (item.kind === 'removed' || changedLine(item) !== null) {
      const removed: RemovedLine[] = [];
      for (let next = items[index]; next?.kind === 'removed'; next = items[++index]) {
        removed.push({ text: next.text, old: next.old });
      }
      const added: number[] = [];
      for (let line = changedLine(items[index]); line !== null; line = changedLine(items[++index])) added.push(line);
      for (let pairIndex = 0; pairIndex < Math.max(removed.length, added.length); pairIndex++) {
        rows.push({ kind: 'pair', removed: removed[pairIndex] ?? null, line: added[pairIndex] ?? null });
      }
      continue;
    }
    index++;
    switch (item.kind) {
      case 'line':
        rows.push({ kind: 'same', line: item.line, old: oldLines[item.line] ?? item.line });
        break;
      case 'region': {
        const body = pairRows(item.body, changed, oldLines);
        rows.push({ kind: 'region', region: item.region, body, old: oldStretch(body) });
        break;
      }
      case 'gap':
        // a gap is unchanged lines only: each has an old number
        rows.push({ ...item, oldStart: oldLines[item.start] ?? item.start, oldEnd: oldLines[item.end] ?? item.end });
        break;
      case 'context':
        rows.push({ ...item, body: pairRows(item.body, changed, oldLines) });
        break;
      default:
        rows.push(item);
    }
  }
  return rows;
}

/** Each new-side line's old-side number, by line (0 for a changed line, which has none). */
export function oldLineNumbers(file: FileFoldModel): number[] {
  const changed = new Set(file.changedLines || []);
  const removedAfter = new Map<number, number>();
  for (const block of file.removals || []) {
    removedAfter.set(block.afterLine, (removedAfter.get(block.afterLine) ?? 0) + block.lines.length);
  }
  const old = [0];
  let oldLine = 0;
  for (let line = 1; line <= file.lineCount; line++) {
    oldLine += removedAfter.get(line - 1) ?? 0;
    old.push(changed.has(line) ? 0 : ++oldLine);
  }
  return old;
}
