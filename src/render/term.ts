import type { FileFoldModel } from "../model.ts";
import { foldedLineCount } from "../model.ts";
import type { ViewerToken } from "./highlight.ts";

export const colorEnabled = process.stdout.isTTY && process.env.NO_COLOR === undefined;

const dim = (s: string) => (colorEnabled ? `\x1b[2m${s}\x1b[0m` : s);
const yellow = (s: string) => (colorEnabled ? `\x1b[33m${s}\x1b[0m` : s);
const cyan = (s: string) => (colorEnabled ? `\x1b[36m${s}\x1b[0m` : s);
const bold = (s: string) => (colorEnabled ? `\x1b[1m${s}\x1b[0m` : s);
const redStrike = (s: string) => (colorEnabled ? `\x1b[31;9m${s}\x1b[0m` : s);

/** Hex color → 24-bit ANSI foreground escape ("" for anything unparseable). */
export function ansiFg(hex: string): string {
  const match = /^#?([0-9a-f]{6})/i.exec(hex);
  if (!match) return "";
  const n = parseInt(match[1], 16);
  return `\x1b[38;2;${(n >> 16) & 255};${(n >> 8) & 255};${n & 255}m`;
}

function colorLine(raw: string, tokens: ViewerToken[] | undefined): string {
  if (!colorEnabled || !tokens) return raw;
  return tokens
    .map(([text, color]) => (color ? ansiFg(color) + text + "\x1b[39m" : text))
    .join("");
}

export function renderTerm(
  model: FileFoldModel,
  source: string,
  threshold: number,
  tokens?: ViewerToken[][],
  hunksOnly = false,
): string {
  const lines = source.split("\n");
  const gutterWidth = String(model.lineCount).length;
  const changed = new Set(model.changedLines ?? []);
  const out: string[] = [];

  const folded = foldedLineCount(model, threshold);
  const percent = model.lineCount > 0 ? Math.round((folded / model.lineCount) * 100) : 0;
  out.push(bold(model.file) + dim(` — ${model.lineCount} lines, ${folded} folded (${percent}%)`));

  const regionAt = new Map<number, FileFoldModel["regions"][number]>();
  for (const r of model.regions) {
    if (r.score <= threshold) regionAt.set(r.startLine, r);
  }

  // Old-side lines removed by the diff, keyed by the new-side line they follow.
  const removedAfter = new Map<number, string[]>();
  for (const block of model.removals ?? []) {
    removedAfter.set(block.afterLine, [...(removedAfter.get(block.afterLine) ?? []), ...block.lines]);
  }
  const emitRemoved = (afterLine: number) => {
    for (const text of removedAfter.get(afterLine) ?? []) {
      out.push(`${dim("−".padStart(gutterWidth))}   ${redStrike(text)}`);
    }
  };

  // hunks-only: windows of ±CONTEXT around every change; the rest collapses
  // into "⋯ N unchanged lines" separators (mirrors the viewer's toggle).
  const CONTEXT = 3;
  let windows: { start: number; end: number }[] | null = null;
  const hiddenGaps: { start: number; end: number }[] = [];
  const hasAnchors = (model.changedLines ?? []).length > 0 || (model.removals ?? []).length > 0;
  if (hunksOnly && hasAnchors) {
    const anchors = new Set(model.changedLines ?? []);
    for (const block of model.removals ?? []) {
      anchors.add(Math.max(1, block.afterLine));
      anchors.add(Math.min(model.lineCount, block.afterLine + 1));
    }
    windows = [];
    for (const line of [...anchors].sort((a, b) => a - b)) {
      const start = Math.max(1, line - CONTEXT);
      const end = Math.min(model.lineCount, line + CONTEXT);
      const last = windows[windows.length - 1];
      if (last && start <= last.end + 1) last.end = Math.max(last.end, end);
      else windows.push({ start, end });
    }
    let cursor = 1;
    for (const w of windows) {
      if (w.start > cursor) hiddenGaps.push({ start: cursor, end: w.start - 1 });
      cursor = w.end + 1;
    }
    if (cursor <= model.lineCount) hiddenGaps.push({ start: cursor, end: model.lineCount });
  }
  const inWindow = (start: number, end: number) =>
    windows === null || windows.some((w) => start <= w.end && w.start <= end);
  const gapAt = (line: number) => hiddenGaps.find((g) => line >= g.start && line <= g.end);

  let hiddenTotal = 0;
  emitRemoved(0);
  let lineNo = 1;
  while (lineNo <= model.lineCount) {
    const region = regionAt.get(lineNo);
    const marker = changed.has(lineNo) ? cyan("▎") : " ";
    const gutter = dim(String(lineNo).padStart(gutterWidth));
    if (!(region && inWindow(region.startLine, region.endLine))) {
      const gap = gapAt(lineNo);
      if (gap) {
        const count = gap.end - lineNo + 1;
        hiddenTotal += count;
        out.push(dim(`${"⋯".padStart(gutterWidth)}   ⋯ ${count} unchanged line${count === 1 ? "" : "s"}`));
        lineNo = gap.end + 1;
        continue;
      }
    }
    if (region) {
      const touchesChange = (model.changedLines ?? []).some(
        (l) => l >= region.startLine && l <= region.endLine,
      );
      // the changed marker covers the whole folded range, not just the first line
      const regionMarker = touchesChange ? cyan("▎") : " ";
      const changeNote = touchesChange ? cyan(" ●") : "";
      out.push(`${gutter} ${regionMarker} ${yellow(`▸ [${region.category}] ${region.summary}`)}${changeNote}`);
      for (let l = region.startLine; l <= region.endLine; l++) emitRemoved(l);
      lineNo = region.endLine + 1;
    } else {
      out.push(`${gutter} ${marker} ${colorLine(lines[lineNo - 1] ?? "", tokens?.[lineNo - 1])}`);
      emitRemoved(lineNo);
      lineNo++;
    }
  }
  if (hiddenTotal > 0) out[0] += dim(` · ${hiddenTotal} unchanged hidden`);
  return out.join("\n");
}
