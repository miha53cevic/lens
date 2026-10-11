// Word-level diff: which words changed between a removed line and the added line that
// replaced it, so a one-character fix stands out. Plain text diffing, no semantics.

// No DOM here: the tests run it in node (test/viewer.test.ts).

import type { RemovedBlock } from '../cli-app/model.ts';
import type { ViewerToken } from '../cli-app/render/highlight.ts';
import { escapeHtml } from '../cli-app/text.ts';

/** A changed stretch of a line, in characters: [start, end). */
export type WordRange = readonly [number, number];

export interface WordDiffs {
  /** The changed words of each paired added line, by new-side line */
  added: ReadonlyMap<number, WordRange[]>;
  /** The changed words of each paired removed line, by old-side line */
  removed: ReadonlyMap<number, WordRange[]>;
}

/** Below this share of unchanged characters, a pair is a rewrite: no word marks. */
const MIN_SIMILARITY = 0.5;
/** Lines with more words than this aren't diffed by word (the diff is quadratic). */
const MAX_TOKENS = 400;
/** How many added lines past the last pair a removed line looks at: big rewrites stay linear. */
const PAIR_LOOKAHEAD = 8;

// identifiers and numbers, runs of whitespace, single punctuation characters
const TOKEN = /[A-Za-z0-9_$]+|\s+|[^A-Za-z0-9_$\s]/g;

/**
 * The words that differ between `before` and `after`, as ranges on each side, or null when the
 * lines are too different (or too long) for word marks to help.
 */
export function wordDiff(before: string, after: string): { before: WordRange[]; after: WordRange[] } | null {
  const beforeTokens = before.match(TOKEN) ?? [];
  const afterTokens = after.match(TOKEN) ?? [];
  if (beforeTokens.length > MAX_TOKENS || afterTokens.length > MAX_TOKENS) return null;
  const rows = beforeTokens.length;
  const columns = afterTokens.length;
  // common[i][j]: the longest common subsequence of beforeTokens[i..] and afterTokens[j..]
  const common = Array.from({ length: rows + 1 }, () => new Uint16Array(columns + 1));
  for (let row = rows - 1; row >= 0; row--) {
    for (let column = columns - 1; column >= 0; column--) {
      common[row][column] =
        beforeTokens[row] === afterTokens[column]
          ? common[row + 1][column + 1] + 1
          : Math.max(common[row + 1][column], common[row][column + 1]);
    }
  }
  const keptBefore = new Array<boolean>(rows).fill(false);
  const keptAfter = new Array<boolean>(columns).fill(false);
  let keptCharacters = 0;
  for (let row = 0, column = 0; row < rows && column < columns;) {
    if (beforeTokens[row] === afterTokens[column]) {
      keptCharacters += beforeTokens[row].length;
      keptBefore[row++] = true;
      keptAfter[column++] = true;
    } else if (common[row + 1][column] >= common[row][column + 1]) row++;
    else column++;
  }
  const similarity = (2 * keptCharacters) / (before.length + after.length || 1);
  if (similarity < MIN_SIMILARITY) return null;
  return {
    before: changedRanges(before, beforeTokens, keptBefore),
    after: changedRanges(after, afterTokens, keptAfter),
  };
}

/** The tokens not kept, as character ranges; ranges split only by whitespace merge into one. */
function changedRanges(line: string, tokens: string[], kept: boolean[]): WordRange[] {
  const ranges: [number, number][] = [];
  let offset = 0;
  tokens.forEach((token, tokenIndex) => {
    const start = offset;
    offset += token.length;
    if (kept[tokenIndex] || /^\s+$/.test(token)) return;
    const last = ranges[ranges.length - 1];
    if (last && /^\s*$/.test(line.slice(last[1], start))) last[1] = offset;
    else ranges.push([start, offset]);
  });
  return ranges;
}

/**
 * Word marks for a file's changes. Each removed block is paired with the run of added lines that
 * follows its anchor (a replacement's added lines come right after its removed ones): in order,
 * each removed line takes the first added line after the last pair that's close enough to mark,
 * so an inserted line doesn't shift the pairs. A removed line with no such line gets no marks.
 */
export function pairWordDiffs(removals: RemovedBlock[], changedLines: number[], newLines: string[]): WordDiffs {
  const added = new Map<number, WordRange[]>();
  const removed = new Map<number, WordRange[]>();
  const changed = new Set(changedLines);
  for (const block of removals) {
    const run: number[] = [];
    for (let line = block.afterLine + 1; changed.has(line); line++) run.push(line);
    let next = 0;
    block.lines.forEach((text, offset) => {
      for (let runIndex = next; runIndex < Math.min(run.length, next + PAIR_LOOKAHEAD); runIndex++) {
        const diff = wordDiff(text, newLines[run[runIndex] - 1] ?? '');
        if (!diff) continue;
        if (diff.after.length > 0) added.set(run[runIndex], diff.after);
        if (diff.before.length > 0) removed.set(block.oldStart + offset, diff.before);
        next = runIndex + 1;
        return;
      }
    });
  }
  return { added, removed };
}

/** A line's highlighted tokens as HTML, with the `marked` ranges wrapped in `<span class="w-add">`. */
export function lineHtml(tokens: ViewerToken[], marked: readonly WordRange[] = []): string {
  let html = '';
  let offset = 0;
  for (const [text, color] of tokens) {
    let piece = '';
    for (const part of splitAt(text, offset, marked)) {
      piece += part.marked ? '<span class="w-add">' + escapeHtml(part.text) + '</span>' : escapeHtml(part.text);
    }
    html += color ? '<span style="color:' + color + '">' + piece + '</span>' : piece;
    offset += text.length;
  }
  return html;
}

/** `text`, starting at `offset` in its line, cut where the ranges start and end. */
export function splitAt(
  text: string,
  offset: number,
  ranges: readonly WordRange[],
): { text: string; marked: boolean }[] {
  const parts: { text: string; marked: boolean }[] = [];
  let index = 0;
  while (index < text.length) {
    const at = offset + index;
    const inside = ranges.find(([start, end]) => start <= at && at < end);
    const next = inside
      ? inside[1]
      : Math.min(...ranges.map(([start]) => start).filter((start) => start > at), Infinity);
    const end = Math.min(text.length, next - offset);
    parts.push({ text: text.slice(index, end), marked: !!inside });
    index = end;
  }
  return parts;
}
