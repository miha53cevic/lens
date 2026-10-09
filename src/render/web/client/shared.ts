// Helpers every part of the viewer shares.

import type { ViewerPayload } from "../server.ts";

export type ViewFile = ViewerPayload["files"][number];

/** The server's payload, injected into the page as JSON (see server.ts). */
export const INITIAL_DATA: ViewerPayload = JSON.parse(document.getElementById("lens-data")!.textContent!);

// Quotes too: the result also goes into attributes (data-id="…", title="…").
export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// Tokens come pre-computed from the backend (Shiki): per line, [text, color] pairs. Rows set
// these as HTML — far cheaper than an element per token on big files. A theme switch or a
// refresh brings new file objects, so the cache follows them.
const lineCache = new WeakMap<ViewFile, string[]>();
export function linesFromTokens(file: ViewFile): string[] {
  let lines = lineCache.get(file);
  if (!lines) {
    lines = Array.isArray(file.tokens) && file.tokens.length > 0
      ? file.tokens.map((line) =>
          line.map(([text, color]) =>
            color ? '<span style="color:' + color + '">' + escapeHtml(text) + "</span>" : escapeHtml(text),
          ).join(""))
      : file.source.split("\n").map(escapeHtml);
    lineCache.set(file, lines);
  }
  return lines;
}

// Plain-text lines per file, split lazily once (search).
const sourceCache = new WeakMap<ViewFile, string[]>();
export function sourceLines(file: ViewFile): string[] {
  let lines = sourceCache.get(file);
  if (!lines) { lines = (file.source || "").split("\n"); sourceCache.set(file, lines); }
  return lines;
}

const CAT_COLORS: Record<string, string> = {
  "import": "#6ea8fe",
  "comment": "#9099ab",
  "guard": "#e9b04d",
  "logging": "#b585f0",
  "telemetry": "#4dd4c6",
  "error-boilerplate": "#f0716e",
  "accessor": "#7bd88f",
  "barrel": "#f28fd0",
  "data": "#e0995a",
};
export function catColor(cat: string): string { return CAT_COLORS[cat] || "#e9b04d"; }

// Reader preferences persist per browser via localStorage.
export function readPref(key: string): string | null { try { return localStorage.getItem(key); } catch { return null; } }
export function writePref(key: string, value: string | number): void { try { localStorage.setItem(key, String(value)); } catch {} }

// Glob-ish test-file matcher: "*" = within a path segment, "**" = across
// segments; patterns match anywhere in the path ("*.spec.*", "__tests__/**").
const testRegexes = (INITIAL_DATA.testFilePatterns || []).map((pattern) => {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  const body = escaped.split("**").map((part) => part.replaceAll("*", "[^/]*")).join(".*");
  return new RegExp("(^|/)" + body + "$");
});
export function isTestFile(path: string): boolean {
  return testRegexes.some((r) => r.test(path));
}

/** What the viewed mark of a file is keyed by: its content, so a file that changes after it was ticked comes back unticked. */
const fileViewKeys = new WeakMap<ViewFile, string>();
export function fileViewKey(file: ViewFile): string {
  let key = fileViewKeys.get(file);
  if (!key) {
    // FNV-1a over the source and the removed lines
    const text = file.source + "\0" + JSON.stringify(file.removals || []);
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
    key = file.file + "@" + (h >>> 0).toString(36);
    fileViewKeys.set(file, key);
  }
  return key;
}

// changed files the diff lists but the viewer can't open: deleted, excluded, renamed
export function listedOnlyCount(data: ViewerPayload): number {
  return (data.deleted || []).length + (data.excluded || []).length + (data.renamed || []).length;
}

export function isDiffMode(data: ViewerPayload): boolean {
  return listedOnlyCount(data) > 0 || data.files.some((f) => (f.removals || []).length > 0 || f.status);
}

export function plural(n: number, word: string): string { return n + " " + word + (n === 1 ? "" : "s"); }

export function baseName(path: string): string { return path.split("/").pop()!; }

/** Restart the flash animation on a row (repeated jumps to the same line flash again). */
export function flashRow(row: HTMLElement, smooth?: boolean): void {
  row.scrollIntoView({ block: "center", behavior: smooth ? "smooth" : "auto" });
  row.classList.remove("flash");
  void row.offsetWidth;
  row.classList.add("flash");
}
