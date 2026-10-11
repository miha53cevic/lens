// Helpers every part of the viewer shares.

import type { CSSProperties } from 'react';
import type { ViewerPayload } from '../cli-app/render/web/server.ts';
import { compilePatterns, matchesAny } from '../cli-app/glob.ts';
import { escapeHtml } from '../cli-app/text.ts';
import { lineHtml, pairWordDiffs, type WordDiffs } from './wordDiff.ts';

export type ViewFile = ViewerPayload['files'][number];

/** The server's payload, injected into the page as JSON (see server.ts). */
export const INITIAL_DATA: ViewerPayload = JSON.parse(document.getElementById('lens-data')!.textContent!);

export { escapeHtml };

// Tokens come pre-computed from the backend (Shiki): per line, [text, color] pairs. Rows set
// these as HTML — far cheaper than an element per token on big files. A theme switch or a
// refresh brings new file objects, so the cache follows them.
const lineCache = new WeakMap<ViewFile, string[]>();
export function linesFromTokens(file: ViewFile): string[] {
  let lines = lineCache.get(file);
  if (!lines) {
    lines = fileTokens(file).map((line) => lineHtml(line));
    lineCache.set(file, lines);
  }
  return lines;
}

/** The file's tokens, or its plain lines as uncolored tokens when there are none. */
function fileTokens(file: ViewFile): ViewFile['tokens'] {
  return Array.isArray(file.tokens) && file.tokens.length > 0
    ? file.tokens
    : file.source.split('\n').map((line) => [[line, null]]);
}

// A file's word marks, and its lines with the added side's marks in them.
const wordDiffCache = new WeakMap<ViewFile, { diffs: WordDiffs; lines: string[] }>();
function fileWordDiffs(file: ViewFile) {
  let cached = wordDiffCache.get(file);
  if (!cached) {
    const diffs = pairWordDiffs(file.removals || [], file.changedLines || [], sourceLines(file));
    const plain = linesFromTokens(file);
    const tokens = fileTokens(file);
    const lines = plain.map((html, index) => {
      const marked = diffs.added.get(index + 1);
      return marked ? lineHtml(tokens[index] ?? [], marked) : html;
    });
    cached = { diffs, lines };
    wordDiffCache.set(file, cached);
  }
  return cached;
}

/**
 * What the code rows show of a file: its highlighted lines and, with word diff on and the removed
 * lines shown, the changed words of each replaced line on both sides (removed lines hidden: no
 * pairs to mark).
 */
export function codeLines(
  file: ViewFile,
  wordDiff: boolean,
  showRemoved: boolean,
): { lines: string[]; removedWords: WordDiffs['removed'] | undefined } {
  if (!wordDiff || !showRemoved) return { lines: linesFromTokens(file), removedWords: undefined };
  const { diffs, lines } = fileWordDiffs(file);
  return { lines, removedWords: diffs.removed };
}

// Plain-text lines per file, split lazily once (search).
const sourceCache = new WeakMap<ViewFile, string[]>();
export function sourceLines(file: ViewFile): string[] {
  let lines = sourceCache.get(file);
  if (!lines) {
    lines = (file.source || '').split('\n');
    sourceCache.set(file, lines);
  }
  return lines;
}

const CAT_COLORS: Record<string, string> = {
  import: '#6ea8fe',
  comment: '#9099ab',
  guard: '#e9b04d',
  logging: '#b585f0',
  telemetry: '#4dd4c6',
  'error-boilerplate': '#f0716e',
  accessor: '#7bd88f',
  barrel: '#f28fd0',
  data: '#e0995a',
};
export function catColor(cat: string): string {
  return CAT_COLORS[cat] || '#e9b04d';
}

// Reader preferences persist per browser via localStorage.
export function readPref(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
export function writePref(key: string, value: string | number): void {
  try {
    localStorage.setItem(key, String(value));
  } catch {}
}

// Matched like the server matches them (glob.ts), so "hide tests" agrees with the summary's test units.
const testRegexes = compilePatterns(INITIAL_DATA.config.testFilePatterns);
export function isTestFile(path: string): boolean {
  return matchesAny(path, testRegexes);
}

/** What the viewed mark of a file is keyed by: its content, so a file that changes after it was ticked comes back unticked. */
const fileViewKeys = new WeakMap<ViewFile, string>();
export function fileViewKey(file: ViewFile): string {
  let key = fileViewKeys.get(file);
  if (!key) {
    // FNV-1a over the source and the removed lines
    const text = file.source + '\0' + JSON.stringify(file.removals || []);
    let hash = 0x811c9dc5;
    for (let index = 0; index < text.length; index++) hash = Math.imul(hash ^ text.charCodeAt(index), 0x01000193);
    key = file.file + '@' + (hash >>> 0).toString(36);
    fileViewKeys.set(file, key);
  }
  return key;
}

// changed files the diff lists but the viewer can't open: deleted, excluded, renamed
export function listedOnlyCount(data: ViewerPayload): number {
  return (data.deleted || []).length + (data.excluded || []).length + (data.renamed || []).length;
}

export function isDiffMode(data: ViewerPayload): boolean {
  return listedOnlyCount(data) > 0 || data.files.some((file) => (file.removals || []).length > 0 || file.status);
}

/** An element the state hides: inline, since the stylesheet sets most elements' display. */
export function hiddenStyle(hidden: boolean): CSSProperties | undefined {
  return hidden ? { display: 'none' } : undefined;
}

export { plural } from '../cli-app/text.ts';

export function baseName(path: string): string {
  return path.split('/').pop()!;
}

/**
 * Restart the flash animation on a row (repeated jumps to the same line flash again). After a
 * smooth scroll the blink starts late, once the row has arrived.
 */
export function flashRow(row: HTMLElement, smooth?: boolean): void {
  row.scrollIntoView({ block: 'center', behavior: smooth ? 'smooth' : 'auto' });
  row.classList.remove('flash', 'late');
  void row.offsetWidth;
  row.classList.add('flash');
  if (smooth) row.classList.add('late');
}

/** Remember the last result while the inputs stay the same (by identity): the
 * views' selectors get the same object back, and the work isn't redone. */
export function memo<Args extends unknown[], Result>(compute: (...args: Args) => Result): (...args: Args) => Result {
  let last: { args: Args; result: Result } | null = null;
  return (...args: Args) => {
    if (last && last.args.length === args.length && last.args.every((arg, index) => arg === args[index])) {
      return last.result;
    }
    const result = compute(...args);
    last = { args, result };
    return result;
  };
}
